import { z } from "zod";
import type {
  DueReminderRecurrenceCandidate,
  MaterializeReminderOccurrenceContext,
  MutateReminderRecurrenceResult,
  ReminderRecurrenceMutationContext,
  ReminderRecurrenceRepository,
  UndoReminderRecurrenceResult,
} from "../../application/ports/recurrences";
import type {
  ReminderOccurrencePlan,
  ReminderRecurrenceRecord,
  ReminderRecurrenceValues,
} from "../../domains/reminders/recurrence";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

const storedSchema = z.object({
  id: z.string().min(1).max(128),
  text: z.string().min(1).max(200),
  frequency: z.enum(["daily", "weekly"]),
  local_time: z.string().regex(/^\d{2}:\d{2}$/u),
  time_zone: z.string().min(1),
  next_local_date: z.iso.date(),
  next_due_at_utc: z.number().int(),
  status: z.enum(["active", "cancelled"]),
  version: z.number().int().positive(),
});

const candidateSchema = z.object({
  id: z.string().min(1).max(128),
  user_id: z.string().min(1).max(128),
});

const duplicateSchema = z.object({
  after_json: z.string(),
  token: z.string().nullable(),
  expires_at: z.number().int().nullable(),
});

const undoSchema = z.object({
  recurrence_id: z.string().min(1).max(128),
  before_json: z.string().nullable(),
  expected_version: z.number().int().positive(),
  expires_at: z.number().int(),
  consumed_at: z.number().int().nullable(),
});

function toRecord(value: unknown): ReminderRecurrenceRecord {
  const parsed = storedSchema.safeParse(value);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    id: parsed.data.id,
    text: parsed.data.text,
    frequency: parsed.data.frequency,
    localTime: parsed.data.local_time,
    timeZone: parsed.data.time_zone,
    nextLocalDate: parsed.data.next_local_date,
    nextDueAtUtc: new Date(parsed.data.next_due_at_utc),
    status: parsed.data.status,
    version: parsed.data.version,
  };
}

function parseJsonRecord(value: string): ReminderRecurrenceRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  if (parsed === null) return null;
  const record = z
    .object({
      id: z.string().min(1).max(128),
      text: z.string().min(1).max(200),
      frequency: z.enum(["daily", "weekly"]),
      localTime: z.string().regex(/^\d{2}:\d{2}$/u),
      timeZone: z.string().min(1),
      nextLocalDate: z.iso.date(),
      nextDueAtUtc: z.iso.datetime({ offset: true }),
      status: z.enum(["active", "cancelled"]),
      version: z.number().int().positive(),
    })
    .strict()
    .safeParse(parsed);
  if (!record.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    ...record.data,
    nextDueAtUtc: new Date(record.data.nextDueAtUtc),
  };
}

function serialize(value: ReminderRecurrenceRecord | null): string {
  return JSON.stringify(value);
}

export class D1ReminderRecurrenceRepository implements ReminderRecurrenceRepository {
  constructor(private readonly database: D1Database) {}

  async get(
    scope: UserScope,
    recurrenceId: string,
  ): Promise<ReminderRecurrenceRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, text, frequency, local_time, time_zone, next_local_date,
                next_due_at_utc, status, version
         FROM reminder_recurrences WHERE id = ? AND user_id = ?`,
      )
      .bind(recurrenceId, scope.userId)
      .first();
    return row === null ? null : toRecord(row);
  }

  async listActive(
    scope: UserScope,
    limit: number,
  ): Promise<ReminderRecurrenceRecord[]> {
    this.validateLimit(limit);
    const rows = await this.database
      .prepare(
        `SELECT id, text, frequency, local_time, time_zone, next_local_date,
                next_due_at_utc, status, version
         FROM reminder_recurrences
         WHERE user_id = ? AND status = 'active'
         ORDER BY next_due_at_utc, id LIMIT ?`,
      )
      .bind(scope.userId, limit)
      .all();
    return rows.results.map(toRecord);
  }

  async create(
    scope: UserScope,
    recurrenceId: string,
    values: ReminderRecurrenceValues,
    context: ReminderRecurrenceMutationContext,
  ): Promise<MutateReminderRecurrenceResult> {
    const duplicate = await this.findDuplicate(scope, context.idempotencyKey);
    if (duplicate !== null) return duplicate;
    const record: ReminderRecurrenceRecord = {
      id: recurrenceId,
      ...values,
      status: "active",
      version: 1,
    };
    const timestamp = context.now.getTime();
    const afterJson = serialize(record);
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO reminder_recurrences (
             id, user_id, text, frequency, local_time, time_zone,
             next_local_date, next_due_at_utc, status, version,
             last_mutation_key, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)`,
        )
        .bind(
          recurrenceId,
          scope.userId,
          values.text,
          values.frequency,
          values.localTime,
          values.timeZone,
          values.nextLocalDate,
          values.nextDueAtUtc.getTime(),
          context.idempotencyKey,
          timestamp,
          timestamp,
        ),
      this.auditStatement(
        scope,
        context,
        "reminder.recurrence.created",
        recurrenceId,
        "null",
        afterJson,
        1,
      ),
      this.undoStatement(scope, context, recurrenceId, null, 1),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return {
      outcome: "created",
      recurrence: record,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async cancel(
    scope: UserScope,
    recurrenceId: string,
    expectedVersion: number,
    context: ReminderRecurrenceMutationContext,
  ): Promise<MutateReminderRecurrenceResult> {
    const duplicate = await this.findDuplicate(scope, context.idempotencyKey);
    if (duplicate !== null) return duplicate;
    const current = await this.get(scope, recurrenceId);
    if (current === null) return { outcome: "not_found" };
    if (current.version !== expectedVersion) return { outcome: "stale" };
    if (current.status !== "active") return { outcome: "not_cancellable" };
    const next: ReminderRecurrenceRecord = {
      ...current,
      status: "cancelled",
      version: current.version + 1,
    };
    const timestamp = context.now.getTime();
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE reminder_recurrences
           SET status = 'cancelled', version = ?, last_mutation_key = ?,
               cancelled_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND version = ? AND status = 'active'`,
        )
        .bind(
          next.version,
          context.idempotencyKey,
          timestamp,
          timestamp,
          recurrenceId,
          scope.userId,
          expectedVersion,
        ),
      this.auditStatement(
        scope,
        context,
        "reminder.recurrence.cancelled",
        recurrenceId,
        serialize(current),
        serialize(next),
        next.version,
      ),
      this.undoStatement(
        scope,
        context,
        recurrenceId,
        serialize(current),
        next.version,
      ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return {
      outcome: "cancelled",
      recurrence: next,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async undo(
    scope: UserScope,
    token: string,
    context: Omit<
      ReminderRecurrenceMutationContext,
      "undoToken" | "undoExpiresAt" | "provenance"
    >,
  ): Promise<UndoReminderRecurrenceResult> {
    const duplicate = await this.database
      .prepare(
        `SELECT after_json FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ?
           AND action = 'reminder.recurrence.reverted'`,
      )
      .bind(scope.userId, context.idempotencyKey)
      .first<{ after_json: string }>();
    if (duplicate !== null) {
      return {
        outcome: "duplicate",
        recurrence: parseJsonRecord(duplicate.after_json),
      };
    }
    const row = await this.database
      .prepare(
        `SELECT recurrence_id, before_json, expected_version, expires_at,
                consumed_at
         FROM reminder_recurrence_undo_actions
         WHERE token = ? AND scope_user_id = ?`,
      )
      .bind(token, scope.userId)
      .first();
    const parsed = undoSchema.safeParse(row);
    if (!parsed.success) return { outcome: "not_found" };
    if (parsed.data.consumed_at !== null) return { outcome: "used" };
    if (parsed.data.expires_at <= context.now.getTime()) {
      return { outcome: "expired" };
    }
    const current = await this.get(scope, parsed.data.recurrence_id);
    if (current?.version !== parsed.data.expected_version) {
      return { outcome: "stale" };
    }
    const previous =
      parsed.data.before_json === null
        ? null
        : parseJsonRecord(parsed.data.before_json);
    if (previous === null) {
      const occurrence = await this.database
        .prepare(
          `SELECT reminder_id FROM reminder_recurrence_occurrences
           WHERE user_id = ? AND recurrence_id = ? LIMIT 1`,
        )
        .bind(scope.userId, current.id)
        .first();
      if (occurrence !== null) return { outcome: "stale" };
    }
    const restored =
      previous === null ? null : { ...previous, version: current.version + 1 };
    const timestamp = context.now.getTime();
    const claim = this.database
      .prepare(
        `UPDATE reminder_recurrence_undo_actions
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
              `DELETE FROM reminder_recurrences
               WHERE id = ? AND user_id = ? AND version = ?`,
            )
            .bind(current.id, scope.userId, current.version)
        : this.database
            .prepare(
              `UPDATE reminder_recurrences
               SET text = ?, frequency = ?, local_time = ?, time_zone = ?,
                   next_local_date = ?, next_due_at_utc = ?, status = ?,
                   version = ?, last_mutation_key = ?, cancelled_at = ?,
                   updated_at = ?
               WHERE id = ? AND user_id = ? AND version = ?`,
            )
            .bind(
              restored.text,
              restored.frequency,
              restored.localTime,
              restored.timeZone,
              restored.nextLocalDate,
              restored.nextDueAtUtc.getTime(),
              restored.status,
              restored.version,
              context.idempotencyKey,
              restored.status === "cancelled" ? timestamp : null,
              timestamp,
              restored.id,
              scope.userId,
              current.version,
            );
    const results = await this.database.batch([
      claim,
      mutation,
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, 'reminder.recurrence.reverted',
                  'reminder_recurrence', ?, ?, ?, ?, ?, ?
           FROM reminder_recurrence_undo_actions
           WHERE token = ? AND scope_user_id = ?
             AND consumed_by_idempotency_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          current.id,
          serialize(current),
          serialize(restored),
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
    return { outcome: "reverted", recurrence: restored };
  }

  async purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number> {
    this.validateLimit(limit);
    const result = await this.database
      .prepare(
        `DELETE FROM reminder_recurrence_undo_actions WHERE token IN (
           SELECT token FROM reminder_recurrence_undo_actions
           WHERE scope_user_id = ? AND expires_at <= ?
           ORDER BY expires_at LIMIT ?
         )`,
      )
      .bind(scope.userId, before.getTime(), limit)
      .run();
    return result.meta.changes;
  }

  async listDueCandidates(
    now: Date,
    limit: number,
  ): Promise<DueReminderRecurrenceCandidate[]> {
    this.validateLimit(limit);
    const rows = await this.database
      .prepare(
        `SELECT id, user_id FROM reminder_recurrences
         WHERE status = 'active' AND next_due_at_utc <= ?
         ORDER BY next_due_at_utc, id LIMIT ?`,
      )
      .bind(now.getTime(), limit)
      .all();
    return rows.results.map((value) => {
      const parsed = candidateSchema.safeParse(value);
      if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        scope: { userId: parsed.data.user_id },
        recurrenceId: parsed.data.id,
      };
    });
  }

  async materializeOccurrence(
    scope: UserScope,
    recurrenceId: string,
    expectedVersion: number,
    plan: ReminderOccurrencePlan,
    context: MaterializeReminderOccurrenceContext,
  ): Promise<"generated" | "duplicate" | "stale"> {
    const duplicate = await this.database
      .prepare(
        `SELECT reminder_id FROM reminder_recurrence_occurrences
         WHERE user_id = ? AND recurrence_id = ? AND scheduled_local = ?`,
      )
      .bind(scope.userId, recurrenceId, plan.scheduledLocal)
      .first();
    if (duplicate !== null) return "duplicate";
    const timestamp = context.now.getTime();
    const beforeJson = JSON.stringify({
      scheduledLocal: plan.scheduledLocal,
      dueAtUtc: plan.dueAtUtc,
    });
    const afterJson = JSON.stringify({
      reminderId: context.occurrenceId,
      nextLocalDate: plan.nextLocalDate,
      nextDueAtUtc: plan.nextDueAtUtc,
    });
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE reminder_recurrences
           SET next_local_date = ?, next_due_at_utc = ?, version = version + 1,
               last_generation_key = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND version = ? AND status = 'active'
             AND next_due_at_utc = ? AND next_due_at_utc <= ?`,
        )
        .bind(
          plan.nextLocalDate,
          plan.nextDueAtUtc.getTime(),
          context.generationKey,
          timestamp,
          recurrenceId,
          scope.userId,
          expectedVersion,
          plan.dueAtUtc.getTime(),
          timestamp,
        ),
      this.database
        .prepare(
          `INSERT INTO reminders (
             id, user_id, text, requested_at_utc, due_at_utc,
             original_time_zone, status, version, last_mutation_key,
             created_at, updated_at
           )
           SELECT ?, user_id, text, ?, ?, time_zone, 'pending', 1, ?, ?, ?
           FROM reminder_recurrences
           WHERE id = ? AND user_id = ? AND last_generation_key = ?`,
        )
        .bind(
          context.occurrenceId,
          plan.dueAtUtc.getTime(),
          plan.dueAtUtc.getTime(),
          context.generationKey,
          timestamp,
          timestamp,
          recurrenceId,
          scope.userId,
          context.generationKey,
        ),
      this.database
        .prepare(
          `INSERT INTO reminder_recurrence_occurrences (
             reminder_id, user_id, recurrence_id, scheduled_local,
             due_at_utc, source, created_at
           )
           SELECT ?, user_id, id, ?, ?, 'calculated_recurrence', ?
           FROM reminder_recurrences
           WHERE id = ? AND user_id = ? AND last_generation_key = ?`,
        )
        .bind(
          context.occurrenceId,
          plan.scheduledLocal,
          plan.dueAtUtc.getTime(),
          timestamp,
          recurrenceId,
          scope.userId,
          context.generationKey,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, user_id, user_id, 'reminder.recurrence.generated',
                  'reminder_recurrence', id, ?, ?, ?, ?, ?
           FROM reminder_recurrences
           WHERE id = ? AND user_id = ? AND last_generation_key = ?`,
        )
        .bind(
          context.auditId,
          beforeJson,
          afterJson,
          context.correlationId,
          context.generationKey,
          timestamp,
          recurrenceId,
          scope.userId,
          context.generationKey,
        ),
    ]);
    if (results.every((result) => result.meta.changes === 1)) {
      return "generated";
    }
    if (results.every((result) => result.meta.changes === 0)) return "stale";
    throw new AppError("INTERNAL_REDACTED", true);
  }

  private validateLimit(limit: number): void {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("INVALID_INPUT", false);
    }
  }

  private async findDuplicate(
    scope: UserScope,
    idempotencyKey: string,
  ): Promise<MutateReminderRecurrenceResult | null> {
    const row = await this.database
      .prepare(
        `SELECT a.after_json, u.token, u.expires_at
         FROM audit_log a
         LEFT JOIN reminder_recurrence_undo_actions u
           ON u.scope_user_id = a.scope_user_id
          AND u.source_idempotency_key = a.idempotency_key
         WHERE a.scope_user_id = ? AND a.idempotency_key = ?
           AND a.action IN (
             'reminder.recurrence.created', 'reminder.recurrence.cancelled'
           )`,
      )
      .bind(scope.userId, idempotencyKey)
      .first();
    if (row === null) return null;
    const parsed = duplicateSchema.safeParse(row);
    if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
    const recurrence = parseJsonRecord(parsed.data.after_json);
    if (recurrence === null) throw new AppError("INTERNAL_REDACTED", false);
    return {
      outcome: "duplicate",
      recurrence,
      undoToken: parsed.data.token,
      undoExpiresAt:
        parsed.data.expires_at === null
          ? null
          : new Date(parsed.data.expires_at),
    };
  }

  private auditStatement(
    scope: UserScope,
    context: ReminderRecurrenceMutationContext,
    action: string,
    recurrenceId: string,
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
         SELECT ?, ?, ?, ?, 'reminder_recurrence', ?, ?, ?, ?, ?, ?
         FROM reminder_recurrences
         WHERE id = ? AND user_id = ? AND version = ? AND last_mutation_key = ?`,
      )
      .bind(
        context.auditId,
        scope.userId,
        context.actorUserId,
        action,
        recurrenceId,
        beforeJson,
        afterJson,
        context.correlationId,
        context.idempotencyKey,
        context.now.getTime(),
        recurrenceId,
        scope.userId,
        version,
        context.idempotencyKey,
      );
  }

  private undoStatement(
    scope: UserScope,
    context: ReminderRecurrenceMutationContext,
    recurrenceId: string,
    beforeJson: string | null,
    version: number,
  ) {
    return this.database
      .prepare(
        `INSERT INTO reminder_recurrence_undo_actions (
           token, scope_user_id, recurrence_id, source_idempotency_key,
           before_json, expected_version, expires_at, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ?`,
      )
      .bind(
        context.undoToken,
        scope.userId,
        recurrenceId,
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
