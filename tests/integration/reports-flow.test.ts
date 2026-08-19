import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { manageReports } from "../../src/application/manage-reports";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import type { TelegramReplyPort } from "../../src/application/ports";
import { processInboundMessage } from "../../src/application/process-inbound";
import { D1DeliveryRepository } from "../../src/infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../../src/infrastructure/db/effect-repository";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1FinanceRepository } from "../../src/infrastructure/db/finance-repository";
import { D1IdentityRepository } from "../../src/infrastructure/db/identity-repository";
import { D1InboundRepository } from "../../src/infrastructure/db/inbound-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1TaskRepository } from "../../src/infrastructure/db/task-repository";
import { D1ReminderRepository } from "../../src/infrastructure/db/reminder-repository";
import { D1WorkRepository } from "../../src/infrastructure/db/work-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { FakeClock, SequenceIds } from "../helpers";

const now = new Date("2026-08-19T12:00:00.000Z").getTime();

class CapturingReply implements TelegramReplyPort {
  readonly documents: {
    readonly fileName: string;
    readonly content: string;
  }[] = [];

  send(): Promise<{ readonly messageId: string }> {
    return Promise.resolve({ messageId: "text" });
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
    this.documents.push(document);
    return Promise.resolve({ messageId: "document" });
  }
}

function envelope(updateId: number): InboundMessageEnvelope {
  return {
    version: 1,
    type: "INBOUND_MESSAGE",
    jobId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    idempotencyKey: `telegram-update:${String(updateId)}`,
    createdAt: new Date(now).toISOString(),
    attempt: 0,
    payload: {
      updateId,
      message: {
        messageId: updateId,
        sentAtUnix: now / 1_000,
        sender: { id: 9001, isBot: false },
        chat: { id: 9001, type: "private" },
        text: "/report csv 2026-08-19 2026-08-20",
      },
    },
  };
}

async function seedReportFixtures(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, status, created_at) VALUES ('report-a', 'active', ?)",
    ).bind(now),
    env.DB.prepare(
      "INSERT INTO users (id, status, created_at) VALUES ('report-b', 'active', ?)",
    ).bind(now),
    env.DB.prepare(
      "INSERT INTO telegram_identities (telegram_user_id, user_id, linked_at) VALUES ('9001', 'report-a', ?)",
    ).bind(now),
    env.DB.prepare(
      `INSERT INTO user_preferences (
        user_id, language, time_zone, hour_format, default_currency,
        quiet_hours_start_minute, quiet_hours_end_minute, version,
        last_mutation_key, created_at, updated_at
      ) VALUES ('report-a', 'it', 'Europe/Rome', '24h', 'EUR', NULL, NULL, 1,
                'pref-a', ?, ?)`,
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO events (
        id, user_id, event_kind, title, local_date, start_at_utc, end_at_utc,
        time_zone, status, version, last_mutation_key, created_at, updated_at,
        cancelled_at
      ) VALUES ('event-a', 'report-a', 'date_only', '=FORMULA', '2026-08-19',
                NULL, NULL, NULL, 'active', 1, 'event-a-key', ?, ?, NULL)`,
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO events (
        id, user_id, event_kind, title, local_date, start_at_utc, end_at_utc,
        time_zone, status, version, last_mutation_key, created_at, updated_at,
        cancelled_at
      ) VALUES ('event-b', 'report-b', 'date_only', 'Private B', '2026-08-19',
                NULL, NULL, NULL, 'active', 1, 'event-b-key', ?, ?, NULL)`,
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO tasks (
        id, user_id, title, priority, due_kind, due_date_local, due_at_utc,
        time_zone, status, version, last_mutation_key, created_at, updated_at,
        completed_at
      ) VALUES ('task-a', 'report-a', 'Task A', 'high', 'date_only',
                '2026-08-20', NULL, NULL, 'open', 1, 'task-a-key', ?, ?, NULL)`,
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO tasks (
        id, user_id, title, priority, due_kind, due_date_local, due_at_utc,
        time_zone, status, version, last_mutation_key, created_at, updated_at,
        completed_at
      ) VALUES ('task-done-a', 'report-a', 'Task completata A', 'medium',
                'date_only', '2026-08-20', NULL, NULL, 'completed', 2,
                'task-done-a-key', ?, ?, ?)`,
    ).bind(now, now, now),
    env.DB.prepare(
      `INSERT INTO planned_shifts (
        id, user_id, title, start_at_utc, end_at_utc, original_time_zone,
        version, last_mutation_key, created_at, updated_at
      ) VALUES ('shift-a', 'report-a', 'Turno A', ?, ?, 'Europe/Rome', 1,
                'shift-a-key', ?, ?)`,
    ).bind(
      new Date("2026-08-19T06:00:00.000Z").getTime(),
      new Date("2026-08-19T08:00:00.000Z").getTime(),
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO finance_entries (
        id, user_id, entry_kind, amount_minor, currency, local_date, category,
        merchant, payment_method, note, source, status, version,
        last_mutation_key, created_at, updated_at, deleted_at
      ) VALUES ('finance-a', 'report-a', 'expense', 1250, 'EUR', '2026-08-19',
                'Casa', NULL, NULL, NULL, 'manual_command', 'active', 1,
                'finance-a-key', ?, ?, NULL)`,
    ).bind(now, now),
    env.DB.prepare(
      `INSERT INTO finance_entries (
        id, user_id, entry_kind, amount_minor, currency, local_date, category,
        merchant, payment_method, note, source, status, version,
        last_mutation_key, created_at, updated_at, deleted_at
      ) VALUES ('finance-b', 'report-b', 'income', 999999, 'EUR', '2026-08-19',
                'Private B', NULL, NULL, NULL, 'manual_command', 'active', 1,
                'finance-b-key', ?, ?, NULL)`,
    ).bind(now, now),
  ]);
}

function dependencies() {
  return {
    authorizer: new SelfScopeAuthorizer(),
    events: new D1EventRepository(env.DB),
    finance: new D1FinanceRepository(env.DB),
    preferences: new D1PreferenceRepository(env.DB),
    tasks: new D1TaskRepository(env.DB),
    work: new D1WorkRepository(env.DB),
  };
}

describe("B7 report flow", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM work_breaks"),
      env.DB.prepare("DELETE FROM work_logs"),
      env.DB.prepare("DELETE FROM planned_shifts"),
      env.DB.prepare("DELETE FROM work_rules"),
      env.DB.prepare("DELETE FROM finance_entries"),
      env.DB.prepare("DELETE FROM tasks"),
      env.DB.prepare("DELETE FROM events"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM users"),
    ]);
    await seedReportFixtures();
  });

  it("aggregates only scoped contributors and returns reproducible totals", async () => {
    const result = await manageReports(
      {
        actorUserId: "report-a",
        scope: { userId: "report-a" },
        command: {
          kind: "reports.summary",
          startDate: "2026-08-19",
          endDate: "2026-08-20",
        },
      },
      dependencies(),
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("Formula: base-report-v1; lavoro=work-report-v1");
    expect(result).toContain("Agenda: 1 eventi attivi");
    expect(result).toContain(
      "Task con scadenza nel periodo: 2 (1 aperte, 1 completate)",
    );
    expect(result).toContain("Lavoro: pianificato 120 min");
    expect(result).toContain("spese 1250, netto -1250");
    expect(result).toContain("event-a");
    expect(result).not.toContain("event-b");
    expect(result).not.toContain("999999");
  });

  it("exports contributor rows as a bounded CSV document", async () => {
    const result = await manageReports(
      {
        actorUserId: "report-a",
        scope: { userId: "report-a" },
        command: {
          kind: "reports.csv",
          startDate: "2026-08-19",
          endDate: "2026-08-20",
        },
      },
      dependencies(),
    );
    expect(typeof result).toBe("object");
    if (typeof result === "string") return;
    expect(result.fileName).toBe("tessavio-report-2026-08-19-2026-08-20.csv");
    expect(result.content).toContain('"base-report-v1","Europe/Rome"');
    expect(result.content).toContain('"event-a","\'=FORMULA"');
    expect(result.content).toContain('"finance-a"');
    expect(result.content).not.toContain("event-b");
    expect(result.content).not.toContain("finance-b");
    for (const row of result.content.split("\r\n")) {
      expect(row.match(/","/gu)).toHaveLength(16);
    }
  });

  it("delivers the CSV through the idempotent inbound document path", async () => {
    const input = envelope(77_001);
    const inbox = new D1InboundRepository(env.DB);
    await inbox.register(input, new Date(now));
    await inbox.markEnqueued(input.jobId, new Date(now));
    const reply = new CapturingReply();
    await expect(
      processInboundMessage(input, {
        authorizer: new SelfScopeAuthorizer(),
        clock: new FakeClock(new Date(now)),
        deliveries: new D1DeliveryRepository(env.DB),
        effects: new D1EffectRepository(env.DB),
        events: new D1EventRepository(env.DB),
        finance: new D1FinanceRepository(env.DB),
        identities: new D1IdentityRepository(env.DB),
        ids: new SequenceIds(),
        inbox,
        preferences: new D1PreferenceRepository(env.DB),
        reminders: new D1ReminderRepository(env.DB),
        tasks: new D1TaskRepository(env.DB),
        work: new D1WorkRepository(env.DB),
        reply,
        leaseSeconds: 60,
      }),
    ).resolves.toEqual({ outcome: "completed" });
    expect(reply.documents).toHaveLength(1);
    expect(reply.documents[0]?.fileName).toBe(
      "tessavio-report-2026-08-19-2026-08-20.csv",
    );
    await expect(
      processInboundMessage(input, {
        authorizer: new SelfScopeAuthorizer(),
        clock: new FakeClock(new Date(now)),
        deliveries: new D1DeliveryRepository(env.DB),
        effects: new D1EffectRepository(env.DB),
        events: new D1EventRepository(env.DB),
        finance: new D1FinanceRepository(env.DB),
        identities: new D1IdentityRepository(env.DB),
        ids: new SequenceIds(),
        inbox,
        preferences: new D1PreferenceRepository(env.DB),
        reminders: new D1ReminderRepository(env.DB),
        tasks: new D1TaskRepository(env.DB),
        work: new D1WorkRepository(env.DB),
        reply,
        leaseSeconds: 60,
      }),
    ).resolves.toEqual({ outcome: "duplicate" });
    expect(reply.documents).toHaveLength(1);
  });

  it("rejects a partial aggregate when one domain exceeds 500 contributors", async () => {
    await env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 500
       )
       INSERT INTO finance_entries (
         id, user_id, entry_kind, amount_minor, currency, local_date, category,
         merchant, payment_method, note, source, status, version,
         last_mutation_key, created_at, updated_at, deleted_at
       )
       SELECT printf('overflow-%03d', value), 'report-a', 'expense', 1, 'EUR',
              '2026-08-19', 'Bounded', NULL, NULL, NULL, 'manual_command',
              'active', 1, printf('overflow-key-%03d', value), ?, ?, NULL
       FROM sequence`,
    )
      .bind(now, now)
      .run();
    await expect(
      manageReports(
        {
          actorUserId: "report-a",
          scope: { userId: "report-a" },
          command: {
            kind: "reports.summary",
            startDate: "2026-08-19",
            endDate: "2026-08-20",
          },
        },
        dependencies(),
      ),
    ).resolves.toBe(
      "Report troppo esteso: oltre 500 contributori in almeno un dominio. Restringi il periodo.",
    );
  });

  it("uses tenant/date indices for the new report reads", async () => {
    const plans = await Promise.all([
      env.DB.prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM events
         WHERE user_id = ? AND status = 'active' AND local_date >= ? AND local_date <= ?`,
      )
        .bind("report-a", "2026-08-19", "2026-08-20")
        .all<{ detail: string }>(),
      env.DB.prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM tasks
         WHERE user_id = ? AND status = 'open' AND due_date_local >= ? AND due_date_local <= ?`,
      )
        .bind("report-a", "2026-08-19", "2026-08-20")
        .all<{ detail: string }>(),
      env.DB.prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM finance_entries
         WHERE user_id = ? AND status = 'active' AND local_date >= ? AND local_date <= ?`,
      )
        .bind("report-a", "2026-08-19", "2026-08-20")
        .all<{ detail: string }>(),
    ]);
    expect(plans[0].results.map((row) => row.detail).join(" ")).toContain(
      "events_scope_date_idx",
    );
    expect(plans[1].results.map((row) => row.detail).join(" ")).toContain(
      "tasks_scope_date_idx",
    );
    expect(plans[2].results.map((row) => row.detail).join(" ")).toContain(
      "finance_entries_scope_date_idx",
    );
  });
});
