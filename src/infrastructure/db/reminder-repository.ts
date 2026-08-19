import { z } from "zod";
import type {
  ClaimedReminder,
  MutateReminderResult,
  ReminderMutationContext,
  ReminderRepository,
  UndoReminderResult,
} from "../../application/ports";
import type { ReminderRecord } from "../../domains/reminders/reminders";
import type { ReminderDayWindow } from "../../domains/reminders/reminders";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

const storedSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(200),
  requested_at_utc: z.number().int(),
  due_at_utc: z.number().int(),
  original_time_zone: z.string().min(1),
  status: z.enum([
    "pending",
    "claimed",
    "sending",
    "sent",
    "cancelled",
    "permanent_failure",
    "ambiguous",
  ]),
  version: z.number().int().positive(),
  attempt_count: z.number().int().nonnegative(),
});

const claimSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  claim_job_id: z.uuid(),
  claim_correlation_id: z.uuid(),
  claimed_at: z.number().int(),
});

const duplicateSchema = z.object({
  after_json: z.string(),
  token: z.string().nullable(),
  expires_at: z.number().int().nullable(),
});

const undoSchema = z.object({
  reminder_id: z.string().min(1),
  before_json: z.string().nullable(),
  expected_version: z.number().int().positive(),
  expires_at: z.number().int(),
  consumed_at: z.number().int().nullable(),
});

function toRecord(value: unknown): ReminderRecord {
  const parsed = storedSchema.safeParse(value);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    id: parsed.data.id,
    text: parsed.data.text,
    requestedAtUtc: new Date(parsed.data.requested_at_utc),
    dueAtUtc: new Date(parsed.data.due_at_utc),
    originalTimeZone: parsed.data.original_time_zone,
    status: parsed.data.status,
    version: parsed.data.version,
    deliveryAttempts: parsed.data.attempt_count,
  };
}

function parseJsonRecord(value: string): ReminderRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  if (parsed === null) return null;
  const jsonSchema = z
    .object({
      id: z.string(),
      text: z.string(),
      requestedAtUtc: z.string(),
      dueAtUtc: z.string(),
      originalTimeZone: z.string(),
      status: storedSchema.shape.status,
      version: z.number().int().positive(),
      deliveryAttempts: z.number().int().nonnegative(),
    })
    .strict();
  const record = jsonSchema.safeParse(parsed);
  if (!record.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    ...record.data,
    requestedAtUtc: new Date(record.data.requestedAtUtc),
    dueAtUtc: new Date(record.data.dueAtUtc),
  };
}

function serialize(record: ReminderRecord | null): string {
  return JSON.stringify(record);
}

function envelopeFromClaim(row: z.infer<typeof claimSchema>) {
  return {
    version: 1 as const,
    type: "SEND_NOTIFICATION" as const,
    jobId: row.claim_job_id,
    correlationId: row.claim_correlation_id,
    idempotencyKey: `reminder-delivery:${row.id}`,
    createdAt: new Date(row.claimed_at).toISOString(),
    attempt: 0,
    payload: { reminderId: row.id, userId: row.user_id },
  };
}

export class D1ReminderRepository implements ReminderRepository {
  constructor(private readonly database: D1Database) {}

  async get(
    scope: UserScope,
    reminderId: string,
  ): Promise<ReminderRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, text, requested_at_utc, due_at_utc, original_time_zone,
                status, version, attempt_count
         FROM reminders WHERE id = ? AND user_id = ?`,
      )
      .bind(reminderId, scope.userId)
      .first();
    return row === null ? null : toRecord(row);
  }

  async listPending(
    scope: UserScope,
    limit: number,
  ): Promise<ReminderRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("INVALID_INPUT", false);
    }
    const rows = await this.database
      .prepare(
        `SELECT id, text, requested_at_utc, due_at_utc, original_time_zone,
                status, version, attempt_count
         FROM reminders
         WHERE user_id = ? AND status IN ('pending', 'claimed', 'sending')
         ORDER BY due_at_utc, id LIMIT ?`,
      )
      .bind(scope.userId, limit)
      .all();
    return rows.results.map(toRecord);
  }

  async listForDay(
    scope: UserScope,
    window: ReminderDayWindow,
    limit: number,
  ): Promise<ReminderRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("INVALID_INPUT", false);
    }
    const rows = await this.database
      .prepare(
        `SELECT id, text, requested_at_utc, due_at_utc, original_time_zone,
                status, version, attempt_count
         FROM reminders
         WHERE user_id = ? AND status IN ('pending', 'claimed', 'sending')
           AND due_at_utc >= ? AND due_at_utc < ?
         ORDER BY due_at_utc, id LIMIT ?`,
      )
      .bind(
        scope.userId,
        window.startAtUtc.getTime(),
        window.endAtUtc.getTime(),
        limit,
      )
      .all();
    return rows.results.map(toRecord);
  }

  async create(
    scope: UserScope,
    reminderId: string,
    values: {
      readonly text: string;
      readonly requestedAtUtc: Date;
      readonly originalTimeZone: string;
    },
    context: ReminderMutationContext,
  ): Promise<MutateReminderResult> {
    const duplicate = await this.findDuplicate(scope, context.idempotencyKey);
    if (duplicate !== null) return duplicate;
    const record: ReminderRecord = {
      id: reminderId,
      text: values.text,
      requestedAtUtc: values.requestedAtUtc,
      dueAtUtc: values.requestedAtUtc,
      originalTimeZone: values.originalTimeZone,
      status: "pending",
      version: 1,
      deliveryAttempts: 0,
    };
    const timestamp = context.now.getTime();
    const afterJson = serialize(record);
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO reminders (
             id, user_id, text, requested_at_utc, due_at_utc,
             original_time_zone, status, version, last_mutation_key,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?)`,
        )
        .bind(
          reminderId,
          scope.userId,
          values.text,
          values.requestedAtUtc.getTime(),
          values.requestedAtUtc.getTime(),
          values.originalTimeZone,
          context.idempotencyKey,
          timestamp,
          timestamp,
        ),
      this.auditStatement(
        scope,
        context,
        "reminder.created",
        reminderId,
        "null",
        afterJson,
        1,
      ),
      this.undoStatement(scope, context, reminderId, null, 1),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return {
      outcome: "created",
      reminder: record,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async cancel(
    scope: UserScope,
    reminderId: string,
    context: ReminderMutationContext,
  ): Promise<MutateReminderResult> {
    const duplicate = await this.findDuplicate(scope, context.idempotencyKey);
    if (duplicate !== null) return duplicate;
    const current = await this.get(scope, reminderId);
    if (current === null) return { outcome: "not_found" };
    if (current.status !== "pending") {
      return { outcome: "not_cancellable" };
    }
    const next: ReminderRecord = {
      ...current,
      status: "cancelled",
      version: current.version + 1,
    };
    const timestamp = context.now.getTime();
    const beforeJson = serialize(current);
    const afterJson = serialize(next);
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE reminders
           SET status = 'cancelled', version = ?, last_mutation_key = ?,
               cancelled_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND version = ?
             AND status = 'pending'`,
        )
        .bind(
          next.version,
          context.idempotencyKey,
          timestamp,
          timestamp,
          reminderId,
          scope.userId,
          current.version,
        ),
      this.auditStatement(
        scope,
        context,
        "reminder.cancelled",
        reminderId,
        beforeJson,
        afterJson,
        next.version,
      ),
      this.undoStatement(scope, context, reminderId, beforeJson, next.version),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return {
      outcome: "cancelled",
      reminder: next,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async undo(
    scope: UserScope,
    token: string,
    context: Omit<ReminderMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoReminderResult> {
    const duplicate = await this.database
      .prepare(
        `SELECT after_json FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ?
           AND action = 'reminder.reverted'`,
      )
      .bind(scope.userId, context.idempotencyKey)
      .first<{ after_json: string }>();
    if (duplicate !== null) {
      return {
        outcome: "duplicate",
        reminder: parseJsonRecord(duplicate.after_json),
      };
    }
    const row = await this.database
      .prepare(
        `SELECT reminder_id, before_json, expected_version, expires_at, consumed_at
         FROM reminder_undo_actions WHERE token = ? AND scope_user_id = ?`,
      )
      .bind(token, scope.userId)
      .first();
    const parsed = undoSchema.safeParse(row);
    if (!parsed.success) return { outcome: "not_found" };
    if (parsed.data.consumed_at !== null) return { outcome: "used" };
    if (parsed.data.expires_at <= context.now.getTime()) {
      return { outcome: "expired" };
    }
    const current = await this.get(scope, parsed.data.reminder_id);
    if (current?.version !== parsed.data.expected_version) {
      return { outcome: "stale" };
    }
    const previous =
      parsed.data.before_json === null
        ? null
        : parseJsonRecord(parsed.data.before_json);
    const restored =
      previous === null ? null : { ...previous, version: current.version + 1 };
    const timestamp = context.now.getTime();
    const claim = this.database
      .prepare(
        `UPDATE reminder_undo_actions
         SET consumed_at = ?, consumed_by_idempotency_key = ?
         WHERE token = ? AND scope_user_id = ? AND consumed_at IS NULL
           AND expires_at > ? AND expected_version = ?`,
      )
      .bind(
        timestamp,
        context.idempotencyKey,
        token,
        scope.userId,
        timestamp,
        current.version,
      );
    const mutation =
      restored === null
        ? this.database
            .prepare(
              `DELETE FROM reminders
               WHERE id = ? AND user_id = ? AND version = ?
                 AND status IN ('pending', 'cancelled')`,
            )
            .bind(current.id, scope.userId, current.version)
        : this.database
            .prepare(
              `UPDATE reminders
               SET text = ?, requested_at_utc = ?, due_at_utc = ?,
                   original_time_zone = ?, status = ?, version = ?,
                   last_mutation_key = ?, cancelled_at = NULL, updated_at = ?
               WHERE id = ? AND user_id = ? AND version = ?`,
            )
            .bind(
              restored.text,
              restored.requestedAtUtc.getTime(),
              restored.dueAtUtc.getTime(),
              restored.originalTimeZone,
              restored.status,
              restored.version,
              context.idempotencyKey,
              timestamp,
              restored.id,
              scope.userId,
              current.version,
            );
    const afterJson = serialize(restored);
    const results = await this.database.batch([
      claim,
      mutation,
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, 'reminder.reverted', 'reminder', ?, ?, ?, ?, ?, ?
           FROM reminder_undo_actions
           WHERE token = ? AND scope_user_id = ?
             AND consumed_by_idempotency_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          current.id,
          serialize(current),
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          token,
          scope.userId,
          context.idempotencyKey,
        ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return { outcome: "reverted", reminder: restored };
  }

  async purgeExpiredUndo(scope: UserScope, before: Date, limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("INVALID_INPUT", false);
    }
    const result = await this.database
      .prepare(
        `DELETE FROM reminder_undo_actions WHERE token IN (
           SELECT token FROM reminder_undo_actions
           WHERE scope_user_id = ? AND expires_at <= ?
           ORDER BY expires_at LIMIT ?
         )`,
      )
      .bind(scope.userId, before.getTime(), limit)
      .run();
    return result.meta.changes;
  }

  async claimDue(
    now: Date,
    leaseSeconds: number,
    limit: number,
    newId: () => string,
  ): Promise<ClaimedReminder[]> {
    const candidates = await this.database
      .prepare(
        `SELECT id, user_id FROM reminders
         WHERE status = 'pending' AND due_at_utc <= ?
         ORDER BY due_at_utc, id LIMIT ?`,
      )
      .bind(now.getTime(), limit)
      .all<{ id: string; user_id: string }>();
    const claimed: ClaimedReminder[] = [];
    for (const candidate of candidates.results) {
      const jobId = newId();
      const correlationId = newId();
      const result = await this.database
        .prepare(
          `UPDATE reminders
           SET status = 'claimed', version = version + 1,
               claim_job_id = ?, claim_correlation_id = ?, claimed_at = ?,
               claim_expires_at = ?, enqueued_at = NULL, updated_at = ?
           WHERE id = ? AND user_id = ? AND status = 'pending'
             AND due_at_utc <= ?
           RETURNING id, user_id, claim_job_id, claim_correlation_id, claimed_at`,
        )
        .bind(
          jobId,
          correlationId,
          now.getTime(),
          now.getTime() + leaseSeconds * 1_000,
          now.getTime(),
          candidate.id,
          candidate.user_id,
          now.getTime(),
        )
        .first();
      const row = claimSchema.safeParse(result);
      if (row.success) {
        claimed.push({
          scope: { userId: row.data.user_id },
          envelope: envelopeFromClaim(row.data),
        });
      }
    }
    return claimed;
  }

  async listRecoverableClaims(
    now: Date,
    enqueueRecoveryBefore: Date,
    limit: number,
  ): Promise<ClaimedReminder[]> {
    const rows = await this.database
      .prepare(
        `SELECT id, user_id, claim_job_id, claim_correlation_id, claimed_at
         FROM reminders
         WHERE status = 'claimed'
           AND ((enqueued_at IS NULL AND claimed_at <= ?) OR claim_expires_at <= ?)
         ORDER BY claimed_at, id LIMIT ?`,
      )
      .bind(enqueueRecoveryBefore.getTime(), now.getTime(), limit)
      .all();
    return rows.results.map((value) => {
      const row = claimSchema.safeParse(value);
      if (!row.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        scope: { userId: row.data.user_id },
        envelope: envelopeFromClaim(row.data),
      };
    });
  }

  async markEnqueued(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE reminders SET enqueued_at = ?, claim_expires_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND claim_job_id = ? AND status = 'claimed'`,
      )
      .bind(
        now.getTime(),
        now.getTime() + leaseSeconds * 1_000,
        now.getTime(),
        reminderId,
        scope.userId,
        jobId,
      )
      .run();
  }

  async getForDelivery(
    scope: UserScope,
    reminderId: string,
    jobId: string,
  ): Promise<ReminderRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, text, requested_at_utc, due_at_utc, original_time_zone,
                status, version, attempt_count
         FROM reminders
         WHERE id = ? AND user_id = ? AND claim_job_id = ?
           AND status IN ('claimed', 'sending')`,
      )
      .bind(reminderId, scope.userId, jobId)
      .first();
    return row === null ? null : toRecord(row);
  }

  async deferForQuietHours(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    dueAt: Date,
    preferenceVersion: number,
    quietStartMinute: number,
    quietEndMinute: number,
    now: Date,
  ): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE reminders
         SET status = 'pending', due_at_utc = ?, version = version + 1,
             delivery_preference_version = ?, delivery_quiet_start_minute = ?,
             delivery_quiet_end_minute = ?, claim_job_id = NULL,
             claim_correlation_id = NULL, claimed_at = NULL,
             claim_expires_at = NULL, enqueued_at = NULL, updated_at = ?
         WHERE id = ? AND user_id = ? AND claim_job_id = ? AND status = 'claimed'`,
      )
      .bind(
        dueAt.getTime(),
        preferenceVersion,
        quietStartMinute,
        quietEndMinute,
        now.getTime(),
        reminderId,
        scope.userId,
        jobId,
      )
      .run();
    return result.meta.changes === 1;
  }

  async markSending(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    preferenceVersion: number,
    quietStartMinute: number | null,
    quietEndMinute: number | null,
    now: Date,
  ): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE reminders
         SET status = 'sending', version = version + 1,
             attempt_count = attempt_count + 1,
             delivery_preference_version = ?, delivery_quiet_start_minute = ?,
             delivery_quiet_end_minute = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND claim_job_id = ? AND status = 'claimed'`,
      )
      .bind(
        preferenceVersion,
        quietStartMinute,
        quietEndMinute,
        now.getTime(),
        reminderId,
        scope.userId,
        jobId,
      )
      .run();
    return result.meta.changes === 1;
  }

  async markDeliveryOutcome(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    status: "claimed" | "sent" | "permanent_failure" | "ambiguous",
    now: Date,
    errorCode?: string,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE reminders
         SET status = ?, version = version + 1, last_error_code = ?,
             sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END,
             claim_expires_at = CASE WHEN ? = 'claimed' THEN claim_expires_at ELSE NULL END,
             updated_at = ?
         WHERE id = ? AND user_id = ? AND claim_job_id = ?
           AND status IN ('claimed', 'sending')`,
      )
      .bind(
        status,
        errorCode ?? null,
        status,
        now.getTime(),
        status,
        now.getTime(),
        reminderId,
        scope.userId,
        jobId,
      )
      .run();
  }

  private async findDuplicate(
    scope: UserScope,
    idempotencyKey: string,
  ): Promise<MutateReminderResult | null> {
    const row = await this.database
      .prepare(
        `SELECT a.after_json, u.token, u.expires_at
         FROM audit_log a
         LEFT JOIN reminder_undo_actions u
           ON u.scope_user_id = a.scope_user_id
          AND u.source_idempotency_key = a.idempotency_key
         WHERE a.scope_user_id = ? AND a.idempotency_key = ?
           AND a.action IN ('reminder.created', 'reminder.cancelled')`,
      )
      .bind(scope.userId, idempotencyKey)
      .first();
    if (row === null) return null;
    const parsed = duplicateSchema.safeParse(row);
    if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
    const reminder = parseJsonRecord(parsed.data.after_json);
    if (reminder === null) throw new AppError("INTERNAL_REDACTED", false);
    return {
      outcome: "duplicate",
      reminder,
      undoToken: parsed.data.token,
      undoExpiresAt:
        parsed.data.expires_at === null
          ? null
          : new Date(parsed.data.expires_at),
    };
  }

  private auditStatement(
    scope: UserScope,
    context: ReminderMutationContext,
    action: string,
    reminderId: string,
    beforeJson: string,
    afterJson: string,
    version: number,
  ) {
    return this.database
      .prepare(
        `INSERT INTO audit_log (
           id, scope_user_id, actor_user_id, action, entity_type, entity_id,
           before_json, after_json, correlation_id, idempotency_key, created_at
         )
         SELECT ?, ?, ?, ?, 'reminder', ?, ?, ?, ?, ?, ?
         FROM reminders
         WHERE id = ? AND user_id = ? AND version = ? AND last_mutation_key = ?`,
      )
      .bind(
        context.auditId,
        scope.userId,
        context.actorUserId,
        action,
        reminderId,
        beforeJson,
        afterJson,
        context.correlationId,
        context.idempotencyKey,
        context.now.getTime(),
        reminderId,
        scope.userId,
        version,
        context.idempotencyKey,
      );
  }

  private undoStatement(
    scope: UserScope,
    context: ReminderMutationContext,
    reminderId: string,
    beforeJson: string | null,
    version: number,
  ) {
    return this.database
      .prepare(
        `INSERT INTO reminder_undo_actions (
           token, scope_user_id, reminder_id, source_idempotency_key,
           before_json, expected_version, expires_at, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ?`,
      )
      .bind(
        context.undoToken,
        scope.userId,
        reminderId,
        context.idempotencyKey,
        beforeJson,
        version,
        context.undoExpiresAt.getTime(),
        context.now.getTime(),
        scope.userId,
        context.idempotencyKey,
      );
  }
}
