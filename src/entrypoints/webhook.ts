import {
  inboundMessageEnvelopeSchema,
  type InboundMessageEnvelope,
} from "../application/queue-envelope";
import { D1InboundRepository } from "../infrastructure/db/inbound-repository";
import { D1IngressLimiter } from "../infrastructure/db/ingress-limiter";
import type { Clock, IdGenerator } from "../shared/contracts";
import { cryptoIdGenerator, systemClock } from "../shared/contracts";
import { AppError, errorCodeOf } from "../shared/errors";
import { logEvent } from "../shared/logger";
import { keyedOpaqueId, secretsEqual } from "../security/secrets";
import {
  normalizeTelegramUpdate,
  telegramUpdateSchema,
} from "../telegram/schemas";
import { PayloadTooLargeError, readBoundedJson } from "./body";
import type { AppConfig } from "../shared/config";

interface WebhookDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

const defaultDependencies: WebhookDependencies = {
  clock: systemClock,
  ids: cryptoIdGenerator,
};

function empty(status: number): Response {
  return new Response(null, { status });
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  config: AppConfig,
  dependencies: WebhookDependencies = defaultDependencies,
): Promise<Response> {
  const startedAt = Date.now();
  const url = new URL(request.url);
  if (url.pathname !== config.WEBHOOK_PATH) {
    return empty(404);
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > config.WEBHOOK_MAX_BODY_BYTES
  ) {
    logEvent("warn", "webhook.rejected", { errorCode: "INVALID_INPUT" });
    return empty(413);
  }

  const now = dependencies.clock.now();
  const source = request.headers.get("cf-connecting-ip") ?? "unavailable";
  const windowNumber = Math.floor(
    now.getTime() / (config.WEBHOOK_RATE_WINDOW_SECONDS * 1_000),
  );
  const rateKey = await keyedOpaqueId(
    env.TELEGRAM_WEBHOOK_SECRET,
    `webhook:${source}:${String(windowNumber)}`,
  );
  const limiter = new D1IngressLimiter(env.DB);
  const withinRate = await limiter.consumeRate(
    rateKey,
    now,
    config.WEBHOOK_RATE_WINDOW_SECONDS,
    config.WEBHOOK_RATE_LIMIT_MAX,
  );
  if (!withinRate) {
    logEvent("warn", "webhook.rate_limited", { errorCode: "RATE_LIMITED" });
    return empty(429);
  }

  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!(await secretsEqual(providedSecret, env.TELEGRAM_WEBHOOK_SECRET))) {
    logEvent("warn", "webhook.unauthorized", { errorCode: "UNAUTHORIZED" });
    return empty(401);
  }

  const leaseId = dependencies.ids.newId();
  const acquired = await limiter.acquireConcurrency(
    leaseId,
    now,
    config.WEBHOOK_LEASE_SECONDS,
    config.WEBHOOK_MAX_CONCURRENCY,
  );
  if (!acquired) {
    logEvent("warn", "webhook.concurrency_limited", {
      errorCode: "CONCURRENCY_LIMITED",
    });
    return empty(503);
  }

  let correlationId: string | undefined;
  let jobId: string | undefined;
  let updateId: number | undefined;
  try {
    const body = await readBoundedJson(request, config.WEBHOOK_MAX_BODY_BYTES);
    const parsed = telegramUpdateSchema.safeParse(body);
    if (!parsed.success) {
      logEvent("warn", "webhook.invalid", { errorCode: "INVALID_INPUT" });
      return empty(400);
    }

    const update = normalizeTelegramUpdate(parsed.data);
    updateId = update.updateId;
    correlationId = dependencies.ids.newId();
    jobId = dependencies.ids.newId();
    const envelope: InboundMessageEnvelope = inboundMessageEnvelopeSchema.parse(
      {
        version: 1,
        type: "INBOUND_MESSAGE",
        jobId,
        correlationId,
        idempotencyKey: `telegram-update:${String(update.updateId)}`,
        createdAt: now.toISOString(),
        attempt: 0,
        payload: update,
      },
    );

    const inbox = new D1InboundRepository(env.DB);
    const registered = await inbox.register(envelope, now);
    correlationId = registered.envelope.correlationId;
    jobId = registered.envelope.jobId;
    if (
      registered.status === "completed" ||
      registered.status === "completed_ambiguous" ||
      registered.status === "dead"
    ) {
      logEvent("info", "webhook.duplicate_completed", {
        correlationId,
        jobId,
        updateId,
        latencyMs: Date.now() - startedAt,
      });
      return empty(200);
    }

    await env.INBOUND_QUEUE.send(registered.envelope, { contentType: "json" });
    await inbox.markEnqueued(jobId, dependencies.clock.now());
    logEvent(
      "info",
      registered.duplicate ? "webhook.duplicate_enqueued" : "webhook.enqueued",
      {
        correlationId,
        jobId,
        updateId,
        latencyMs: Date.now() - startedAt,
      },
    );
    return empty(200);
  } catch (error) {
    const code = errorCodeOf(error);
    logEvent("error", "webhook.failed", {
      ...(correlationId === undefined ? {} : { correlationId }),
      ...(jobId === undefined ? {} : { jobId }),
      ...(updateId === undefined ? {} : { updateId }),
      errorCode: code,
      latencyMs: Date.now() - startedAt,
    });
    if (error instanceof PayloadTooLargeError) {
      return empty(413);
    }
    if (error instanceof AppError && error.code === "INVALID_INPUT") {
      return empty(400);
    }
    return empty(503);
  } finally {
    try {
      await limiter.releaseConcurrency(leaseId);
    } catch {
      logEvent("warn", "webhook.lease_release_failed", {
        ...(correlationId === undefined ? {} : { correlationId }),
        ...(jobId === undefined ? {} : { jobId }),
        ...(updateId === undefined ? {} : { updateId }),
        errorCode: "INTERNAL_REDACTED",
      });
    }
  }
}
