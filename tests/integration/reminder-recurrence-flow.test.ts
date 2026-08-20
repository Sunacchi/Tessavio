import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { generateRecurringReminders } from "../../src/application/generate-recurring-reminders";
import { manageReminderRecurrences } from "../../src/application/manage-reminder-recurrences";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import type { PreferenceMutationContext } from "../../src/application/ports/preferences";
import type { ReminderRecurrenceMutationContext } from "../../src/application/ports/recurrences";
import {
  validateReminderRecurrence,
  type ReminderRecurrenceValues,
} from "../../src/domains/reminders/recurrence";
import {
  dispatchDueReminders,
  generateDueReminderRecurrences,
} from "../../src/entrypoints/scheduled";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1ReminderRecurrenceRepository } from "../../src/infrastructure/db/reminder-recurrence-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import type { IdGenerator, UserScope } from "../../src/shared/contracts";
import { FakeClock, SequenceIds, testConfig } from "../helpers";

class PrefixedIds implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix: string) {}

  newId(): string {
    this.counter += 1;
    return `${this.prefix}-${String(this.counter)}`;
  }
}

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

const scope: UserScope = { userId: "recurrence-user-a" };

function mutationContext(
  key: string,
  now: Date,
): ReminderRecurrenceMutationContext {
  return {
    actorUserId: scope.userId,
    correlationId: `correlation-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `rec_${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  };
}

function preferenceContext(key: string, now: Date): PreferenceMutationContext {
  return {
    actorUserId: scope.userId,
    correlationId: `correlation-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `pref_${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  };
}

function recurrenceValues(
  scheduledLocal: string,
  frequency: "daily" | "weekly" = "daily",
): ReminderRecurrenceValues {
  const result = validateReminderRecurrence({
    text: `Ricorrenza ${scheduledLocal}`,
    frequency,
    scheduledLocal,
    timeZone: "Europe/Rome",
    referenceInstant: new Date("2020-01-01T00:00:00Z"),
  });
  if (!result.ok) throw new Error(`invalid fixture: ${result.issue}`);
  return result.value;
}

async function resetDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM notification_deliveries"),
    env.DB.prepare("DELETE FROM reminder_recurrence_occurrences"),
    env.DB.prepare("DELETE FROM reminder_recurrence_undo_actions"),
    env.DB.prepare("DELETE FROM reminder_undo_actions"),
    env.DB.prepare("DELETE FROM reminders"),
    env.DB.prepare("DELETE FROM reminder_recurrences"),
    env.DB.prepare("DELETE FROM preference_undo_actions"),
    env.DB.prepare("DELETE FROM user_preferences"),
    env.DB.prepare("DELETE FROM audit_log"),
    env.DB.prepare("DELETE FROM telegram_identities"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function setupUser(clock: FakeClock): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
  )
    .bind(scope.userId, clock.now().getTime())
    .run();
  await new D1PreferenceRepository(env.DB).set(
    scope,
    {
      language: "it",
      timeZone: "Europe/Rome",
      hourFormat: "24h",
      defaultCurrency: "EUR",
      quietHours: null,
    },
    preferenceContext("setup-recurrence-preferences", clock.now()),
  );
}

describe("B6.2 recurring reminder flow", () => {
  beforeEach(resetDatabase);

  it("creates, deduplicates, cancels with expected version and undoes once", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    const repository = new D1ReminderRecurrenceRepository(env.DB);
    const context = mutationContext("create-recurrence", clock.now());
    const created = await repository.create(
      scope,
      "recurrence-lifecycle",
      recurrenceValues("2026-08-09T09:00"),
      context,
    );
    expect(created).toMatchObject({
      outcome: "created",
      recurrence: { status: "active", version: 1 },
    });
    await expect(
      repository.create(
        scope,
        "ignored-duplicate-id",
        recurrenceValues("2026-08-10T09:00"),
        { ...context, auditId: "ignored", undoToken: "ignored" },
      ),
    ).resolves.toMatchObject({
      outcome: "duplicate",
      recurrence: { id: "recurrence-lifecycle" },
    });
    await expect(
      repository.cancel(
        scope,
        "recurrence-lifecycle",
        2,
        mutationContext("stale-cancel", clock.now()),
      ),
    ).resolves.toEqual({ outcome: "stale" });
    const cancelled = await repository.cancel(
      scope,
      "recurrence-lifecycle",
      1,
      mutationContext("cancel-recurrence", clock.now()),
    );
    if (!("recurrence" in cancelled) || cancelled.undoToken === null) {
      throw new Error("missing cancellation Undo");
    }
    await expect(
      repository.undo(scope, cancelled.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-cancel-recurrence",
        idempotencyKey: "undo-cancel-recurrence",
        auditId: "audit-undo-cancel-recurrence",
        now: clock.now(),
      }),
    ).resolves.toMatchObject({
      outcome: "reverted",
      recurrence: { status: "active", version: 3 },
    });
    await expect(
      repository.undo(scope, cancelled.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-cancel-recurrence-replay",
        idempotencyKey: "undo-cancel-recurrence-replay",
        auditId: "audit-undo-cancel-recurrence-replay",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "used" });
  });

  it("deletes an unused creation through Undo and rejects an expired token", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    const repository = new D1ReminderRecurrenceRepository(env.DB);
    const removable = await repository.create(
      scope,
      "recurrence-removable",
      recurrenceValues("2026-08-09T09:00"),
      mutationContext("create-removable", clock.now()),
    );
    if (!("recurrence" in removable) || removable.undoToken === null) {
      throw new Error("missing create Undo");
    }
    await expect(
      repository.undo(scope, removable.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-removable",
        idempotencyKey: "undo-removable",
        auditId: "audit-undo-removable",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "reverted", recurrence: null });
    await expect(
      repository.undo(scope, removable.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-removable-duplicate",
        idempotencyKey: "undo-removable",
        auditId: "ignored-audit",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "duplicate", recurrence: null });

    const expiring = await repository.create(
      scope,
      "recurrence-expiring",
      recurrenceValues("2026-08-10T09:00"),
      mutationContext("create-expiring", clock.now()),
    );
    if (!("recurrence" in expiring) || expiring.undoToken === null) {
      throw new Error("missing expiring Undo");
    }
    clock.advance(900_001);
    await expect(
      repository.undo(scope, expiring.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-expired-recurrence",
        idempotencyKey: "undo-expired-recurrence",
        auditId: "audit-undo-expired-recurrence",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "expired" });
  });

  it("materializes once under concurrent sweeps and coalesces missed slots", async () => {
    const clock = new FakeClock(new Date("2026-08-19T12:00:00Z"));
    await setupUser(clock);
    const repository = new D1ReminderRecurrenceRepository(env.DB);
    const created = await repository.create(
      scope,
      "recurrence-concurrent",
      recurrenceValues("2026-01-01T09:00"),
      mutationContext("create-concurrent", clock.now()),
    );
    if (!("recurrence" in created) || created.undoToken === null) {
      throw new Error("missing create result");
    }
    const [first, second] = await Promise.all([
      generateRecurringReminders(
        { clock, ids: new PrefixedIds("first"), recurrences: repository },
        100,
      ),
      generateRecurringReminders(
        { clock, ids: new PrefixedIds("second"), recurrences: repository },
        100,
      ),
    ]);
    expect(first + second).toBe(1);
    const stored = await repository.get(scope, "recurrence-concurrent");
    expect(stored).toMatchObject({
      nextLocalDate: "2026-08-20",
      status: "active",
      version: 2,
    });
    expect(stored?.nextDueAtUtc.getTime()).toBeGreaterThan(
      clock.now().getTime(),
    );
    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM reminders) AS reminders,
         (SELECT COUNT(*) FROM reminder_recurrence_occurrences) AS occurrences,
         (SELECT COUNT(*) FROM audit_log
          WHERE action = 'reminder.recurrence.generated') AS generation_audits`,
    ).first();
    expect(counts).toEqual({
      reminders: 1,
      occurrences: 1,
      generation_audits: 1,
    });
    await expect(
      repository.undo(scope, created.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-generated",
        idempotencyKey: "undo-generated",
        auditId: "audit-undo-generated",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "stale" });
    await expect(
      generateRecurringReminders(
        { clock, ids: new PrefixedIds("retry"), recurrences: repository },
        100,
      ),
    ).resolves.toBe(0);
    const cancelled = await repository.cancel(
      scope,
      "recurrence-concurrent",
      2,
      mutationContext("cancel-after-generation", clock.now()),
    );
    expect(cancelled).toMatchObject({ outcome: "cancelled" });
    clock.advance(86_400_000);
    await expect(
      generateRecurringReminders(
        { clock, ids: new PrefixedIds("cancelled"), recurrences: repository },
        100,
      ),
    ).resolves.toBe(0);
    const reminders = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM reminders",
    ).first<{ count: number }>();
    expect(reminders?.count).toBe(1);
  });

  it("routes explicit commands through the application and D1", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    const repository = new D1ReminderRecurrenceRepository(env.DB);
    const ids = new PrefixedIds("command");
    const parsed = parseDeterministicCommand(
      "/promemoria ricorrente settimanale 2026-08-09T09:00 | Revisione",
    );
    if (parsed.kind !== "reminders.recurrence.create") {
      throw new Error("unexpected parser result");
    }
    const created = await manageReminderRecurrences(
      {
        actorUserId: scope.userId,
        scope,
        correlationId: "command-create-correlation",
        idempotencyKey: "command-create",
        sentAtUnix: Math.floor(clock.now().getTime() / 1_000),
        command: parsed,
      },
      {
        authorizer: new SelfScopeAuthorizer(),
        clock,
        ids,
        preferences: new D1PreferenceRepository(env.DB),
        recurrences: repository,
      },
    );
    expect(created).toContain("Ricorrenza creata.");
    expect(created).toContain("settimanale");
    const listed = await manageReminderRecurrences(
      {
        actorUserId: scope.userId,
        scope,
        correlationId: "command-list-correlation",
        idempotencyKey: "command-list",
        sentAtUnix: Math.floor(clock.now().getTime() / 1_000),
        command: { kind: "reminders.recurrence.list" },
      },
      {
        authorizer: new SelfScopeAuthorizer(),
        clock,
        ids,
        preferences: new D1PreferenceRepository(env.DB),
        recurrences: repository,
      },
    );
    expect(listed).toContain("Ricorrenze attive:");
    expect(listed).toContain("Revisione");
  });

  it("generates then claims through the existing Cron and notification Queue", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    const repository = new D1ReminderRecurrenceRepository(env.DB);
    await repository.create(
      scope,
      "recurrence-cron",
      recurrenceValues("2026-08-08T10:00"),
      mutationContext("create-cron", clock.now()),
    );
    const queue = new CapturingQueue();
    const runtime = {
      ...env,
      NOTIFICATION_QUEUE: queue,
      TELEGRAM_BOT_TOKEN: "test-bot-token",
      TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
    };
    const ids = new SequenceIds();
    await generateDueReminderRecurrences(runtime, testConfig, clock, ids);
    await dispatchDueReminders(runtime, testConfig, clock, ids);
    expect(queue.messages).toHaveLength(1);
    expect(queue.messages[0]).toMatchObject({
      type: "SEND_NOTIFICATION",
      payload: { userId: scope.userId },
    });
    const occurrence = await env.DB.prepare(
      `SELECT o.source, r.status, r.original_time_zone
       FROM reminder_recurrence_occurrences o
       JOIN reminders r ON r.user_id = o.user_id AND r.id = o.reminder_id
       WHERE o.user_id = ? AND o.recurrence_id = ?`,
    )
      .bind(scope.userId, "recurrence-cron")
      .first();
    expect(occurrence).toEqual({
      source: "calculated_recurrence",
      status: "claimed",
      original_time_zone: "Europe/Rome",
    });
  });
});
