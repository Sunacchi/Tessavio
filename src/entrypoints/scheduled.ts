import { D1InboundRepository } from "../infrastructure/db/inbound-repository";
import type { AppConfig } from "../shared/config";
import type { Clock } from "../shared/contracts";
import { systemClock } from "../shared/contracts";
import { logEvent } from "../shared/logger";

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
