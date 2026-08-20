import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramReplyPort } from "../../src/application/ports/telegram";
import { processAiProposal } from "../../src/application/process-ai-proposal";
import { processInboundMessage } from "../../src/application/process-inbound";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import { createAiTestRuntime } from "../ai-helpers";
import { FakeClock, SequenceIds } from "../helpers";

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];

  send(_chatId: number | string, text: string): Promise<{ messageId: string }> {
    this.texts.push(text);
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

const telegramUserId = 7_501;

function envelope(
  updateId: number,
  text: string,
  options: { readonly forwarded?: boolean } = {},
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
        forwarded: options.forwarded ?? false,
      },
    },
  };
}

async function send(
  runtime: ReturnType<typeof createAiTestRuntime>,
  message: InboundMessageEnvelope,
): Promise<void> {
  await runtime.inbox.register(message, new Date());
  await processInboundMessage(message, runtime.inbound);
}

describe("C3 Inbox testuale", () => {
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
      env.DB.prepare("DELETE FROM list_undo_actions"),
      env.DB.prepare("DELETE FROM list_items"),
      env.DB.prepare("DELETE FROM lists"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM preference_undo_actions"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  async function configured(clock: FakeClock, reply: CapturingReply) {
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    await send(
      runtime,
      envelope(7_001, "/impostazioni imposta it Europe/Rome 24h EUR"),
    );
    return runtime;
  }

  it("trasforma il testo libero in proposte senza comando esplicito", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = await configured(clock, reply);

    await send(
      runtime,
      envelope(7_002, "ricordami di chiamare il dentista domani alle 9"),
    );
    expect(runtime.queue.published).toHaveLength(1);
    expect(runtime.queue.published[0]?.origin).toBe("inbox");
    // Il comando esplicito risponde subito; l'Inbox no.
    expect(reply.texts).toHaveLength(1);

    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);
    expect(reply.texts[1]).toContain("Promemoria creato");
    const reminders = await env.DB.prepare(
      "SELECT provenance FROM reminders",
    ).first<{ provenance: string }>();
    expect(reminders?.provenance).toBe("extracted");
  });

  it("instrada più intenti dello stesso messaggio verso domini diversi", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = await configured(clock, reply);

    await send(
      runtime,
      envelope(
        7_003,
        "ricordami di comprare il pane domani alle 9; aggiungi la task portare l'auto dal meccanico",
      ),
    );
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);

    const reminders = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM reminders",
    ).first<{ total: number }>();
    const tasks = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM tasks",
    ).first<{ total: number }>();
    expect(reminders?.total).toBe(1);
    expect(tasks?.total).toBe(1);

    // Idempotenza per singola proposta, non per messaggio.
    const effects = await env.DB.prepare(
      "SELECT effect_key FROM effects WHERE kind = 'ai_execution' ORDER BY effect_key",
    ).all<{ effect_key: string }>();
    expect(effects.results).toHaveLength(2);
    expect(effects.results[0]?.effect_key).toMatch(/:0$/u);
    expect(effects.results[1]?.effect_key).toMatch(/:1$/u);
  });

  it("resta in silenzio quando il testo non contiene una richiesta", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = await configured(clock, reply);

    await send(runtime, envelope(7_004, "grazie mille, sei stato utilissimo"));
    expect(runtime.queue.published).toHaveLength(1);
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);
    expect(reply.texts).toHaveLength(1);

    const job = await env.DB.prepare(
      "SELECT status FROM ai_proposal_jobs",
    ).first<{ status: string }>();
    expect(job?.status).toBe("completed");
  });

  it("ignora le reazioni brevi senza aprire un job", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = await configured(clock, reply);
    await send(runtime, envelope(7_005, "ok"));
    expect(runtime.queue.published).toHaveLength(0);
    expect(reply.texts).toHaveLength(1);
  });

  it("tratta un link come testo e non lo scarica", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = await configured(clock, reply);
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await send(
        runtime,
        envelope(
          7_006,
          "segna un appuntamento dal notaio domani alle 11 https://esempio.test/atto",
        ),
      );
      await processAiProposal(runtime.queue.envelope(), runtime.aiJob);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    const event = await env.DB.prepare(
      "SELECT title, provenance FROM events",
    ).first<{ title: string; provenance: string }>();
    expect(event?.title).toContain("https://esempio.test/atto");
    expect(event?.provenance).toBe("extracted");
  });

  it("registra la provenance di un messaggio inoltrato", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = await configured(clock, reply);
    await send(
      runtime,
      envelope(7_007, "ricordami di pagare la bolletta domani alle 10", {
        forwarded: true,
      }),
    );
    expect(runtime.queue.published[0]?.forwarded).toBe(true);
  });

  it("senza AI configurata il testo libero non riceve risposta", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      mode: "disabled",
    });
    await send(
      runtime,
      envelope(7_008, "/impostazioni imposta it Europe/Rome 24h EUR"),
    );
    await send(
      runtime,
      envelope(7_009, "ricordami di chiamare il dentista domani alle 9"),
    );
    expect(runtime.queue.published).toHaveLength(0);
    expect(reply.texts).toHaveLength(1);
  });
});
