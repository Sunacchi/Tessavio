import type {
  IdentityRepository,
  IdentityResolution,
} from "../../application/ports/identity";
import { AppError } from "../../shared/errors";

export class D1IdentityRepository implements IdentityRepository {
  constructor(private readonly database: D1Database) {}

  async resolveOrCreate(
    telegramUserId: string,
    candidateUserId: string,
    auditId: string,
    correlationId: string,
    now: Date,
  ): Promise<IdentityResolution> {
    const timestamp = now.getTime();
    const auditKey = `identity-created:${candidateUserId}`;
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO users (id, status, created_at)
           SELECT ?, 'active', ?
           WHERE NOT EXISTS (
             SELECT 1 FROM telegram_identities WHERE telegram_user_id = ?
           )`,
        )
        .bind(candidateUserId, timestamp, telegramUserId),
      this.database
        .prepare(
          `INSERT OR IGNORE INTO telegram_identities (telegram_user_id, user_id, linked_at)
           SELECT ?, id, ? FROM users WHERE id = ?`,
        )
        .bind(telegramUserId, timestamp, candidateUserId),
      this.database
        .prepare(
          `INSERT OR IGNORE INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, user_id, user_id, 'identity.linked', 'user', user_id,
                  '{}', '{"status":"active"}', ?, ?, ?
           FROM telegram_identities
           WHERE telegram_user_id = ? AND user_id = ?`,
        )
        .bind(
          auditId,
          correlationId,
          auditKey,
          timestamp,
          telegramUserId,
          candidateUserId,
        ),
    ]);

    const row = await this.database
      .prepare(
        "SELECT user_id FROM telegram_identities WHERE telegram_user_id = ?",
      )
      .bind(telegramUserId)
      .first<{ user_id: string }>();
    if (row === null) {
      throw new AppError("INTERNAL_REDACTED", true);
    }

    return { userId: row.user_id, created: results[2]?.meta.changes === 1 };
  }

  async getTelegramUserId(
    scope: import("../../shared/contracts").UserScope,
  ): Promise<string | null> {
    const row = await this.database
      .prepare(
        "SELECT telegram_user_id FROM telegram_identities WHERE user_id = ?",
      )
      .bind(scope.userId)
      .first<{ telegram_user_id: string }>();
    return row?.telegram_user_id ?? null;
  }
}
