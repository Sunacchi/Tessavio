import { processInboundMessage } from "../application/process-inbound";
import { inboundMessageEnvelopeSchema } from "../application/queue-envelope";
import { D1DeliveryRepository } from "../infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../infrastructure/db/effect-repository";
import { D1IdentityRepository } from "../infrastructure/db/identity-repository";
import { D1InboundRepository } from "../infrastructure/db/inbound-repository";
import { SelfScopeAuthorizer } from "../security/authorization";
import { parseConfig } from "../shared/config";
import { cryptoIdGenerator, systemClock } from "../shared/contracts";
import { AppError, errorCodeOf } from "../shared/errors";
import { logEvent } from "../shared/logger";
import { GrammyTelegramReplyAdapter } from "../telegram/reply-adapter";

export async function handleInboundQueue(
  batch: MessageBatch,
  env: Env,
): Promise<void> {
  const config = parseConfig(env);
  const inbox = new D1InboundRepository(env.DB);
  const dependencies = {
    authorizer: new SelfScopeAuthorizer(),
    clock: systemClock,
    deliveries: new D1DeliveryRepository(env.DB),
    effects: new D1EffectRepository(env.DB),
    identities: new D1IdentityRepository(env.DB),
    ids: cryptoIdGenerator,
    inbox,
    reply: new GrammyTelegramReplyAdapter(
      env.TELEGRAM_BOT_TOKEN,
      config.TELEGRAM_API_BASE_URL,
    ),
    leaseSeconds: config.INBOX_LEASE_SECONDS,
  };

  for (const message of batch.messages) {
    const parsed = inboundMessageEnvelopeSchema.safeParse(message.body);
    if (!parsed.success) {
      logEvent("warn", "queue.invalid_envelope", {
        errorCode: "INVALID_INPUT",
      });
      message.ack();
      continue;
    }

    const envelope = parsed.data;
    const startedAt = Date.now();
    try {
      const result = await processInboundMessage(envelope, dependencies);
      logEvent("info", `queue.${result.outcome}`, {
        correlationId: envelope.correlationId,
        jobId: envelope.jobId,
        updateId: envelope.payload.updateId,
        state: result.outcome,
        attempt: message.attempts,
        latencyMs: Date.now() - startedAt,
      });
      message.ack();
    } catch (error) {
      const code = errorCodeOf(error);
      const retryable = !(error instanceof AppError) || error.retryable;
      const failureOwnsClaim =
        !(error instanceof AppError) ||
        (error.code !== "DUPLICATE" && error.code !== "INVALID_INPUT");
      if (failureOwnsClaim) {
        await inbox.fail(envelope.jobId, systemClock.now(), code, !retryable);
      }
      logEvent(retryable ? "warn" : "error", "queue.failed", {
        correlationId: envelope.correlationId,
        jobId: envelope.jobId,
        updateId: envelope.payload.updateId,
        errorCode: code,
        attempt: message.attempts,
        latencyMs: Date.now() - startedAt,
      });
      if (retryable) {
        message.retry({ delaySeconds: config.INBOX_LEASE_SECONDS });
      } else {
        message.ack();
      }
    }
  }
}
