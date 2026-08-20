import type {
  AiBudgetRepository,
  AiCredentialRepository,
  AiOauthSessionRepository,
  BudgetReservation,
  ConsumeOauthSessionResult,
  OauthSessionRecord,
  StoredAiCredential,
} from "../../application/ports/ai-credentials";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

function boundedLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new AppError("INVALID_INPUT", false);
  }
  return limit;
}

export class D1AiOauthSessionRepository implements AiOauthSessionRepository {
  constructor(private readonly database: D1Database) {}

  async create(
    session: OauthSessionRecord,
    expiresAt: Date,
    now: Date,
  ): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO ai_oauth_sessions (
           session_id, user_id, chat_id, code_verifier, code_challenge, status,
           correlation_id, expires_at, created_at, consumed_at
         ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)`,
      )
      .bind(
        session.sessionId,
        session.userId,
        session.chatId,
        session.codeVerifier,
        session.codeChallenge,
        session.correlationId,
        expiresAt.getTime(),
        now.getTime(),
      )
      .run();
  }

  async consume(
    sessionId: string,
    now: Date,
  ): Promise<ConsumeOauthSessionResult> {
    const timestamp = now.getTime();
    const consumed = await this.database
      .prepare(
        `UPDATE ai_oauth_sessions
         SET status = 'consumed', consumed_at = ?
         WHERE session_id = ? AND status = 'pending' AND expires_at > ?
         RETURNING user_id, chat_id, code_verifier, code_challenge, correlation_id`,
      )
      .bind(timestamp, sessionId, timestamp)
      .first<{
        user_id: string;
        chat_id: string;
        code_verifier: string;
        code_challenge: string;
        correlation_id: string;
      }>();
    if (consumed !== null) {
      return {
        outcome: "consumed",
        session: {
          sessionId,
          userId: consumed.user_id,
          chatId: consumed.chat_id,
          codeVerifier: consumed.code_verifier,
          codeChallenge: consumed.code_challenge,
          correlationId: consumed.correlation_id,
        },
      };
    }
    const existing = await this.database
      .prepare(
        "SELECT status, expires_at FROM ai_oauth_sessions WHERE session_id = ?",
      )
      .bind(sessionId)
      .first<{ status: "pending" | "consumed"; expires_at: number }>();
    if (existing === null) return { outcome: "not_found" };
    return existing.status === "consumed"
      ? { outcome: "used" }
      : { outcome: "expired" };
  }

  async challengeOf(sessionId: string, now: Date): Promise<string | null> {
    const row = await this.database
      .prepare(
        `SELECT code_challenge FROM ai_oauth_sessions
         WHERE session_id = ? AND status = 'pending' AND expires_at > ?`,
      )
      .bind(sessionId, now.getTime())
      .first<{ code_challenge: string }>();
    return row?.code_challenge ?? null;
  }

  async purgeExpired(before: Date, limit: number): Promise<number> {
    const result = await this.database
      .prepare(
        `DELETE FROM ai_oauth_sessions
         WHERE session_id IN (
           SELECT session_id FROM ai_oauth_sessions
           WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
         )`,
      )
      .bind(before.getTime(), boundedLimit(limit))
      .run();
    return result.meta.changes;
  }
}

export class D1AiCredentialRepository implements AiCredentialRepository {
  constructor(private readonly database: D1Database) {}

  async save(
    scope: UserScope,
    credential: {
      readonly record: {
        readonly v: number;
        readonly kekVersion: number;
        readonly nonce: string;
        readonly wrappedDek: string;
        readonly ciphertext: string;
      };
      readonly label: string | null;
    },
    now: Date,
  ): Promise<void> {
    const timestamp = now.getTime();
    await this.database
      .prepare(
        `INSERT INTO ai_credentials (
           user_id, provider, status, record_version, kek_version, nonce,
           wrapped_dek, ciphertext, label, created_at, updated_at, revoked_at
         ) VALUES (?, 'openrouter', 'active', ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(user_id) DO UPDATE SET
           status = 'active',
           record_version = excluded.record_version,
           kek_version = excluded.kek_version,
           nonce = excluded.nonce,
           wrapped_dek = excluded.wrapped_dek,
           ciphertext = excluded.ciphertext,
           label = excluded.label,
           updated_at = excluded.updated_at,
           revoked_at = NULL`,
      )
      .bind(
        scope.userId,
        credential.record.v,
        credential.record.kekVersion,
        credential.record.nonce,
        credential.record.wrappedDek,
        credential.record.ciphertext,
        credential.label,
        timestamp,
        timestamp,
      )
      .run();
  }

  async get(scope: UserScope): Promise<StoredAiCredential | null> {
    const row = await this.database
      .prepare(
        `SELECT record_version, kek_version, nonce, wrapped_dek, ciphertext, label
         FROM ai_credentials WHERE user_id = ? AND status = 'active'`,
      )
      .bind(scope.userId)
      .first<{
        record_version: number;
        kek_version: number;
        nonce: string;
        wrapped_dek: string;
        ciphertext: string;
        label: string | null;
      }>();
    return row === null
      ? null
      : {
          provider: "openrouter",
          label: row.label,
          record: {
            v: row.record_version,
            kekVersion: row.kek_version,
            nonce: row.nonce,
            wrappedDek: row.wrapped_dek,
            ciphertext: row.ciphertext,
          },
        };
  }

  async revoke(scope: UserScope, now: Date): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE ai_credentials
         SET status = 'revoked', nonce = '', wrapped_dek = '', ciphertext = '',
             label = NULL, revoked_at = ?, updated_at = ?
         WHERE user_id = ? AND status = 'active'`,
      )
      .bind(now.getTime(), now.getTime(), scope.userId)
      .run();
    return result.meta.changes === 1;
  }
}

export class D1AiBudgetRepository implements AiBudgetRepository {
  constructor(private readonly database: D1Database) {}

  async reserve(
    scope: UserScope,
    entryKey: string,
    localDate: string,
    reservedMicros: number,
    dailyLimitMicros: number,
    now: Date,
  ): Promise<BudgetReservation> {
    if (!Number.isInteger(reservedMicros) || reservedMicros < 0) {
      throw new AppError("INVALID_INPUT", false);
    }
    const timestamp = now.getTime();
    const inserted = await this.database
      .prepare(
        `INSERT OR IGNORE INTO ai_budget_entries (
           entry_key, user_id, local_date, reserved_micros, actual_micros,
           status, created_at, updated_at
         )
         SELECT ?, ?, ?, ?, NULL, 'reserved', ?, ?
         WHERE (
           SELECT COALESCE(SUM(
             CASE WHEN status = 'settled' THEN actual_micros
                  ELSE reserved_micros END
           ), 0)
           FROM ai_budget_entries
           WHERE user_id = ? AND local_date = ?
             AND status IN ('reserved', 'settled')
         ) + ? <= ?`,
      )
      .bind(
        entryKey,
        scope.userId,
        localDate,
        reservedMicros,
        timestamp,
        timestamp,
        scope.userId,
        localDate,
        reservedMicros,
        dailyLimitMicros,
      )
      .run();
    if (inserted.meta.changes === 1) return { outcome: "reserved" };

    const existing = await this.database
      .prepare(
        "SELECT status FROM ai_budget_entries WHERE entry_key = ? AND user_id = ?",
      )
      .bind(entryKey, scope.userId)
      .first<{ status: string }>();
    if (existing !== null) {
      return { outcome: "duplicate", status: existing.status };
    }
    return {
      outcome: "exceeded",
      spentMicros: await this.spentMicros(scope, localDate),
    };
  }

  async settle(
    scope: UserScope,
    entryKey: string,
    actualMicros: number,
    now: Date,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE ai_budget_entries
         SET status = 'settled', actual_micros = ?, updated_at = ?
         WHERE entry_key = ? AND user_id = ? AND status = 'reserved'`,
      )
      .bind(
        Math.max(0, Math.trunc(actualMicros)),
        now.getTime(),
        entryKey,
        scope.userId,
      )
      .run();
  }

  async release(scope: UserScope, entryKey: string, now: Date): Promise<void> {
    await this.database
      .prepare(
        `UPDATE ai_budget_entries
         SET status = 'released', actual_micros = 0, updated_at = ?
         WHERE entry_key = ? AND user_id = ? AND status = 'reserved'`,
      )
      .bind(now.getTime(), entryKey, scope.userId)
      .run();
  }

  async spentMicros(scope: UserScope, localDate: string): Promise<number> {
    const row = await this.database
      .prepare(
        `SELECT COALESCE(SUM(
           CASE WHEN status = 'settled' THEN actual_micros
                ELSE reserved_micros END
         ), 0) AS total
         FROM ai_budget_entries
         WHERE user_id = ? AND local_date = ?
           AND status IN ('reserved', 'settled')`,
      )
      .bind(scope.userId, localDate)
      .first<{ total: number }>();
    return row?.total ?? 0;
  }

  async releaseStale(before: Date, limit: number): Promise<number> {
    const result = await this.database
      .prepare(
        `UPDATE ai_budget_entries
         SET status = 'released', actual_micros = 0, updated_at = ?
         WHERE entry_key IN (
           SELECT entry_key FROM ai_budget_entries
           WHERE status = 'reserved' AND updated_at <= ?
           ORDER BY updated_at LIMIT ?
         )`,
      )
      .bind(before.getTime(), before.getTime(), boundedLimit(limit))
      .run();
    return result.meta.changes;
  }
}
