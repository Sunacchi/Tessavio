import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { SendNotificationEnvelope } from "../../src/application/queue-envelope";
import type {
  PreferenceMutationContext,
  ReminderMutationContext,
  TelegramReplyPort,
} from "../../src/application/ports";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import { dispatchDueReminders } from "../../src/entrypoints/scheduled";
import { handleTelegramWebhook } from "../../src/entrypoints/webhook";
import { D1IdentityRepository } from "../../src/infrastructure/db/identity-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1ReminderRepository } from "../../src/infrastructure/db/reminder-repository";
import type { UserScope } from "../../src/shared/contracts";
import { AppError } from "../../src/shared/errors";
import {
  FakeClock,
  SequenceIds,
  telegramTextUpdate,
  testConfig,
  webhookRequest,
} from "../helpers";

class CapturingQueue implements Queue {
  readonly messages: unknown[] = [];
  failNext = false;

  metrics(): Promise<QueueMetrics> {
    return Promise.resolve({
      backlogCount: this.messages.length,
      backlogBytes: 0,
    });
  }

  send(message: unknown): Promise<QueueSendResponse> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("injected enqueue failure"));
    }
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

class FakeReply implements TelegramReplyPort {
  readonly texts: string[] = [];
  failures: ("retryable" | "permanent" | "ambiguous")[] = [];

  send(
    _chatId: number | string,
    text: string,
  ): Promise<{ readonly messageId: string }> {
    this.texts.push(text);
    const failure = this.failures.shift();
    if (failure === "retryable") {
      return Promise.reject(new AppError("RETRYABLE_EXTERNAL", true));
    }
    if (failure === "permanent") {
      return Promise.reject(new AppError("PERMANENT_EXTERNAL", false));
    }
    if (failure === "ambiguous") {
      return Promise.reject(new AppError("AMBIGUOUS_EXTERNAL", false));
    }
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

const scope: UserScope = { userId: "user-a" };

function preferenceContext(key: string, now: Date): PreferenceMutationContext {
  return {
    actorUserId: scope.userId,
    correlationId: `correlation-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `preference-undo-${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  };
}

function reminderContext(key: string, now: Date): ReminderMutationContext {
  return {
    actorUserId: scope.userId,
    correlationId: `correlation-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `rem_undo-${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  };
}

async function resetDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM notification_deliveries"),
    env.DB.prepare("DELETE FROM reminder_undo_actions"),
    env.DB.prepare("DELETE FROM reminders"),
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

async function setupUser(
  clock: FakeClock,
  quietHours: { startMinute: number; endMinute: number } | null = null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
  )
    .bind(scope.userId, clock.now().getTime())
    .run();
  await env.DB.prepare(
    `INSERT INTO telegram_identities (telegram_user_id, user_id, linked_at)
     VALUES ('7101', ?, ?)`,
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
      quietHours,
    },
    preferenceContext("setup-preferences", clock.now()),
  );
}

async function createReminder(
  clock: FakeClock,
  id: string,
  dueAt: Date,
): Promise<void> {
  await new D1ReminderRepository(env.DB).create(
    scope,
    id,
    {
      text: `Testo ${id}`,
      requestedAtUtc: dueAt,
      originalTimeZone: "Europe/Rome",
    },
    reminderContext(`create-${id}`, clock.now()),
  );
}

function workerEnv(
  notificationQueue: Queue,
  inboundQueue: Queue = env.INBOUND_QUEUE,
): Env {
  return {
    ...env,
    INBOUND_QUEUE: inboundQueue,
    NOTIFICATION_QUEUE: notificationQueue,
    TELEGRAM_BOT_TOKEN: "test-bot-token",
    TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
  };
}

function notificationBatch(envelope: SendNotificationEnvelope, attempts = 1) {
  return createMessageBatch("tessavio-notifications-dev", [
    {
      id: `physical-${String(attempts)}`,
      timestamp: new Date(envelope.createdAt),
      attempts,
      body: envelope,
    },
  ]);
}

describe("B2 reminder Cron, Queue and delivery", () => {
  beforeEach(resetDatabase);

  it("claims a due reminder once under concurrent sweeps", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    await createReminder(clock, "reminder-atomic", clock.now());
    const firstIds = new SequenceIds();
    const secondIds = new SequenceIds();
    const repository = new D1ReminderRepository(env.DB);
    const [first, second] = await Promise.all([
      repository.claimDue(clock.now(), 600, 100, () => firstIds.newId()),
      repository.claimDue(clock.now(), 600, 100, () => secondIds.newId()),
    ]);
    expect(first.length + second.length).toBe(1);
    const row = await env.DB.prepare(
      "SELECT status, attempt_count FROM reminders WHERE id = ? AND user_id = ?",
    )
      .bind("reminder-atomic", scope.userId)
      .first<{ status: string; attempt_count: number }>();
    expect(row).toEqual({ status: "claimed", attempt_count: 0 });
  });

  it("creates and queries a reminder through webhook and the inbound Queue without AI", async () => {
    const clock = new FakeClock();
    const ids = new SequenceIds();
    const inbound = new CapturingQueue();
    const notifications = new CapturingQueue();
    const reply = new FakeReply();
    const runtime = workerEnv(notifications, inbound);
    for (const [updateId, command] of [
      [1201, "/impostazioni imposta it Europe/Rome 24h EUR"],
      [1202, "/impostazioni quiete 22:00 07:00"],
      [1203, "/impostazioni quiete disattiva"],
      [1204, "/promemoria crea 2026-08-08T10:05 | Chiama il dentista"],
      [1205, "/promemoria lista"],
      [1206, "/oggi"],
    ] as const) {
      await handleTelegramWebhook(
        webhookRequest(telegramTextUpdate(command, updateId, 7101)),
        runtime,
        testConfig,
        { clock, ids },
      );
      const envelope = inbound.messages.at(-1);
      if (envelope === undefined) throw new Error("missing inbound envelope");
      await handleInboundQueue(
        createMessageBatch("tessavio-inbound-dev", [
          {
            id: `inbound-${String(updateId)}`,
            timestamp: clock.now(),
            attempts: 1,
            body: envelope,
          },
        ]),
        runtime,
        { clock, ids, reply },
      );
    }
    expect(reply.texts[1]).toContain("Quiet hours aggiornate.");
    expect(reply.texts[2]).toContain("Quiet hours disattivate.");
    expect(reply.texts[3]).toContain("Promemoria creato.");
    expect(reply.texts[3]).toContain("Chiama il dentista");
    expect(reply.texts[4]).toContain("Promemoria in attesa:");
    expect(reply.texts[4]).toContain("Chiama il dentista");
    expect(reply.texts[5]).toContain("Promemoria:");
    expect(reply.texts[5]).toContain("Chiama il dentista");
    const identity = await env.DB.prepare(
      "SELECT user_id FROM telegram_identities WHERE telegram_user_id = '7101'",
    ).first<{ user_id: string }>();
    if (identity === null) throw new Error("missing internal identity");
    const stored = await env.DB.prepare(
      `SELECT r.status, r.original_time_zone, COUNT(a.id) AS audits
       FROM reminders r JOIN audit_log a
         ON a.scope_user_id = r.user_id AND a.entity_id = r.id
       WHERE r.user_id = ? GROUP BY r.id`,
    )
      .bind(identity.user_id)
      .first();
    expect(stored).toMatchObject({
      status: "pending",
      original_time_zone: "Europe/Rome",
      audits: 1,
    });
  });

  it("cancels and undoes once, and rejects stale Undo after claim", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    const reminders = new D1ReminderRepository(env.DB);
    await createReminder(
      clock,
      "reminder-lifecycle",
      new Date("2026-08-08T12:00:00Z"),
    );
    const cancelled = await reminders.cancel(
      scope,
      "reminder-lifecycle",
      reminderContext("cancel-lifecycle", clock.now()),
    );
    if (!("reminder" in cancelled) || cancelled.undoToken === null) {
      throw new Error("missing cancellation Undo");
    }
    await expect(
      reminders.undo(scope, cancelled.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-cancel",
        idempotencyKey: "undo-cancel",
        auditId: "audit-undo-cancel",
        now: clock.now(),
      }),
    ).resolves.toMatchObject({
      outcome: "reverted",
      reminder: { status: "pending", version: 3 },
    });
    await expect(
      reminders.undo(scope, cancelled.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-replay",
        idempotencyKey: "undo-replay",
        auditId: "audit-undo-replay",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "used" });

    const created = await reminders.create(
      scope,
      "reminder-stale",
      {
        text: "Stale",
        requestedAtUtc: clock.now(),
        originalTimeZone: "Europe/Rome",
      },
      reminderContext("create-stale", clock.now()),
    );
    if (!("reminder" in created) || created.undoToken === null) {
      throw new Error("missing create Undo");
    }
    await reminders.claimDue(clock.now(), 600, 100, () => crypto.randomUUID());
    await expect(
      reminders.undo(scope, created.undoToken, {
        actorUserId: scope.userId,
        correlationId: "undo-stale",
        idempotencyKey: "undo-stale",
        auditId: "audit-undo-stale",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "stale" });
  });

  it("delivers one logical notification under duplicate Queue delivery", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    await createReminder(clock, "reminder-once", clock.now());
    const queue = new CapturingQueue();
    await dispatchDueReminders(
      workerEnv(queue),
      testConfig,
      clock,
      new SequenceIds(),
    );
    const envelope = queue.messages[0] as SendNotificationEnvelope;
    const reply = new FakeReply();
    await handleInboundQueue(notificationBatch(envelope), workerEnv(queue), {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    await handleInboundQueue(notificationBatch(envelope, 2), workerEnv(queue), {
      clock,
      ids: new SequenceIds(),
      reply,
    });
    expect(reply.texts).toEqual(["Promemoria: Testo reminder-once"]);
    const stored = await env.DB.prepare(
      `SELECT r.status, r.attempt_count,
              (SELECT COUNT(*) FROM notification_deliveries) AS deliveries
       FROM reminders r WHERE r.id = ? AND r.user_id = ?`,
    )
      .bind("reminder-once", scope.userId)
      .first<{
        status: string;
        attempt_count: number;
        deliveries: number;
      }>();
    expect(stored).toEqual({
      status: "sent",
      attempt_count: 1,
      deliveries: 1,
    });
  });

  it("retries only a certain Telegram rejection without duplicating the reminder", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    await createReminder(clock, "reminder-retry", clock.now());
    const queue = new CapturingQueue();
    await dispatchDueReminders(
      workerEnv(queue),
      testConfig,
      clock,
      new SequenceIds(),
    );
    const envelope = queue.messages[0] as SendNotificationEnvelope;
    const reply = new FakeReply();
    reply.failures.push("retryable");
    await handleInboundQueue(notificationBatch(envelope), workerEnv(queue), {
      clock,
      reply,
    });
    await handleInboundQueue(notificationBatch(envelope, 2), workerEnv(queue), {
      clock,
      reply,
    });
    expect(reply.texts).toHaveLength(2);
    const row = await env.DB.prepare(
      `SELECT r.status, r.attempt_count, d.status AS delivery_status,
              d.attempt_count AS delivery_attempts
       FROM reminders r JOIN notification_deliveries d
         ON d.scope_user_id = r.user_id AND d.reminder_id = r.id
       WHERE r.id = ? AND r.user_id = ?`,
    )
      .bind("reminder-retry", scope.userId)
      .first();
    expect(row).toMatchObject({
      status: "sent",
      attempt_count: 2,
      delivery_status: "sent",
      delivery_attempts: 2,
    });
  });

  it("defers during quiet hours and later sends using a new claim", async () => {
    const clock = new FakeClock();
    await setupUser(clock, { startMinute: 10 * 60, endMinute: 11 * 60 });
    const dueAt = new Date("2026-08-08T08:05:00Z");
    await createReminder(clock, "reminder-quiet", dueAt);
    clock.advance(5 * 60 * 1_000);
    const queue = new CapturingQueue();
    const ids = new SequenceIds();
    await dispatchDueReminders(workerEnv(queue), testConfig, clock, ids);
    const firstEnvelope = queue.messages[0] as SendNotificationEnvelope;
    const reply = new FakeReply();
    await handleInboundQueue(
      notificationBatch(firstEnvelope),
      workerEnv(queue),
      { clock, reply },
    );
    expect(reply.texts).toHaveLength(0);
    const deferred = await new D1ReminderRepository(env.DB).get(
      scope,
      "reminder-quiet",
    );
    expect(deferred).toMatchObject({
      status: "pending",
      dueAtUtc: new Date("2026-08-08T09:00:00Z"),
    });

    clock.advance(55 * 60 * 1_000);
    await dispatchDueReminders(workerEnv(queue), testConfig, clock, ids);
    const secondEnvelope = queue.messages[1] as SendNotificationEnvelope;
    expect(secondEnvelope.jobId).not.toBe(firstEnvelope.jobId);
    await handleInboundQueue(
      notificationBatch(secondEnvelope),
      workerEnv(queue),
      { clock, reply },
    );
    expect(reply.texts).toEqual(["Promemoria: Testo reminder-quiet"]);
  });

  it("recovers the same stable envelope after a crash before enqueue", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    await createReminder(clock, "reminder-recovery", clock.now());
    const queue = new CapturingQueue();
    queue.failNext = true;
    const ids = new SequenceIds();
    await dispatchDueReminders(workerEnv(queue), testConfig, clock, ids);
    expect(queue.messages).toHaveLength(0);
    const claimed = await env.DB.prepare(
      "SELECT claim_job_id FROM reminders WHERE id = ? AND user_id = ?",
    )
      .bind("reminder-recovery", scope.userId)
      .first<{ claim_job_id: string }>();
    clock.advance(31_000);
    await dispatchDueReminders(workerEnv(queue), testConfig, clock, ids);
    expect(queue.messages).toHaveLength(1);
    expect((queue.messages[0] as SendNotificationEnvelope).jobId).toBe(
      claimed?.claim_job_id,
    );
  });

  it("maps permanent and ambiguous Telegram outcomes without retry", async () => {
    for (const [id, failure, expected] of [
      ["reminder-permanent", "permanent", "permanent_failure"],
      ["reminder-ambiguous", "ambiguous", "ambiguous"],
    ] as const) {
      const clock = new FakeClock();
      await setupUser(clock);
      await createReminder(clock, id, clock.now());
      const repository = new D1ReminderRepository(env.DB);
      const [claim] = await repository.claimDue(clock.now(), 600, 1, () =>
        crypto.randomUUID(),
      );
      if (claim === undefined) throw new Error("missing claim");
      const reply = new FakeReply();
      reply.failures.push(failure);
      await handleInboundQueue(
        notificationBatch(claim.envelope),
        workerEnv(new CapturingQueue()),
        { clock, reply },
      );
      await expect(repository.get(scope, id)).resolves.toMatchObject({
        status: expected,
      });
      await resetDatabase();
    }
  });

  it("resolves the destination only through the internal user scope", async () => {
    const clock = new FakeClock();
    await setupUser(clock);
    await expect(
      new D1IdentityRepository(env.DB).getTelegramUserId(scope),
    ).resolves.toBe("7101");
    await expect(
      new D1IdentityRepository(env.DB).getTelegramUserId({ userId: "user-b" }),
    ).resolves.toBeNull();
  });
});
