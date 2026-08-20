import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  AiProviderPort,
  AiProviderResult,
} from "../../src/application/ports/ai";
import type { TelegramReplyPort } from "../../src/application/ports/telegram";
import { processAiProposal } from "../../src/application/process-ai-proposal";
import { processInboundMessage } from "../../src/application/process-inbound";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import { MockAiProvider } from "../../src/infrastructure/ai/mock-provider";
import { createAiTestRuntime } from "../ai-helpers";
import { FakeClock, SequenceIds } from "../helpers";

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];

  send(_chatId: number | string, text: string): Promise<{ messageId: string }> {
    this.texts.push(text);
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

/** Provider che dichiara un costo e cede il controllo, per provare la corsa. */
class CostingProvider implements AiProviderPort {
  calls = 0;

  constructor(
    private readonly costMicros: number,
    private readonly inner = new MockAiProvider(),
  ) {}

  async propose(
    request: Parameters<AiProviderPort["propose"]>[0],
  ): Promise<AiProviderResult> {
    this.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await this.inner.propose(request);
    return { ...result, costMicros: this.costMicros };
  }
}

function envelope(
  updateId: number,
  text: string,
  telegramUserId = 6_101,
  sentAtUnix = Date.parse("2026-08-20T08:00:00Z") / 1_000,
): InboundMessageEnvelope {
  return {
    version: 1,
    type: "INBOUND_MESSAGE",
    jobId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    idempotencyKey: `telegram-update:${String(updateId)}`,
    createdAt: new Date(sentAtUnix * 1_000).toISOString(),
    attempt: 0,
    payload: {
      updateId,
      message: {
        messageId: updateId,
        sentAtUnix,
        sender: { id: telegramUserId, isBot: false },
        chat: { id: telegramUserId, type: "private" },
        text,
        forwarded: false,
      },
    },
  };
}

describe("C2.4 budget con prenotazione atomica", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ai_budget_entries"),
      env.DB.prepare("DELETE FROM ai_proposal_confirmations"),
      env.DB.prepare("DELETE FROM ai_proposal_jobs"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM reminder_undo_actions"),
      env.DB.prepare("DELETE FROM reminders"),
      env.DB.prepare("DELETE FROM event_undo_actions"),
      env.DB.prepare("DELETE FROM events"),
      env.DB.prepare("DELETE FROM task_undo_actions"),
      env.DB.prepare("DELETE FROM tasks"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM preference_undo_actions"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  it("con budget per una sola operazione chiama il modello una volta sola", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const provider = new CostingProvider(4_000);
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      provider,
      maxCostMicros: 5_000,
      dailyBudgetMicros: 5_000,
    });

    const preference = envelope(
      6_001,
      "/impostazioni imposta it Europe/Rome 24h EUR",
    );
    await runtime.inbox.register(preference, clock.now());
    await processInboundMessage(preference, runtime.inbound);

    for (const [index, text] of [
      "/ai proponi ricordami di chiamare il dentista domani alle 9",
      "/ai proponi ricordami di comprare il pane domani alle 10",
    ].entries()) {
      const message = envelope(6_002 + index, text);
      await runtime.inbox.register(message, clock.now());
      await processInboundMessage(message, runtime.inbound);
    }
    expect(runtime.queue.published).toHaveLength(2);

    await Promise.all([
      processAiProposal(runtime.queue.envelope(0), runtime.aiJob),
      processAiProposal(runtime.queue.envelope(1), runtime.aiJob),
    ]);

    expect(provider.calls).toBe(1);
    const exhausted = reply.texts.filter((text) =>
      text.includes("Budget AI giornaliero esaurito"),
    );
    expect(exhausted).toHaveLength(1);
    const reminders = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM reminders",
    ).first<{ total: number }>();
    expect(reminders?.total).toBe(1);
  });

  it("chiude la prenotazione col costo reale del provider", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      provider: new CostingProvider(1_234),
      maxCostMicros: 5_000,
      dailyBudgetMicros: 50_000,
    });
    const preference = envelope(
      6_101,
      "/impostazioni imposta it Europe/Rome 24h EUR",
    );
    await runtime.inbox.register(preference, clock.now());
    await processInboundMessage(preference, runtime.inbound);
    const request = envelope(
      6_102,
      "/ai proponi ricordami di chiamare il dentista domani alle 9",
    );
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);

    const entry = await env.DB.prepare(
      "SELECT status, reserved_micros, actual_micros, local_date FROM ai_budget_entries",
    ).first<{
      status: string;
      reserved_micros: number;
      actual_micros: number;
      local_date: string;
    }>();
    expect(entry).toEqual({
      status: "settled",
      reserved_micros: 5_000,
      actual_micros: 1_234,
      local_date: "2026-08-20",
    });
  });

  it("rilascia una prenotazione rimasta appesa invece di bloccare il budget", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      maxCostMicros: 5_000,
      dailyBudgetMicros: 5_000,
    });
    await env.DB.prepare(
      "INSERT INTO users (id, status, created_at) VALUES ('orfano', 'active', ?)",
    )
      .bind(clock.now().getTime())
      .run();
    await runtime.budget.reserve(
      { userId: "orfano" },
      "ai-budget:crash",
      "2026-08-20",
      5_000,
      5_000,
      clock.now(),
    );
    await expect(
      runtime.budget.spentMicros({ userId: "orfano" }, "2026-08-20"),
    ).resolves.toBe(5_000);

    clock.advance(2 * 60 * 60 * 1_000);
    const released = await runtime.budget.releaseStale(
      new Date(clock.now().getTime() - 60 * 60 * 1_000),
      200,
    );
    expect(released).toBe(1);
    await expect(
      runtime.budget.spentMicros({ userId: "orfano" }, "2026-08-20"),
    ).resolves.toBe(0);
  });

  it("riapre una prenotazione rilasciata e contabilizza ogni chiamata", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      maxCostMicros: 5_000,
      dailyBudgetMicros: 12_000,
    });
    await env.DB.prepare(
      "INSERT INTO users (id, status, created_at) VALUES ('ripetuto', 'active', ?)",
    )
      .bind(clock.now().getTime())
      .run();
    const scope = { userId: "ripetuto" };

    // Primo tentativo: la chiamata fallisce e la prenotazione viene rilasciata.
    await runtime.budget.reserve(
      scope,
      "ai-budget:job-x",
      "2026-08-20",
      5_000,
      12_000,
      clock.now(),
    );
    await runtime.budget.release(scope, "ai-budget:job-x", clock.now());
    await expect(runtime.budget.spentMicros(scope, "2026-08-20")).resolves.toBe(
      0,
    );

    // Il retry riapre la stessa riga invece di procedere senza prenotazione.
    await expect(
      runtime.budget.reserve(
        scope,
        "ai-budget:job-x",
        "2026-08-20",
        5_000,
        12_000,
        clock.now(),
      ),
    ).resolves.toEqual({ outcome: "reserved" });
    await runtime.budget.settle(scope, "ai-budget:job-x", 4_000, clock.now());

    // Una seconda chiamata sullo stesso job resta contabilizzata: costa denaro
    // reale anche quando la riga era già chiusa.
    await runtime.budget.settle(scope, "ai-budget:job-x", 1_500, clock.now());
    await expect(runtime.budget.spentMicros(scope, "2026-08-20")).resolves.toBe(
      5_500,
    );
  });

  it("non riapre una prenotazione se il tetto del giorno è esaurito", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    await env.DB.prepare(
      "INSERT INTO users (id, status, created_at) VALUES ('pieno', 'active', ?)",
    )
      .bind(clock.now().getTime())
      .run();
    const scope = { userId: "pieno" };
    await runtime.budget.reserve(
      scope,
      "ai-budget:job-y",
      "2026-08-20",
      5_000,
      5_000,
      clock.now(),
    );
    await runtime.budget.release(scope, "ai-budget:job-y", clock.now());
    await runtime.budget.reserve(
      scope,
      "ai-budget:job-z",
      "2026-08-20",
      5_000,
      5_000,
      clock.now(),
    );

    await expect(
      runtime.budget.reserve(
        scope,
        "ai-budget:job-y",
        "2026-08-20",
        5_000,
        5_000,
        clock.now(),
      ),
    ).resolves.toMatchObject({ outcome: "duplicate" });
  });

  it("senza chiave collegata non chiama il provider e lo dice", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const provider = new CostingProvider(4_000);
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      provider,
      requiresCredential: true,
    });
    const preference = envelope(
      6_201,
      "/impostazioni imposta it Europe/Rome 24h EUR",
    );
    await runtime.inbox.register(preference, clock.now());
    await processInboundMessage(preference, runtime.inbound);
    const request = envelope(6_202, "/ai proponi che cosa ho oggi");
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);

    expect(provider.calls).toBe(0);
    expect(reply.texts[reply.texts.length - 1]).toContain(
      "Nessuna chiave collegata",
    );
    const entries = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM ai_budget_entries",
    ).first<{ total: number }>();
    expect(entries?.total).toBe(0);
  });
});
