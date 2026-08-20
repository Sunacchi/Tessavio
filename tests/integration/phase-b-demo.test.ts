import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { TelegramReplyPort } from "../../src/application/ports/telegram";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import { handleTelegramWebhook } from "../../src/entrypoints/webhook";
import {
  FakeClock,
  SequenceIds,
  telegramTextUpdate,
  testConfig,
  webhookRequest,
} from "../helpers";

class CapturingQueue implements Queue {
  readonly messages: unknown[] = [];

  metrics(): Promise<QueueMetrics> {
    return Promise.resolve({
      backlogCount: this.messages.length,
      backlogBytes: 0,
    });
  }

  send(message: unknown): Promise<QueueSendResponse> {
    this.messages.push(message);
    return Promise.resolve({
      metadata: {
        metrics: { backlogCount: this.messages.length, backlogBytes: 0 },
      },
    });
  }

  sendBatch(
    messages: Iterable<MessageSendRequest>,
  ): Promise<QueueSendBatchResponse> {
    for (const message of messages) this.messages.push(message.body);
    return Promise.resolve({
      metadata: {
        metrics: { backlogCount: this.messages.length, backlogBytes: 0 },
      },
    });
  }
}

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];
  readonly documents: {
    readonly fileName: string;
    readonly content: string;
  }[] = [];

  send(
    _chatId: number | string,
    text: string,
  ): Promise<{ readonly messageId: string }> {
    this.texts.push(text);
    return Promise.resolve({ messageId: `text-${String(this.texts.length)}` });
  }

  sendDocument(
    _chatId: number | string,
    document: {
      readonly fileName: string;
      readonly mimeType: "text/csv";
      readonly content: string;
      readonly caption: string;
    },
  ): Promise<{ readonly messageId: string }> {
    this.documents.push({
      fileName: document.fileName,
      content: document.content,
    });
    return Promise.resolve({
      messageId: `document-${String(this.documents.length)}`,
    });
  }
}

async function resetDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM notification_deliveries"),
    env.DB.prepare("DELETE FROM reminder_recurrence_occurrences"),
    env.DB.prepare("DELETE FROM reminder_recurrence_undo_actions"),
    env.DB.prepare("DELETE FROM reminder_undo_actions"),
    env.DB.prepare("DELETE FROM reminders"),
    env.DB.prepare("DELETE FROM reminder_recurrences"),
    env.DB.prepare("DELETE FROM list_undo_actions"),
    env.DB.prepare("DELETE FROM list_items"),
    env.DB.prepare("DELETE FROM notes"),
    env.DB.prepare("DELETE FROM lists"),
    env.DB.prepare("DELETE FROM finance_undo_actions"),
    env.DB.prepare("DELETE FROM finance_entries"),
    env.DB.prepare("DELETE FROM work_undo_actions"),
    env.DB.prepare("DELETE FROM work_breaks"),
    env.DB.prepare("DELETE FROM work_logs"),
    env.DB.prepare("DELETE FROM planned_shifts"),
    env.DB.prepare("DELETE FROM work_rules"),
    env.DB.prepare("DELETE FROM task_undo_actions"),
    env.DB.prepare("DELETE FROM tasks"),
    env.DB.prepare("DELETE FROM event_undo_actions"),
    env.DB.prepare("DELETE FROM events"),
    env.DB.prepare("DELETE FROM preference_undo_actions"),
    env.DB.prepare("DELETE FROM user_preferences"),
    env.DB.prepare("DELETE FROM audit_log"),
    env.DB.prepare("DELETE FROM deliveries"),
    env.DB.prepare("DELETE FROM effects"),
    env.DB.prepare("DELETE FROM telegram_identities"),
    env.DB.prepare("DELETE FROM inbound_updates"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM ingress_rate_limits"),
    env.DB.prepare("DELETE FROM webhook_concurrency_leases"),
  ]);
}

describe("Phase B deterministic end-to-end demo", () => {
  beforeEach(resetDatabase);

  it("runs B1-B7 through Telegram, Queue and D1 with no AI provider", async () => {
    const clock = new FakeClock();
    const ids = new SequenceIds();
    const inbound = new CapturingQueue();
    const notifications = new CapturingQueue();
    const reply = new CapturingReply();
    // NO_AI end-to-end: la demo gira con **zero** variabili AI, quindi nessuna
    // slice AI viene registrata. Il cast è il confine fra l'oggetto Env
    // generato da Wrangler e questa copia filtrata.
    const withoutAi = Object.fromEntries(
      Object.entries(env).filter(([key]) => !key.startsWith("AI_")),
    ) as unknown as Env;
    const runtime: Env = {
      ...withoutAi,
      INBOUND_QUEUE: inbound,
      NOTIFICATION_QUEUE: notifications,
      TELEGRAM_BOT_TOKEN: "test-bot-token",
      TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
    };
    expect(Object.keys(runtime).filter((key) => key.startsWith("AI_"))).toEqual(
      [],
    );
    expect("OPENROUTER_API_KEY" in runtime).toBe(false);

    let updateId = 90_000;
    const sendCommand = async (command: string): Promise<string | null> => {
      const textCount = reply.texts.length;
      const response = await handleTelegramWebhook(
        webhookRequest(telegramTextUpdate(command, updateId, 9_001)),
        runtime,
        testConfig,
        { clock, ids },
      );
      expect(response.status).toBe(200);
      const envelope = inbound.messages.at(-1);
      if (envelope === undefined) throw new Error("missing inbound envelope");
      await handleInboundQueue(
        createMessageBatch("tessavio-inbound-dev", [
          {
            id: `phase-b-${String(updateId)}`,
            timestamp: clock.now(),
            attempts: 1,
            body: envelope,
          },
        ]),
        runtime,
        { clock, ids, reply },
      );
      updateId += 1;
      return reply.texts[textCount] ?? null;
    };

    expect(await sendCommand("/start")).toContain(
      "Il nucleo deterministico è attivo e funziona senza AI",
    );
    expect(
      await sendCommand("/impostazioni imposta it Europe/Rome 24h EUR"),
    ).toContain("Impostazioni salvate");
    expect(
      await sendCommand(
        "/evento crea ora 2026-08-08T11:00 2026-08-08T12:00 | Evento demo",
      ),
    ).toContain("Evento creato");
    expect(
      await sendCommand("/promemoria crea 2026-08-08T10:05 | Promemoria demo"),
    ).toContain("Promemoria creato");
    expect(
      await sendCommand("/task crea 2026-08-08 | alta | Task demo"),
    ).toContain("Task creata");

    expect(
      await sendCommand("/lavoro regola crea non_retribuita | Regola demo"),
    ).toContain("Elemento lavoro creato");
    const rule = await env.DB.prepare(
      "SELECT id FROM work_rules WHERE name = 'Regola demo'",
    ).first<{ id: string }>();
    if (rule === null) throw new Error("missing work rule fixture");
    expect(
      await sendCommand(
        "/lavoro turno crea 2026-08-08T10:30 2026-08-08T12:30 | Turno demo",
      ),
    ).toContain("Elemento lavoro creato");
    expect(
      await sendCommand(
        `/lavoro consuntivo crea 2026-08-08T07:00 2026-08-08T08:00 ${rule.id} | Consuntivo demo`,
      ),
    ).toContain("Elemento lavoro creato");
    const workLog = await env.DB.prepare(
      "SELECT id FROM work_logs WHERE title = 'Consuntivo demo'",
    ).first<{ id: string }>();
    if (workLog === null) throw new Error("missing work log fixture");
    expect(
      await sendCommand(
        `/lavoro pausa crea ${workLog.id} 2026-08-08T07:15 2026-08-08T07:30`,
      ),
    ).toContain("Elemento lavoro creato");

    expect(
      await sendCommand(
        "/finanze crea spesa 1250 EUR 2026-08-08 | Spesa demo | Negozio | Carta | E2E",
      ),
    ).toContain("Movimento creato");
    expect(await sendCommand("/liste crea | Lista demo")).toContain(
      "Lista creata",
    );
    const list = await env.DB.prepare(
      "SELECT id FROM lists WHERE title = 'Lista demo'",
    ).first<{ id: string }>();
    if (list === null) throw new Error("missing list fixture");
    expect(
      await sendCommand(`/liste aggiungi ${list.id} | Elemento demo`),
    ).toContain("Item aggiunto");
    expect(
      await sendCommand("/note crea | Nota demo | Contenuto demo"),
    ).toContain("Nota creata");
    const recurrenceReply = await sendCommand(
      "/promemoria ricorrente giornaliero 2026-08-08T10:10 | Ricorrenza demo",
    );
    expect(recurrenceReply).toContain("Ricorrenza creata");

    const today = await sendCommand("/oggi");
    expect(today).toContain("Eventi:");
    expect(today).toContain("Evento demo");
    expect(today).toContain("Task:");
    expect(today).toContain("Task demo");
    expect(today).toContain("Promemoria:");
    expect(today).toContain("Promemoria demo");
    expect(today).toContain("Turni pianificati:");
    expect(today).toContain("Turno demo");

    expect(await sendCommand("/lavoro giorno 2026-08-08")).toContain(
      "Consuntivo demo",
    );
    expect(
      await sendCommand("/finanze totali 2026-08-08 2026-08-08"),
    ).toContain("Spese: 1250 unità minori");
    expect(await sendCommand(`/liste leggi ${list.id}`)).toContain(
      "Elemento demo",
    );
    expect(await sendCommand("/note lista")).toContain("Nota demo");
    expect(await sendCommand("/promemoria ricorrenze")).toContain(
      "Ricorrenza demo",
    );

    const report = await sendCommand("/report 2026-08-08 2026-08-08");
    expect(report).toContain("Formula: base-report-v1");
    expect(report).toContain("Finanze EUR: entrate 0, spese 1250");
    expect(await sendCommand("/report csv 2026-08-08 2026-08-08")).toBeNull();
    expect(reply.documents).toHaveLength(1);
    expect(reply.documents[0]?.fileName).toBe(
      "tessavio-report-2026-08-08-2026-08-08.csv",
    );
    expect(reply.documents[0]?.content).toContain("base-report-v1");

    const undoToken = recurrenceReply?.match(/\/annulla\s+(\S+)/u)?.[1];
    if (undoToken === undefined)
      throw new Error("missing recurrence Undo token");
    expect(await sendCommand(`/annulla ${undoToken}`)).toContain(
      "Creazione ricorrenza annullata",
    );

    const stored = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM events) AS events,
        (SELECT COUNT(*) FROM reminders) AS reminders,
        (SELECT COUNT(*) FROM tasks) AS tasks,
        (SELECT COUNT(*) FROM work_logs) AS work_logs,
        (SELECT COUNT(*) FROM finance_entries) AS finance_entries,
        (SELECT COUNT(*) FROM lists) AS lists,
        (SELECT COUNT(*) FROM notes) AS notes`,
    ).first<Record<string, number>>();
    expect(stored).toEqual({
      users: 1,
      events: 1,
      reminders: 1,
      tasks: 1,
      work_logs: 1,
      finance_entries: 1,
      lists: 1,
      notes: 1,
    });
  });
});
