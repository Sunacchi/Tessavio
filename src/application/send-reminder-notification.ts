import type {
  IdentityRepository,
  NotificationDeliveryRepository,
  PreferenceRepository,
  ReminderRepository,
  TelegramReplyPort,
} from "./ports";
import type { SendNotificationEnvelope } from "./queue-envelope";
import {
  isWithinQuietHours,
  nextQuietHoursEnd,
  notificationDeliveryRetentionMs,
} from "../domains/reminders/reminders";
import type { Clock, UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

export interface SendReminderDependencies {
  readonly clock: Clock;
  readonly identities: IdentityRepository;
  readonly notificationDeliveries: NotificationDeliveryRepository;
  readonly preferences: PreferenceRepository;
  readonly reminders: ReminderRepository;
  readonly reply: TelegramReplyPort;
  readonly maxDeliveryAttempts: number;
}

export type SendReminderOutcome =
  "sent" | "duplicate" | "deferred" | "permanent_failure" | "ambiguous";

export async function sendReminderNotification(
  envelope: SendNotificationEnvelope,
  dependencies: SendReminderDependencies,
): Promise<SendReminderOutcome> {
  const scope: UserScope = { userId: envelope.payload.userId };
  const now = dependencies.clock.now();
  await dependencies.notificationDeliveries.purgeTerminal(
    scope,
    new Date(now.getTime() - notificationDeliveryRetentionMs),
    100,
  );
  const reminder = await dependencies.reminders.getForDelivery(
    scope,
    envelope.payload.reminderId,
    envelope.jobId,
  );
  if (reminder === null) return "duplicate";
  if (reminder.deliveryAttempts >= dependencies.maxDeliveryAttempts) {
    await dependencies.notificationDeliveries.markPermanentFailure(
      scope,
      `telegram-reminder:${reminder.id}`,
      now,
    );
    await dependencies.reminders.markDeliveryOutcome(
      scope,
      reminder.id,
      envelope.jobId,
      "permanent_failure",
      now,
      "DELIVERY_ATTEMPTS_EXHAUSTED",
    );
    return "permanent_failure";
  }
  const profile = await dependencies.preferences.get(scope);
  if (profile === null) {
    await dependencies.reminders.markDeliveryOutcome(
      scope,
      reminder.id,
      envelope.jobId,
      "permanent_failure",
      now,
      "MISSING_PREFERENCES",
    );
    return "permanent_failure";
  }
  if (
    reminder.status === "claimed" &&
    profile.quietHours !== null &&
    isWithinQuietHours(now, profile.timeZone, profile.quietHours)
  ) {
    const nextDue = nextQuietHoursEnd(
      now,
      profile.timeZone,
      profile.quietHours,
    );
    const deferred = await dependencies.reminders.deferForQuietHours(
      scope,
      reminder.id,
      envelope.jobId,
      nextDue,
      profile.version,
      profile.quietHours.startMinute,
      profile.quietHours.endMinute,
      now,
    );
    return deferred ? "deferred" : "duplicate";
  }
  const telegramUserId = await dependencies.identities.getTelegramUserId(scope);
  if (telegramUserId === null) {
    await dependencies.reminders.markDeliveryOutcome(
      scope,
      reminder.id,
      envelope.jobId,
      "permanent_failure",
      now,
      "MISSING_DESTINATION",
    );
    return "permanent_failure";
  }
  const dedupeKey = `telegram-reminder:${reminder.id}`;
  const existing = await dependencies.notificationDeliveries.prepare(
    scope,
    dedupeKey,
    reminder.id,
    envelope.jobId,
    now,
  );
  const action = await dependencies.notificationDeliveries.begin(
    scope,
    dedupeKey,
    now,
  );
  if (action === "ambiguous") {
    await dependencies.notificationDeliveries.markAmbiguous(
      scope,
      dedupeKey,
      now,
    );
    await dependencies.reminders.markDeliveryOutcome(
      scope,
      reminder.id,
      envelope.jobId,
      "ambiguous",
      now,
      "AMBIGUOUS_EXTERNAL",
    );
    return "ambiguous";
  }
  if (action === "skip") {
    if (existing === "sent") {
      await dependencies.reminders.markDeliveryOutcome(
        scope,
        reminder.id,
        envelope.jobId,
        "sent",
        now,
      );
    } else if (existing === "permanent_failure") {
      await dependencies.reminders.markDeliveryOutcome(
        scope,
        reminder.id,
        envelope.jobId,
        "permanent_failure",
        now,
        "PERMANENT_EXTERNAL",
      );
    } else if (existing === "ambiguous") {
      await dependencies.reminders.markDeliveryOutcome(
        scope,
        reminder.id,
        envelope.jobId,
        "ambiguous",
        now,
        "AMBIGUOUS_EXTERNAL",
      );
    }
    return "duplicate";
  }
  const began = await dependencies.reminders.markSending(
    scope,
    reminder.id,
    envelope.jobId,
    profile.version,
    profile.quietHours?.startMinute ?? null,
    profile.quietHours?.endMinute ?? null,
    now,
  );
  if (!began) return "duplicate";
  try {
    const sent = await dependencies.reply.send(
      telegramUserId,
      `Promemoria: ${reminder.text}`,
    );
    await dependencies.notificationDeliveries.markSent(
      scope,
      dedupeKey,
      sent.messageId,
      dependencies.clock.now(),
    );
    await dependencies.reminders.markDeliveryOutcome(
      scope,
      reminder.id,
      envelope.jobId,
      "sent",
      dependencies.clock.now(),
    );
    return "sent";
  } catch (error) {
    if (error instanceof AppError && error.code === "RETRYABLE_EXTERNAL") {
      await dependencies.notificationDeliveries.markRetryableFailure(
        scope,
        dedupeKey,
        dependencies.clock.now(),
      );
      await dependencies.reminders.markDeliveryOutcome(
        scope,
        reminder.id,
        envelope.jobId,
        "claimed",
        dependencies.clock.now(),
        "RETRYABLE_EXTERNAL",
      );
      throw error;
    }
    if (error instanceof AppError && error.code === "PERMANENT_EXTERNAL") {
      await dependencies.notificationDeliveries.markPermanentFailure(
        scope,
        dedupeKey,
        dependencies.clock.now(),
      );
      await dependencies.reminders.markDeliveryOutcome(
        scope,
        reminder.id,
        envelope.jobId,
        "permanent_failure",
        dependencies.clock.now(),
        "PERMANENT_EXTERNAL",
      );
      return "permanent_failure";
    }
    await dependencies.notificationDeliveries.markAmbiguous(
      scope,
      dedupeKey,
      dependencies.clock.now(),
    );
    await dependencies.reminders.markDeliveryOutcome(
      scope,
      reminder.id,
      envelope.jobId,
      "ambiguous",
      dependencies.clock.now(),
      "AMBIGUOUS_EXTERNAL",
    );
    return "ambiguous";
  }
}
