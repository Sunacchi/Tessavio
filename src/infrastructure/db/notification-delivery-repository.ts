import type {
  NotificationDeliveryRepository,
  NotificationDeliveryStatus,
} from "../../application/ports";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

export class D1NotificationDeliveryRepository implements NotificationDeliveryRepository {
  constructor(private readonly database: D1Database) {}

  async prepare(
    scope: UserScope,
    dedupeKey: string,
    reminderId: string,
    jobId: string,
    now: Date,
  ): Promise<NotificationDeliveryStatus> {
    await this.database
      .prepare(
        `INSERT OR IGNORE INTO notification_deliveries (
           dedupe_key, scope_user_id, reminder_id, job_id, status,
           attempt_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
      )
      .bind(
        dedupeKey,
        scope.userId,
        reminderId,
        jobId,
        now.getTime(),
        now.getTime(),
      )
      .run();
    const row = await this.database
      .prepare(
        `SELECT status FROM notification_deliveries
         WHERE dedupe_key = ? AND scope_user_id = ? AND reminder_id = ?`,
      )
      .bind(dedupeKey, scope.userId, reminderId)
      .first<{ status: NotificationDeliveryStatus }>();
    return row?.status ?? "permanent_failure";
  }

  async begin(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<"send" | "skip" | "ambiguous"> {
    const result = await this.database
      .prepare(
        `UPDATE notification_deliveries
         SET status = 'sending', attempt_count = attempt_count + 1, updated_at = ?
         WHERE dedupe_key = ? AND scope_user_id = ? AND status = 'pending'`,
      )
      .bind(now.getTime(), dedupeKey, scope.userId)
      .run();
    if (result.meta.changes === 1) return "send";
    const row = await this.database
      .prepare(
        `SELECT status FROM notification_deliveries
         WHERE dedupe_key = ? AND scope_user_id = ?`,
      )
      .bind(dedupeKey, scope.userId)
      .first<{ status: NotificationDeliveryStatus }>();
    return row?.status === "sending" ? "ambiguous" : "skip";
  }

  markSent(
    scope: UserScope,
    dedupeKey: string,
    remoteMessageId: string,
    now: Date,
  ): Promise<void> {
    return this.update(scope, dedupeKey, "sent", now, remoteMessageId, null);
  }

  markRetryableFailure(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<void> {
    return this.update(
      scope,
      dedupeKey,
      "pending",
      now,
      null,
      "RETRYABLE_EXTERNAL",
    );
  }

  markPermanentFailure(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<void> {
    return this.update(
      scope,
      dedupeKey,
      "permanent_failure",
      now,
      null,
      "PERMANENT_EXTERNAL",
    );
  }

  markAmbiguous(scope: UserScope, dedupeKey: string, now: Date): Promise<void> {
    return this.update(
      scope,
      dedupeKey,
      "ambiguous",
      now,
      null,
      "AMBIGUOUS_EXTERNAL",
    );
  }

  async purgeTerminal(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("INVALID_INPUT", false);
    }
    const result = await this.database
      .prepare(
        `DELETE FROM notification_deliveries
         WHERE scope_user_id = ? AND dedupe_key IN (
           SELECT dedupe_key FROM notification_deliveries
           WHERE scope_user_id = ? AND created_at <= ?
             AND status IN ('sent', 'ambiguous', 'permanent_failure')
           ORDER BY created_at, dedupe_key LIMIT ?
         )`,
      )
      .bind(scope.userId, scope.userId, before.getTime(), limit)
      .run();
    return result.meta.changes;
  }

  private async update(
    scope: UserScope,
    dedupeKey: string,
    status: NotificationDeliveryStatus,
    now: Date,
    remoteMessageId: string | null,
    errorCode: string | null,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE notification_deliveries
         SET status = ?, remote_message_id = ?, last_error_code = ?, updated_at = ?
         WHERE dedupe_key = ? AND scope_user_id = ?`,
      )
      .bind(
        status,
        remoteMessageId,
        errorCode,
        now.getTime(),
        dedupeKey,
        scope.userId,
      )
      .run();
  }
}
