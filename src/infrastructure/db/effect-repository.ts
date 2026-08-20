import type {
  EffectKind,
  EffectRepository,
  EffectStatus,
} from "../../application/ports/effects";
import type { UserScope } from "../../shared/contracts";

export class D1EffectRepository implements EffectRepository {
  constructor(private readonly database: D1Database) {}

  async claim(
    scope: UserScope,
    effectKey: string,
    jobId: string,
    now: Date,
    kind: EffectKind,
  ): Promise<boolean> {
    const result = await this.database
      .prepare(
        `INSERT OR IGNORE INTO effects (
          effect_key, scope_user_id, job_id, kind, status, created_at
        ) VALUES (?, ?, ?, ?, 'claimed', ?)`,
      )
      .bind(effectKey, scope.userId, jobId, kind, now.getTime())
      .run();
    return result.meta.changes === 1;
  }

  async complete(
    scope: UserScope,
    effectKey: string,
    now: Date,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE effects SET status = 'completed', completed_at = ?
         WHERE effect_key = ? AND scope_user_id = ?`,
      )
      .bind(now.getTime(), effectKey, scope.userId)
      .run();
  }

  async release(scope: UserScope, effectKey: string): Promise<void> {
    await this.database
      .prepare(
        `DELETE FROM effects
         WHERE effect_key = ? AND scope_user_id = ? AND status = 'claimed'`,
      )
      .bind(effectKey, scope.userId)
      .run();
  }

  async get(scope: UserScope, effectKey: string): Promise<EffectStatus | null> {
    const row = await this.database
      .prepare(
        "SELECT status FROM effects WHERE effect_key = ? AND scope_user_id = ?",
      )
      .bind(effectKey, scope.userId)
      .first<{ status: EffectStatus }>();
    return row?.status ?? null;
  }
}
