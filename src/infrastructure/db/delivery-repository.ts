import type {
  DeliveryRepository,
  DeliveryStatus,
} from "../../application/ports";
import type { UserScope } from "../../shared/contracts";

export class D1DeliveryRepository implements DeliveryRepository {
  constructor(private readonly database: D1Database) {}

  async prepare(
    scope: UserScope,
    deliveryKey: string,
    jobId: string,
    now: Date,
  ): Promise<DeliveryStatus> {
    await this.database
      .prepare(
        `INSERT OR IGNORE INTO deliveries (
          delivery_key, scope_user_id, job_id, kind, status, attempt_count, created_at, updated_at
        ) VALUES (?, ?, ?, 'telegram_reply', 'pending', 0, ?, ?)`,
      )
      .bind(deliveryKey, scope.userId, jobId, now.getTime(), now.getTime())
      .run();
    const row = await this.database
      .prepare(
        "SELECT status FROM deliveries WHERE delivery_key = ? AND scope_user_id = ?",
      )
      .bind(deliveryKey, scope.userId)
      .first<{ status: DeliveryStatus }>();
    return row?.status ?? "permanent_failure";
  }

  async begin(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<"send" | "skip" | "ambiguous"> {
    const result = await this.database
      .prepare(
        `UPDATE deliveries
         SET status = 'sending', attempt_count = attempt_count + 1, updated_at = ?
         WHERE delivery_key = ? AND scope_user_id = ? AND status = 'pending'`,
      )
      .bind(now.getTime(), deliveryKey, scope.userId)
      .run();
    if (result.meta.changes === 1) {
      return "send";
    }

    const row = await this.database
      .prepare(
        "SELECT status FROM deliveries WHERE delivery_key = ? AND scope_user_id = ?",
      )
      .bind(deliveryKey, scope.userId)
      .first<{ status: DeliveryStatus }>();
    return row?.status === "sending" ? "ambiguous" : "skip";
  }

  async markSent(
    scope: UserScope,
    deliveryKey: string,
    remoteMessageId: string,
    now: Date,
  ): Promise<void> {
    await this.update(scope, deliveryKey, "sent", now, remoteMessageId, null);
  }

  async markAmbiguous(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void> {
    await this.update(
      scope,
      deliveryKey,
      "ambiguous",
      now,
      null,
      "AMBIGUOUS_EXTERNAL",
    );
  }

  async markRetryableFailure(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void> {
    await this.update(
      scope,
      deliveryKey,
      "pending",
      now,
      null,
      "RETRYABLE_EXTERNAL",
    );
  }

  async markPermanentFailure(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void> {
    await this.update(
      scope,
      deliveryKey,
      "permanent_failure",
      now,
      null,
      "PERMANENT_EXTERNAL",
    );
  }

  private async update(
    scope: UserScope,
    deliveryKey: string,
    status: DeliveryStatus,
    now: Date,
    remoteMessageId: string | null = null,
    lastErrorCode: string | null = null,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE deliveries
         SET status = ?, remote_message_id = ?, last_error_code = ?, updated_at = ?
         WHERE delivery_key = ? AND scope_user_id = ?`,
      )
      .bind(
        status,
        remoteMessageId,
        lastErrorCode,
        now.getTime(),
        deliveryKey,
        scope.userId,
      )
      .run();
  }
}
