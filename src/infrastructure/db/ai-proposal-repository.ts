import type {
  AiJobClaim,
  AiJobRecord,
  AiJobRegistration,
  AiProposalRepository,
  ConsumeConfirmationResult,
} from "../../application/ports/ai";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

interface JobRow {
  readonly status: AiJobRecord["status"];
  readonly plan_json: string | null;
  readonly reply_text: string | null;
  readonly lease_expires_at: number | null;
}

/**
 * Le proposte sono persistite prima di qualsiasi esecuzione: un retry rilegge
 * il piano invece di richiamare il modello (costo doppio) e invece di
 * riscrivere sul dominio (effetto doppio).
 */
export class D1AiProposalRepository implements AiProposalRepository {
  constructor(private readonly database: D1Database) {}

  async claim(
    scope: UserScope,
    jobId: string,
    registration: AiJobRegistration,
    now: Date,
    leaseSeconds: number,
  ): Promise<AiJobClaim> {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1) {
      throw new AppError("INVALID_INPUT", false);
    }
    const timestamp = now.getTime();
    const leaseExpiresAt = timestamp + leaseSeconds * 1_000;
    const inserted = await this.database
      .prepare(
        `INSERT OR IGNORE INTO ai_proposal_jobs (
           job_id, user_id, correlation_id, idempotency_key, status,
           schema_version, policy_version, model, plan_json, reply_text,
           failure_code, lease_expires_at, created_at, updated_at, expires_at
         ) VALUES (?, ?, ?, ?, 'claimed', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
      )
      .bind(
        jobId,
        scope.userId,
        registration.correlationId,
        registration.idempotencyKey,
        registration.schemaVersion,
        registration.policyVersion,
        registration.model,
        leaseExpiresAt,
        timestamp,
        timestamp,
        registration.expiresAt.getTime(),
      )
      .run();
    if (inserted.meta.changes === 1) return "claimed";

    const row = await this.database
      .prepare(
        `SELECT status, plan_json, reply_text, lease_expires_at
         FROM ai_proposal_jobs WHERE job_id = ? AND user_id = ?`,
      )
      .bind(jobId, scope.userId)
      .first<JobRow>();
    if (row === null) throw new AppError("INVALID_INPUT", false);
    if (row.status === "completed" || row.status === "failed") return "settled";
    if ((row.lease_expires_at ?? 0) > timestamp) return "busy";

    const renewed = await this.database
      .prepare(
        `UPDATE ai_proposal_jobs
         SET lease_expires_at = ?, updated_at = ?
         WHERE job_id = ? AND user_id = ?
           AND status IN ('claimed', 'planned')
           AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
      )
      .bind(leaseExpiresAt, timestamp, jobId, scope.userId, timestamp)
      .run();
    if (renewed.meta.changes !== 1) return "busy";
    return row.status === "planned" ? "resumed" : "claimed";
  }

  async savePlan(
    scope: UserScope,
    jobId: string,
    planJson: string,
    now: Date,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE ai_proposal_jobs
         SET status = 'planned', plan_json = ?, updated_at = ?
         WHERE job_id = ? AND user_id = ? AND status = 'claimed'`,
      )
      .bind(planJson, now.getTime(), jobId, scope.userId)
      .run();
  }

  async complete(
    scope: UserScope,
    jobId: string,
    replyText: string,
    now: Date,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE ai_proposal_jobs
         SET status = 'completed', reply_text = ?, lease_expires_at = NULL,
             updated_at = ?
         WHERE job_id = ? AND user_id = ? AND status IN ('claimed', 'planned')`,
      )
      .bind(replyText, now.getTime(), jobId, scope.userId)
      .run();
  }

  async fail(
    scope: UserScope,
    jobId: string,
    failureCode: string,
    now: Date,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE ai_proposal_jobs
         SET status = 'failed', failure_code = ?, lease_expires_at = NULL,
             updated_at = ?
         WHERE job_id = ? AND user_id = ? AND status IN ('claimed', 'planned')`,
      )
      .bind(failureCode, now.getTime(), jobId, scope.userId)
      .run();
  }

  async get(scope: UserScope, jobId: string): Promise<AiJobRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT status, plan_json, reply_text, lease_expires_at
         FROM ai_proposal_jobs WHERE job_id = ? AND user_id = ?`,
      )
      .bind(jobId, scope.userId)
      .first<JobRow>();
    return row === null
      ? null
      : {
          jobId,
          status: row.status,
          planJson: row.plan_json,
          replyText: row.reply_text,
        };
  }

  async createConfirmation(
    scope: UserScope,
    token: string,
    jobId: string,
    proposalIndex: number,
    expiresAt: Date,
    now: Date,
  ): Promise<void> {
    await this.database
      .prepare(
        `INSERT OR IGNORE INTO ai_proposal_confirmations (
           token, user_id, job_id, proposal_index, status, expires_at,
           created_at, used_at
         ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL)`,
      )
      .bind(
        token,
        scope.userId,
        jobId,
        proposalIndex,
        expiresAt.getTime(),
        now.getTime(),
      )
      .run();
  }

  /**
   * Consumo atomico: il token è single-use e user-bound, quindi due callback
   * concorrenti non eseguono due volte la stessa proposta.
   */
  async consumeConfirmation(
    scope: UserScope,
    token: string,
    now: Date,
  ): Promise<ConsumeConfirmationResult> {
    const timestamp = now.getTime();
    const consumed = await this.database
      .prepare(
        `UPDATE ai_proposal_confirmations
         SET status = 'used', used_at = ?
         WHERE token = ? AND user_id = ? AND status = 'pending'
           AND expires_at > ?
         RETURNING job_id, proposal_index`,
      )
      .bind(timestamp, token, scope.userId, timestamp)
      .first<{ job_id: string; proposal_index: number }>();
    if (consumed !== null) {
      const job = await this.get(scope, consumed.job_id);
      if (job?.planJson == null) return { outcome: "not_found" };
      return {
        outcome: "consumed",
        jobId: consumed.job_id,
        proposalIndex: consumed.proposal_index,
        planJson: job.planJson,
      };
    }
    const existing = await this.database
      .prepare(
        `SELECT status, expires_at FROM ai_proposal_confirmations
         WHERE token = ? AND user_id = ?`,
      )
      .bind(token, scope.userId)
      .first<{ status: "pending" | "used"; expires_at: number }>();
    if (existing === null) return { outcome: "not_found" };
    if (existing.status === "used") return { outcome: "used" };
    return { outcome: "expired" };
  }

  async purgeExpired(before: Date, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new AppError("INVALID_INPUT", false);
    }
    const confirmations = await this.database
      .prepare(
        `DELETE FROM ai_proposal_confirmations
         WHERE token IN (
           SELECT token FROM ai_proposal_confirmations
           WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
         )`,
      )
      .bind(before.getTime(), limit)
      .run();
    const jobs = await this.database
      .prepare(
        `DELETE FROM ai_proposal_jobs
         WHERE job_id IN (
           SELECT job_id FROM ai_proposal_jobs
           WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
         )`,
      )
      .bind(before.getTime(), limit)
      .run();
    return confirmations.meta.changes + jobs.meta.changes;
  }
}
