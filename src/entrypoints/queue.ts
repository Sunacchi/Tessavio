import { processInboundMessage } from "../application/process-inbound";
import { sendReminderNotification } from "../application/send-reminder-notification";
import type { TelegramReplyPort } from "../application/ports";
import { queueEnvelopeSchema } from "../application/queue-envelope";
import { D1NotificationDeliveryRepository } from "../infrastructure/db/notification-delivery-repository";
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
import { buildInboundRuntime } from "./runtime";

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
  const clock = overrides.clock ?? systemClock;
  const runtime = buildInboundRuntime(env, config, {
    clock,
    ids: overrides.ids ?? cryptoIdGenerator,
    reply:
      overrides.reply ??
      new GrammyTelegramReplyAdapter(
        env.TELEGRAM_BOT_TOKEN,
        config.TELEGRAM_API_BASE_URL,
      ),
  });
  const dependencies = runtime.dependencies;
  const inbox = runtime.inbox;

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
          identities: runtime.identities,
          notificationDeliveries: new D1NotificationDeliveryRepository(env.DB),
          preferences: runtime.preferences,
          reminders: runtime.reminders,
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
