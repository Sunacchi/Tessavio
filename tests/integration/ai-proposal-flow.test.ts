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
import { aiProposalSchemaVersion } from "../../src/domains/ai/proposal";
import { MockAiProvider } from "../../src/infrastructure/ai/mock-provider";
import { AppError } from "../../src/shared/errors";
import { createAiTestRuntime } from "../ai-helpers";
import { FakeClock, SequenceIds } from "../helpers";

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];

  send(_chatId: number | string, text: string): Promise<{ messageId: string }> {
    this.texts.push(text);
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

/** Provider che conta le chiamate: prova che un retry non richiama il modello. */
class CountingProvider implements AiProviderPort {
  calls = 0;
  readonly payloads: unknown[] = [];

  constructor(private readonly inner: AiProviderPort) {}

  propose(
    request: Parameters<AiProviderPort["propose"]>[0],
  ): Promise<AiProviderResult> {
    this.calls += 1;
    this.payloads.push(request.context);
    return this.inner.propose(request);
  }
}

const telegramUserId = 9_301;

function envelope(
  updateId: number,
  text: string,
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

async function configurePreferences(
  runtime: ReturnType<typeof createAiTestRuntime>,
  updateId: number,
): Promise<void> {
  const message = envelope(
    updateId,
    "/impostazioni imposta it Europe/Rome 24h EUR",
  );
  await runtime.inbox.register(message, new Date());
  await processInboundMessage(message, runtime.inbound);
}

describe("C1 flusso ActionProposal con provider mock", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ai_proposal_confirmations"),
      env.DB.prepare("DELETE FROM ai_proposal_jobs"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM event_undo_actions"),
      env.DB.prepare("DELETE FROM events"),
      env.DB.prepare("DELETE FROM task_undo_actions"),
      env.DB.prepare("DELETE FROM tasks"),
      env.DB.prepare("DELETE FROM reminder_undo_actions"),
      env.DB.prepare("DELETE FROM reminders"),
      env.DB.prepare("DELETE FROM preference_undo_actions"),
      env.DB.prepare("DELETE FROM finance_undo_actions"),
      env.DB.prepare("DELETE FROM finance_entries"),
      env.DB.prepare("DELETE FROM list_undo_actions"),
      env.DB.prepare("DELETE FROM list_items"),
      env.DB.prepare("DELETE FROM lists"),
      env.DB.prepare("DELETE FROM notes"),
      env.DB.prepare("DELETE FROM work_undo_actions"),
      env.DB.prepare("DELETE FROM planned_shifts"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  it("crea un evento da testo libero e lo marca come estratto", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    await configurePreferences(runtime, 9_001);

    const request = envelope(
      9_002,
      "/ai proponi segna un appuntamento dal dentista domani alle 15 alle 16",
    );
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    expect(reply.texts[1]).toContain("Sto elaborando");
    expect(runtime.queue.published).toHaveLength(1);

    const result = await processAiProposal(
      runtime.queue.envelope(),
      runtime.aiJob,
    );
    expect(result.outcome).toBe("completed");
    expect(reply.texts[2]).toContain("Ho capito questo:");
    expect(reply.texts[2]).toContain("Evento creato.");

    const stored = await env.DB.prepare(
      "SELECT title, provenance, start_at_utc FROM events",
    ).all<{ title: string; provenance: string; start_at_utc: number }>();
    expect(stored.results).toHaveLength(1);
    expect(stored.results[0]?.provenance).toBe("extracted");
    expect(new Date(stored.results[0]?.start_at_utc ?? 0).toISOString()).toBe(
      "2026-08-21T13:00:00.000Z",
    );

    const audit = await env.DB.prepare(
      "SELECT action, idempotency_key FROM audit_log WHERE entity_type = 'event'",
    ).all<{ action: string; idempotency_key: string }>();
    expect(audit.results[0]?.action).toBe("event.created");
    expect(audit.results[0]?.idempotency_key).toContain("ai-exec:");
  });

  it("non richiama il modello e non riscrive quando il job viene ritentato", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const provider = new CountingProvider(new MockAiProvider());
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      provider,
    });
    await configurePreferences(runtime, 9_101);

    const request = envelope(
      9_102,
      "/ai proponi ricordami di chiamare il dentista domani alle 9",
    );
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);

    const job = runtime.queue.envelope();
    await processAiProposal(job, runtime.aiJob);
    const second = await processAiProposal(job, runtime.aiJob);

    expect(second.outcome).toBe("duplicate");
    expect(provider.calls).toBe(1);
    const reminders = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM reminders",
    ).first<{ total: number }>();
    expect(reminders?.total).toBe(1);
  });

  it("riprende dal piano persistito quando il lease scade a metà elaborazione", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const slowProvider: AiProviderPort = {
      propose: () => Promise.reject(new AppError("RETRYABLE_EXTERNAL", true)),
    };
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      leaseSeconds: 60,
    });
    await configurePreferences(runtime, 9_201);
    const request = envelope(
      9_202,
      "/ai proponi aggiungi la task relazione trimestrale",
    );
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    const job = runtime.queue.envelope();

    // Primo tentativo: il piano viene persistito e la task creata.
    await processAiProposal(job, runtime.aiJob);
    const tasksAfterFirst = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM tasks",
    ).first<{ total: number }>();
    expect(tasksAfterFirst?.total).toBe(1);

    // Il job risulta ancora in lavorazione e il lease è scaduto: la ripresa
    // rilegge il piano invece di richiamare il provider, che qui fallirebbe.
    await env.DB.prepare(
      "UPDATE ai_proposal_jobs SET status = 'planned', lease_expires_at = 1",
    ).run();
    clock.advance(120_000);
    const resumed = await processAiProposal(job, {
      ...runtime.aiJob,
      provider: slowProvider,
    });
    expect(resumed.outcome).toBe("completed");
    const tasksAfterResume = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM tasks",
    ).first<{ total: number }>();
    expect(tasksAfterResume?.total).toBe(1);
  });

  it("chiede conferma prima di annullare e la esegue solo con il token", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    await configurePreferences(runtime, 9_301);
    const create = envelope(
      9_302,
      "/evento crea ora 2026-08-21T10:00 2026-08-21T11:00 | Riunione con Marco",
    );
    await runtime.inbox.register(create, clock.now());
    await processInboundMessage(create, runtime.inbound);

    const request = envelope(
      9_303,
      "/ai proponi annulla l'appuntamento riunione con marco",
    );
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);

    const preview = reply.texts[reply.texts.length - 1] ?? "";
    expect(preview).toContain("Confermi? /ai conferma aic_");
    const active = await env.DB.prepare("SELECT status FROM events").first<{
      status: string;
    }>();
    expect(active?.status).toBe("active");

    const token = /\/ai conferma (aic_[A-Za-z0-9_-]+)/u.exec(preview)?.[1];
    expect(token).toBeDefined();
    const confirm = envelope(9_304, `/ai conferma ${token ?? ""}`);
    await runtime.inbox.register(confirm, clock.now());
    await processInboundMessage(confirm, runtime.inbound);
    expect(reply.texts[reply.texts.length - 1]).toContain("Evento annullato.");

    const cancelled = await env.DB.prepare("SELECT status FROM events").first<{
      status: string;
    }>();
    expect(cancelled?.status).toBe("cancelled");

    // Il token è single-use: un secondo tentativo non riesegue nulla.
    const replay = envelope(9_305, `/ai conferma ${token ?? ""}`);
    await runtime.inbox.register(replay, clock.now());
    await processInboundMessage(replay, runtime.inbound);
    expect(reply.texts[reply.texts.length - 1]).toContain("già usata");
  });

  it("manda al provider solo il contesto minimo", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const { MockAiProvider } =
      await import("../../src/infrastructure/ai/mock-provider");
    const provider = new CountingProvider(new MockAiProvider());
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      provider,
    });
    await configurePreferences(runtime, 9_401);
    const create = envelope(
      9_402,
      "/evento crea ora 2026-08-21T10:00 2026-08-21T11:00 | Riunione riservata",
    );
    await runtime.inbox.register(create, clock.now());
    await processInboundMessage(create, runtime.inbound);

    const request = envelope(9_403, "/ai proponi che cosa ho oggi");
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);

    const payload = provider.payloads[0];
    expect(Object.keys(payload as object).sort()).toEqual([
      "enabledActions",
      "localDate",
      "messageText",
      "timeZone",
    ]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("Riunione riservata");
    expect(serialized).not.toContain(String(telegramUserId));
    expect(serialized).not.toMatch(/00000000-0000-4000-8000-/u);
  });

  it("risponde che l'AI non è configurata quando manca il provider", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      mode: "disabled",
    });
    await configurePreferences(runtime, 9_501);
    const request = envelope(9_502, "/ai proponi ricordami qualcosa domani");
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);

    expect(reply.texts[1]).toContain("AI non configurata");
    expect(runtime.queue.published).toHaveLength(0);

    const status = envelope(9_503, "/ai");
    await runtime.inbox.register(status, clock.now());
    await processInboundMessage(status, runtime.inbound);
    expect(reply.texts[2]).toContain("Modalità AI: non configurata.");
  });

  it("registra un movimento estratto in unità minori e lo marca come tale", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    await configurePreferences(runtime, 9_701);
    const request = envelope(
      9_702,
      "/ai proponi ho speso 12,50 euro per la spesa",
    );
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);

    const entry = await env.DB.prepare(
      "SELECT amount_minor, currency, entry_kind, category, source FROM finance_entries",
    ).first<{
      amount_minor: number;
      currency: string;
      entry_kind: string;
      category: string;
      source: string;
    }>();
    expect(entry).toEqual({
      amount_minor: 1_250,
      currency: "EUR",
      entry_kind: "expense",
      category: "spesa",
      source: "ai_proposal",
    });
  });

  it("aggiunge un elemento alla lista esistente e lo marca come estratto", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    await configurePreferences(runtime, 9_801);
    const createList = envelope(9_802, "/liste crea | Spesa");
    await runtime.inbox.register(createList, clock.now());
    await processInboundMessage(createList, runtime.inbound);

    const request = envelope(
      9_803,
      "/ai proponi aggiungi il latte alla lista spesa",
    );
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);

    const item = await env.DB.prepare(
      "SELECT text, source, status FROM list_items",
    ).first<{ text: string; source: string; status: string }>();
    expect(item).toEqual({
      text: "il latte",
      source: "ai_proposal",
      status: "open",
    });
    const list = await env.DB.prepare("SELECT source FROM lists").first<{
      source: string;
    }>();
    expect(list?.source).toBe("manual_command");
  });

  it("registra il piano con la versione di schema e di policy", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    await configurePreferences(runtime, 9_601);
    const request = envelope(9_602, "/ai proponi che cosa ho oggi");
    await runtime.inbox.register(request, clock.now());
    await processInboundMessage(request, runtime.inbound);
    await processAiProposal(runtime.queue.envelope(), runtime.aiJob);

    const row = await env.DB.prepare(
      "SELECT schema_version, policy_version, status FROM ai_proposal_jobs",
    ).first<{
      schema_version: string;
      policy_version: string;
      status: string;
    }>();
    expect(row).toEqual({
      schema_version: aiProposalSchemaVersion,
      policy_version: "c1-policy-v1",
      status: "completed",
    });
  });
});
