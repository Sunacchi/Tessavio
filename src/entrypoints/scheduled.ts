import { D1InboundRepository } from "../infrastructure/db/inbound-repository";
import { D1ReminderRepository } from "../infrastructure/db/reminder-repository";
import { D1ReminderRecurrenceRepository } from "../infrastructure/db/reminder-recurrence-repository";
import { generateRecurringReminders } from "../application/generate-recurring-reminders";
import type { AppConfig } from "../shared/config";
import type { Clock } from "../shared/contracts";
import { systemClock } from "../shared/contracts";
import { logEvent } from "../shared/logger";
import { cryptoIdGenerator, type IdGenerator } from "../shared/contracts";

export async function recoverPendingInboxes(
  env: Env,
  config: AppConfig,
  clock: Clock = systemClock,
): Promise<void> {
  const inbox = new D1InboundRepository(env.DB);
  const now = clock.now();
  const before = new Date(
    now.getTime() - config.INBOX_RECOVERY_AFTER_SECONDS * 1_000,
  );
  const pending = await inbox.listPendingEnqueue(before, 100);

  for (const envelope of pending) {
    try {
      await env.INBOUND_QUEUE.send(envelope, { contentType: "json" });
      await inbox.markEnqueued(envelope.jobId, clock.now());
      logEvent("info", "inbox.recovered", {
        correlationId: envelope.correlationId,
        jobId: envelope.jobId,
        updateId: envelope.payload.updateId,
      });
    } catch {
      logEvent("warn", "inbox.recovery_failed", {
        correlationId: envelope.correlationId,
        jobId: envelope.jobId,
        updateId: envelope.payload.updateId,
        errorCode: "RETRYABLE_EXTERNAL",
      });
    }
  }
}

export async function dispatchDueReminders(
  env: Env,
  config: AppConfig,
  clock: Clock = systemClock,
  ids: IdGenerator = cryptoIdGenerator,
): Promise<void> {
  const reminders = new D1ReminderRepository(env.DB);
  const now = clock.now();
  const recoveryBefore = new Date(
    now.getTime() - config.REMINDER_ENQUEUE_RECOVERY_SECONDS * 1_000,
  );
  const recoverable = await reminders.listRecoverableClaims(
    now,
    recoveryBefore,
    config.REMINDER_CLAIM_LIMIT,
  );
  const remaining = Math.max(
    0,
    config.REMINDER_CLAIM_LIMIT - recoverable.length,
  );
  const claimed =
    remaining === 0
      ? []
      : await reminders.claimDue(
          now,
          config.REMINDER_LEASE_SECONDS,
          remaining,
          () => ids.newId(),
        );
  for (const item of [...recoverable, ...claimed]) {
    try {
      await env.NOTIFICATION_QUEUE.send(item.envelope, {
        contentType: "json",
      });
      await reminders.markEnqueued(
        item.scope,
        item.envelope.payload.reminderId,
        item.envelope.jobId,
        clock.now(),
        config.REMINDER_LEASE_SECONDS,
      );
      logEvent("info", "reminder.enqueued", {
        correlationId: item.envelope.correlationId,
        jobId: item.envelope.jobId,
        reminderId: item.envelope.payload.reminderId,
        state: recoverable.includes(item) ? "recovered" : "claimed",
      });
    } catch {
      logEvent("warn", "reminder.enqueue_failed", {
        correlationId: item.envelope.correlationId,
        jobId: item.envelope.jobId,
        reminderId: item.envelope.payload.reminderId,
        errorCode: "RETRYABLE_EXTERNAL",
      });
    }
  }
}

export async function generateDueReminderRecurrences(
  env: Env,
  config: AppConfig,
  clock: Clock = systemClock,
  ids: IdGenerator = cryptoIdGenerator,
): Promise<void> {
  const generated = await generateRecurringReminders(
    {
      clock,
      ids,
      recurrences: new D1ReminderRecurrenceRepository(env.DB),
    },
    config.REMINDER_CLAIM_LIMIT,
  );
  if (generated > 0) {
    logEvent("info", "reminder.recurrence_generated", {
      state: "generated",
      count: generated,
    });
  }
}

export async function runScheduledMaintenance(
  env: Env,
  config: AppConfig,
  clock: Clock = systemClock,
  ids: IdGenerator = cryptoIdGenerator,
): Promise<void> {
  await recoverPendingInboxes(env, config, clock);
  await generateDueReminderRecurrences(env, config, clock, ids);
  await dispatchDueReminders(env, config, clock, ids);
}
