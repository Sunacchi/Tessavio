import { processInboundMessage } from "../application/process-inbound";
import { sendReminderNotification } from "../application/send-reminder-notification";
import type { TelegramReplyPort } from "../application/ports";
import { queueEnvelopeSchema } from "../application/queue-envelope";
import { D1DeliveryRepository } from "../infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../infrastructure/db/effect-repository";
import { D1EventRepository } from "../infrastructure/db/event-repository";
import { D1FinanceRepository } from "../infrastructure/db/finance-repository";
import { D1IdentityRepository } from "../infrastructure/db/identity-repository";
import { D1InboundRepository } from "../infrastructure/db/inbound-repository";
import { D1NotificationDeliveryRepository } from "../infrastructure/db/notification-delivery-repository";
import { D1PreferenceRepository } from "../infrastructure/db/preference-repository";
import { D1ReminderRepository } from "../infrastructure/db/reminder-repository";
import { D1TaskRepository } from "../infrastructure/db/task-repository";
import { D1WorkRepository } from "../infrastructure/db/work-repository";
import { SelfScopeAuthorizer } from "../security/authorization";
import { parseConfig } from "../shared/config";
import {
  cryptoIdGenerator,
  systemClock,
  type Clock,
  type IdGenerator,
} from "../shared/contracts";
import { AppError, errorCodeOf } from "../shared/errors";
import { logEvent } from "../shared/logger";
import { GrammyTelegramReplyAdapter } from "../telegram/reply-adapter";

export interface InboundQueueOverrides {
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly reply?: TelegramReplyPort;
}

export async function handleInboundQueue(
  batch: MessageBatch,
  env: Env,
  overrides: InboundQueueOverrides = {},
): Promise<void> {
  const config = parseConfig(env);
  const inbox = new D1InboundRepository(env.DB);
  const clock = overrides.clock ?? systemClock;
  const dependencies = {
    authorizer: new SelfScopeAuthorizer(),
    clock,
    deliveries: new D1DeliveryRepository(env.DB),
    effects: new D1EffectRepository(env.DB),
    events: new D1EventRepository(env.DB),
    finance: new D1FinanceRepository(env.DB),
    identities: new D1IdentityRepository(env.DB),
    ids: overrides.ids ?? cryptoIdGenerator,
    inbox,
    preferences: new D1PreferenceRepository(env.DB),
    reminders: new D1ReminderRepository(env.DB),
    tasks: new D1TaskRepository(env.DB),
    work: new D1WorkRepository(env.DB),
    reply:
      overrides.reply ??
      new GrammyTelegramReplyAdapter(
        env.TELEGRAM_BOT_TOKEN,
        config.TELEGRAM_API_BASE_URL,
      ),
    leaseSeconds: config.INBOX_LEASE_SECONDS,
  };

  for (const message of batch.messages) {
    const parsed = queueEnvelopeSchema.safeParse(message.body);
    if (!parsed.success) {
      logEvent("warn", "queue.invalid_envelope", {
        errorCode: "INVALID_INPUT",
      });
      message.ack();
      continue;
    }

    const envelope = parsed.data;
    const startedAt = clock.now().getTime();
    if (envelope.type === "SEND_NOTIFICATION") {
      try {
        const result = await sendReminderNotification(envelope, {
          clock,
          identities: dependencies.identities,
          notificationDeliveries: new D1NotificationDeliveryRepository(env.DB),
          preferences: dependencies.preferences,
          reminders: dependencies.reminders,
          reply: dependencies.reply,
          maxDeliveryAttempts: config.REMINDER_MAX_DELIVERY_ATTEMPTS,
        });
        logEvent("info", `reminder.${result}`, {
          correlationId: envelope.correlationId,
          jobId: envelope.jobId,
          reminderId: envelope.payload.reminderId,
          state: result,
          attempt: message.attempts,
          latencyMs: clock.now().getTime() - startedAt,
        });
        message.ack();
      } catch (error) {
        const retryable =
          !(error instanceof AppError) || error.code === "RETRYABLE_EXTERNAL";
        logEvent(retryable ? "warn" : "error", "reminder.delivery_failed", {
          correlationId: envelope.correlationId,
          jobId: envelope.jobId,
          reminderId: envelope.payload.reminderId,
          errorCode: errorCodeOf(error),
          attempt: message.attempts,
          latencyMs: clock.now().getTime() - startedAt,
        });
        if (retryable) {
          message.retry({
            delaySeconds: config.REMINDER_RETRY_DELAY_SECONDS,
          });
        } else {
          message.ack();
        }
      }
      continue;
    }
    try {
      const result = await processInboundMessage(envelope, dependencies);
      logEvent("info", `queue.${result.outcome}`, {
        correlationId: envelope.correlationId,
        jobId: envelope.jobId,
        updateId: envelope.payload.updateId,
        state: result.outcome,
        attempt: message.attempts,
        latencyMs: clock.now().getTime() - startedAt,
      });
      message.ack();
    } catch (error) {
      const code = errorCodeOf(error);
      const retryable = !(error instanceof AppError) || error.retryable;
      const failureOwnsClaim =
        !(error instanceof AppError) ||
        (error.code !== "DUPLICATE" && error.code !== "INVALID_INPUT");
      if (failureOwnsClaim) {
        await inbox.fail(envelope.jobId, clock.now(), code, !retryable);
      }
      logEvent(retryable ? "warn" : "error", "queue.failed", {
        correlationId: envelope.correlationId,
        jobId: envelope.jobId,
        updateId: envelope.payload.updateId,
        errorCode: code,
        attempt: message.attempts,
        latencyMs: clock.now().getTime() - startedAt,
      });
      if (retryable) {
        message.retry({ delaySeconds: config.INBOX_LEASE_SECONDS });
      } else {
        message.ack();
      }
    }
  }
}
