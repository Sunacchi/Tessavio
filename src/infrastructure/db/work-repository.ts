import { z } from "zod";
import type {
  MutateWorkResult,
  UndoWorkResult,
  WorkEntityKind,
  WorkMutationContext,
  WorkRepository,
} from "../../application/ports";
import {
  calculateWorkReport,
  workListLimit,
  workReportRecordLimit,
  type PlannedShiftRecord,
  type WorkBreakRecord,
  type WorkBreakValues,
  type WorkDayRecords,
  type WorkIntervalValues,
  type WorkLogRecord,
  type WorkReport,
  type WorkReportWindow,
  type WorkRuleRecord,
  type WorkRuleValues,
  type WorkWindow,
} from "../../domains/work/work";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

const baseSchema = {
  id: z.string().min(1),
  version: z.number().int().positive(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
};
const ruleRowSchema = z.object({
  ...baseSchema,
  name: z.string().min(1).max(100),
  break_treatment: z.enum(["paid", "unpaid"]),
});
const intervalRowSchema = z.object({
  ...baseSchema,
  title: z.string().min(1).max(200),
  start_at_utc: z.number().int(),
  end_at_utc: z.number().int(),
  original_time_zone: z.string().min(1),
});
const logRowSchema = intervalRowSchema.extend({
  rule_id: z.string().min(1),
  rule_version: z.number().int().positive(),
  rule_name: z.string().min(1).max(100),
  break_treatment: z.enum(["paid", "unpaid"]),
});
const breakRowSchema = z.object({
  ...baseSchema,
  work_log_id: z.string().min(1),
  start_at_utc: z.number().int(),
  end_at_utc: z.number().int(),
  original_time_zone: z.string().min(1),
});
const duplicateSchema = z.object({
  entity_type: z.enum(["work_rule", "planned_shift", "work_log", "work_break"]),
  entity_id: z.string().min(1),
  after_json: z.string(),
  token: z.string().nullable(),
  expires_at: z.number().int().nullable(),
  consumed_at: z.number().int().nullable(),
});
const undoSchema = z.object({
  entity_kind: z.enum(["rule", "shift", "log", "break"]),
  entity_id: z.string().min(1),
  expected_version: z.number().int().positive(),
  expires_at: z.number().int(),
  consumed_at: z.number().int().nullable(),
});
const auditBaseSchema = {
  id: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
};
const auditRuleSchema = z.object({
  ...auditBaseSchema,
  name: z.string().min(1).max(100),
  breakTreatment: z.enum(["paid", "unpaid"]),
});
const auditShiftSchema = z.object({
  ...auditBaseSchema,
  title: z.string().min(1).max(200),
  startAtUtc: z.iso.datetime({ offset: true }),
  endAtUtc: z.iso.datetime({ offset: true }),
  originalTimeZone: z.string().min(1),
});
const auditLogSchema = auditShiftSchema.extend({
  ruleId: z.string().min(1),
  ruleVersion: z.number().int().positive(),
  ruleName: z.string().min(1).max(100),
  breakTreatment: z.enum(["paid", "unpaid"]),
});
const auditBreakSchema = z.object({
  ...auditBaseSchema,
  workLogId: z.string().min(1),
  startAtUtc: z.iso.datetime({ offset: true }),
  endAtUtc: z.iso.datetime({ offset: true }),
  originalTimeZone: z.string().min(1),
});

const ruleColumns =
  "id, name, break_treatment, version, created_at, updated_at";
const intervalColumns =
  "id, title, start_at_utc, end_at_utc, original_time_zone, version, created_at, updated_at";
const logColumns = `${intervalColumns}, rule_id, rule_version, rule_name, break_treatment`;
const breakColumns =
  "id, work_log_id, start_at_utc, end_at_utc, original_time_zone, version, created_at, updated_at";

function ruleFromRow(value: unknown): WorkRuleRecord {
  const result = ruleRowSchema.safeParse(value);
  if (!result.success) throw new AppError("INTERNAL_REDACTED", false);
  const row = result.data;
  return {
    id: row.id,
    name: row.name,
    breakTreatment: row.break_treatment,
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function shiftFromRow(value: unknown): PlannedShiftRecord {
  const result = intervalRowSchema.safeParse(value);
  if (!result.success) throw new AppError("INTERNAL_REDACTED", false);
  const row = result.data;
  return {
    id: row.id,
    title: row.title,
    startAtUtc: new Date(row.start_at_utc),
    endAtUtc: new Date(row.end_at_utc),
    originalTimeZone: row.original_time_zone,
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function logFromRow(value: unknown): WorkLogRecord {
  const result = logRowSchema.safeParse(value);
  if (!result.success) throw new AppError("INTERNAL_REDACTED", false);
  const row = result.data;
  return {
    ...shiftFromRow(row),
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    ruleName: row.rule_name,
    breakTreatment: row.break_treatment,
  };
}

function breakFromRow(value: unknown): WorkBreakRecord {
  const result = breakRowSchema.safeParse(value);
  if (!result.success) throw new AppError("INTERNAL_REDACTED", false);
  const row = result.data;
  return {
    id: row.id,
    workLogId: row.work_log_id,
    startAtUtc: new Date(row.start_at_utc),
    endAtUtc: new Date(row.end_at_utc),
    originalTimeZone: row.original_time_zone,
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("INVALID_INPUT", false);
  }
}

function entityType(kind: WorkEntityKind): string {
  switch (kind) {
    case "rule":
      return "work_rule";
    case "shift":
      return "planned_shift";
    case "log":
      return "work_log";
    case "break":
      return "work_break";
  }
}

function createdAction(kind: WorkEntityKind): string {
  return `work.${kind}.created`;
}

function parseAuditJson(
  kind: WorkEntityKind,
  value: string,
): WorkRuleRecord | PlannedShiftRecord | WorkLogRecord | WorkBreakRecord {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  switch (kind) {
    case "rule": {
      const parsed = auditRuleSchema.safeParse(json);
      if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        ...parsed.data,
        createdAt: new Date(parsed.data.createdAt),
        updatedAt: new Date(parsed.data.updatedAt),
      };
    }
    case "shift": {
      const parsed = auditShiftSchema.safeParse(json);
      if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        ...parsed.data,
        startAtUtc: new Date(parsed.data.startAtUtc),
        endAtUtc: new Date(parsed.data.endAtUtc),
        createdAt: new Date(parsed.data.createdAt),
        updatedAt: new Date(parsed.data.updatedAt),
      };
    }
    case "log": {
      const parsed = auditLogSchema.safeParse(json);
      if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        ...parsed.data,
        startAtUtc: new Date(parsed.data.startAtUtc),
        endAtUtc: new Date(parsed.data.endAtUtc),
        createdAt: new Date(parsed.data.createdAt),
        updatedAt: new Date(parsed.data.updatedAt),
      };
    }
    case "break": {
      const parsed = auditBreakSchema.safeParse(json);
      if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        ...parsed.data,
        startAtUtc: new Date(parsed.data.startAtUtc),
        endAtUtc: new Date(parsed.data.endAtUtc),
        createdAt: new Date(parsed.data.createdAt),
        updatedAt: new Date(parsed.data.updatedAt),
      };
    }
  }
}

export class D1WorkRepository implements WorkRepository {
  constructor(private readonly database: D1Database) {}

  async getRule(
    scope: UserScope,
    ruleId: string,
  ): Promise<WorkRuleRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT ${ruleColumns} FROM work_rules WHERE user_id = ? AND id = ?`,
      )
      .bind(scope.userId, ruleId)
      .first();
    return row === null ? null : ruleFromRow(row);
  }

  async listRules(scope: UserScope, limit: number): Promise<WorkRuleRecord[]> {
    validateLimit(limit);
    const rows = await this.database
      .prepare(
        `SELECT ${ruleColumns} FROM work_rules WHERE user_id = ? ORDER BY created_at, id LIMIT ?`,
      )
      .bind(scope.userId, limit)
      .all();
    return rows.results.map(ruleFromRow);
  }

  async getShift(
    scope: UserScope,
    shiftId: string,
  ): Promise<PlannedShiftRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT ${intervalColumns} FROM planned_shifts WHERE user_id = ? AND id = ?`,
      )
      .bind(scope.userId, shiftId)
      .first();
    return row === null ? null : shiftFromRow(row);
  }

  async getLog(
    scope: UserScope,
    workLogId: string,
  ): Promise<WorkLogRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT ${logColumns} FROM work_logs WHERE user_id = ? AND id = ?`,
      )
      .bind(scope.userId, workLogId)
      .first();
    return row === null ? null : logFromRow(row);
  }

  async getBreak(
    scope: UserScope,
    workBreakId: string,
  ): Promise<WorkBreakRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT ${breakColumns} FROM work_breaks WHERE user_id = ? AND id = ?`,
      )
      .bind(scope.userId, workBreakId)
      .first();
    return row === null ? null : breakFromRow(row);
  }

  private async loadRecords(
    scope: UserScope,
    window: WorkWindow,
    limit: number | null,
  ): Promise<WorkDayRecords> {
    const suffix = limit === null ? "" : ` LIMIT ${String(limit)}`;
    const bindings = [
      scope.userId,
      window.endAtUtc.getTime(),
      window.startAtUtc.getTime(),
    ] as const;
    const [shifts, logs, breaks] = await Promise.all([
      this.database
        .prepare(
          `SELECT ${intervalColumns} FROM planned_shifts WHERE user_id = ? AND start_at_utc < ? AND end_at_utc > ? ORDER BY start_at_utc, id${suffix}`,
        )
        .bind(...bindings)
        .all(),
      this.database
        .prepare(
          `SELECT ${logColumns} FROM work_logs WHERE user_id = ? AND start_at_utc < ? AND end_at_utc > ? ORDER BY start_at_utc, id${suffix}`,
        )
        .bind(...bindings)
        .all(),
      this.database
        .prepare(
          `SELECT ${breakColumns} FROM work_breaks WHERE user_id = ? AND start_at_utc < ? AND end_at_utc > ? ORDER BY start_at_utc, id${suffix}`,
        )
        .bind(...bindings)
        .all(),
    ]);
    return {
      plannedShifts: shifts.results.map(shiftFromRow),
      workLogs: logs.results.map(logFromRow),
      breaks: breaks.results.map(breakFromRow),
      truncated: false,
      plannedShiftsTruncated: false,
    };
  }

  async listForDay(
    scope: UserScope,
    window: WorkWindow,
  ): Promise<WorkDayRecords> {
    const records = await this.loadRecords(scope, window, workListLimit + 1);
    const plannedShiftsTruncated = records.plannedShifts.length > workListLimit;
    return {
      plannedShifts: records.plannedShifts.slice(0, workListLimit),
      workLogs: records.workLogs.slice(0, workListLimit),
      breaks: records.breaks.slice(0, workListLimit),
      truncated:
        plannedShiftsTruncated ||
        records.workLogs.length > workListLimit ||
        records.breaks.length > workListLimit,
      plannedShiftsTruncated,
    };
  }

  async report(
    scope: UserScope,
    window: WorkReportWindow,
  ): Promise<WorkReport | null> {
    const records = await this.loadRecords(
      scope,
      window,
      workReportRecordLimit + 1,
    );
    if (
      records.plannedShifts.length > workReportRecordLimit ||
      records.workLogs.length > workReportRecordLimit ||
      records.breaks.length > workReportRecordLimit
    ) {
      return null;
    }
    return calculateWorkReport(window, records);
  }

  private async duplicate(
    scope: UserScope,
    key: string,
    kind: "rule",
  ): Promise<MutateWorkResult<WorkRuleRecord> | null>;
  private async duplicate(
    scope: UserScope,
    key: string,
    kind: "shift",
  ): Promise<MutateWorkResult<PlannedShiftRecord> | null>;
  private async duplicate(
    scope: UserScope,
    key: string,
    kind: "log",
  ): Promise<MutateWorkResult<WorkLogRecord> | null>;
  private async duplicate(
    scope: UserScope,
    key: string,
    kind: "break",
  ): Promise<MutateWorkResult<WorkBreakRecord> | null>;
  private async duplicate(
    scope: UserScope,
    key: string,
    kind: WorkEntityKind,
  ): Promise<MutateWorkResult<
    WorkRuleRecord | PlannedShiftRecord | WorkLogRecord | WorkBreakRecord
  > | null> {
    const row = await this.database
      .prepare(
        `SELECT a.entity_type, a.entity_id, a.after_json, u.token, u.expires_at, u.consumed_at
        FROM audit_log a LEFT JOIN work_undo_actions u
          ON u.scope_user_id = a.scope_user_id AND u.source_idempotency_key = a.idempotency_key
        WHERE a.scope_user_id = ? AND a.idempotency_key = ? AND a.entity_type = ? AND a.action = ?`,
      )
      .bind(scope.userId, key, entityType(kind), createdAction(kind))
      .first();
    if (row === null) return null;
    const parsed = duplicateSchema.safeParse(row);
    if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
    const entity = parseAuditJson(kind, parsed.data.after_json);
    return {
      outcome: "duplicate",
      entity,
      undoToken: parsed.data.consumed_at === null ? parsed.data.token : null,
      undoExpiresAt:
        parsed.data.expires_at === null || parsed.data.consumed_at !== null
          ? null
          : new Date(parsed.data.expires_at),
    };
  }

  private entityByKind(
    scope: UserScope,
    kind: WorkEntityKind,
    id: string,
  ): Promise<
    WorkRuleRecord | PlannedShiftRecord | WorkLogRecord | WorkBreakRecord | null
  > {
    switch (kind) {
      case "rule":
        return this.getRule(scope, id);
      case "shift":
        return this.getShift(scope, id);
      case "log":
        return this.getLog(scope, id);
      case "break":
        return this.getBreak(scope, id);
    }
  }

  private async finishCreate<T>(
    scope: UserScope,
    kind: WorkEntityKind,
    entity: T,
    entityId: string,
    insert: D1PreparedStatement,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<T>> {
    const timestamp = context.now.getTime();
    const results = await this.database.batch([
      insert,
      this.database
        .prepare(
          `INSERT INTO audit_log (
        id, scope_user_id, actor_user_id, action, entity_type, entity_id,
        before_json, after_json, correlation_id, idempotency_key, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, 'null', ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM ${this.tableName(kind)} WHERE user_id = ? AND id = ? AND version = 1 AND last_mutation_key = ?)`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          createdAction(kind),
          entityType(kind),
          entityId,
          JSON.stringify(entity),
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          entityId,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO work_undo_actions (
        token, scope_user_id, entity_kind, entity_id, source_idempotency_key,
        expected_version, expires_at, created_at
      ) SELECT ?, ?, ?, ?, ?, 1, ?, ? FROM audit_log
        WHERE scope_user_id = ? AND idempotency_key = ? AND entity_type = ?`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          kind,
          entityId,
          context.idempotencyKey,
          context.undoExpiresAt.getTime(),
          timestamp,
          scope.userId,
          context.idempotencyKey,
          entityType(kind),
        ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return {
      outcome: "created",
      entity,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  private tableName(kind: WorkEntityKind): string {
    switch (kind) {
      case "rule":
        return "work_rules";
      case "shift":
        return "planned_shifts";
      case "log":
        return "work_logs";
      case "break":
        return "work_breaks";
    }
  }

  async createRule(
    scope: UserScope,
    ruleId: string,
    values: WorkRuleValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkRuleRecord>> {
    const duplicate = await this.duplicate(
      scope,
      context.idempotencyKey,
      "rule",
    );
    if (duplicate !== null) return duplicate;
    const entity: WorkRuleRecord = {
      id: ruleId,
      ...values,
      version: 1,
      createdAt: context.now,
      updatedAt: context.now,
    };
    const timestamp = context.now.getTime();
    return this.finishCreate(
      scope,
      "rule",
      entity,
      ruleId,
      this.database
        .prepare(
          `INSERT INTO work_rules (id, user_id, name, break_treatment, version, last_mutation_key, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .bind(
          ruleId,
          scope.userId,
          values.name,
          values.breakTreatment,
          context.idempotencyKey,
          timestamp,
          timestamp,
        ),
      context,
    );
  }

  async createShift(
    scope: UserScope,
    shiftId: string,
    values: WorkIntervalValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<PlannedShiftRecord>> {
    const duplicate = await this.duplicate(
      scope,
      context.idempotencyKey,
      "shift",
    );
    if (duplicate !== null) return duplicate;
    const entity: PlannedShiftRecord = {
      id: shiftId,
      ...values,
      version: 1,
      createdAt: context.now,
      updatedAt: context.now,
    };
    const timestamp = context.now.getTime();
    return this.finishCreate(
      scope,
      "shift",
      entity,
      shiftId,
      this.database
        .prepare(
          `INSERT INTO planned_shifts (id, user_id, title, start_at_utc, end_at_utc, original_time_zone, version, last_mutation_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .bind(
          shiftId,
          scope.userId,
          values.title,
          values.startAtUtc.getTime(),
          values.endAtUtc.getTime(),
          values.originalTimeZone,
          context.idempotencyKey,
          timestamp,
          timestamp,
        ),
      context,
    );
  }

  async createLog(
    scope: UserScope,
    workLogId: string,
    ruleId: string,
    values: WorkIntervalValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkLogRecord>> {
    const duplicate = await this.duplicate(
      scope,
      context.idempotencyKey,
      "log",
    );
    if (duplicate !== null) return duplicate;
    const rule = await this.getRule(scope, ruleId);
    if (rule === null) return { outcome: "rule_not_found" };
    const entity: WorkLogRecord = {
      id: workLogId,
      ...values,
      ruleId: rule.id,
      ruleVersion: rule.version,
      ruleName: rule.name,
      breakTreatment: rule.breakTreatment,
      version: 1,
      createdAt: context.now,
      updatedAt: context.now,
    };
    const timestamp = context.now.getTime();
    return this.finishCreate(
      scope,
      "log",
      entity,
      workLogId,
      this.database
        .prepare(
          `INSERT INTO work_logs (id, user_id, title, start_at_utc, end_at_utc, original_time_zone, rule_id, rule_version, rule_name, break_treatment, version, last_mutation_key, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, id, version, name, break_treatment, 1, ?, ?, ? FROM work_rules WHERE user_id = ? AND id = ? AND version = ?`,
        )
        .bind(
          workLogId,
          scope.userId,
          values.title,
          values.startAtUtc.getTime(),
          values.endAtUtc.getTime(),
          values.originalTimeZone,
          context.idempotencyKey,
          timestamp,
          timestamp,
          scope.userId,
          ruleId,
          rule.version,
        ),
      context,
    );
  }

  async createBreak(
    scope: UserScope,
    workBreakId: string,
    workLogId: string,
    values: WorkBreakValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkBreakRecord>> {
    const duplicate = await this.duplicate(
      scope,
      context.idempotencyKey,
      "break",
    );
    if (duplicate !== null) return duplicate;
    const log = await this.getLog(scope, workLogId);
    if (log === null) return { outcome: "work_log_not_found" };
    if (
      values.startAtUtc.getTime() < log.startAtUtc.getTime() ||
      values.endAtUtc.getTime() > log.endAtUtc.getTime()
    )
      return { outcome: "outside_work_log" };
    const overlap = await this.database
      .prepare(
        `SELECT id FROM work_breaks WHERE user_id = ? AND work_log_id = ? AND start_at_utc < ? AND end_at_utc > ? LIMIT 1`,
      )
      .bind(
        scope.userId,
        workLogId,
        values.endAtUtc.getTime(),
        values.startAtUtc.getTime(),
      )
      .first();
    if (overlap !== null) return { outcome: "overlapping_break" };
    const entity: WorkBreakRecord = {
      id: workBreakId,
      workLogId,
      ...values,
      version: 1,
      createdAt: context.now,
      updatedAt: context.now,
    };
    const timestamp = context.now.getTime();
    return this.finishCreate(
      scope,
      "break",
      entity,
      workBreakId,
      this.database
        .prepare(
          `INSERT INTO work_breaks (id, user_id, work_log_id, start_at_utc, end_at_utc, original_time_zone, version, last_mutation_key, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ? FROM work_logs l
        WHERE l.user_id = ? AND l.id = ? AND ? >= l.start_at_utc AND ? <= l.end_at_utc
          AND NOT EXISTS (SELECT 1 FROM work_breaks b WHERE b.user_id = ? AND b.work_log_id = ? AND b.start_at_utc < ? AND b.end_at_utc > ?)`,
        )
        .bind(
          workBreakId,
          scope.userId,
          workLogId,
          values.startAtUtc.getTime(),
          values.endAtUtc.getTime(),
          values.originalTimeZone,
          context.idempotencyKey,
          timestamp,
          timestamp,
          scope.userId,
          workLogId,
          values.startAtUtc.getTime(),
          values.endAtUtc.getTime(),
          scope.userId,
          workLogId,
          values.endAtUtc.getTime(),
          values.startAtUtc.getTime(),
        ),
      context,
    );
  }

  async undo(
    scope: UserScope,
    token: string,
    context: Omit<WorkMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoWorkResult> {
    const duplicate = await this.database
      .prepare(
        `SELECT entity_type, entity_id FROM audit_log WHERE scope_user_id = ? AND idempotency_key = ? AND action = 'work.reverted'`,
      )
      .bind(scope.userId, context.idempotencyKey)
      .first<{ entity_type: string; entity_id: string }>();
    if (duplicate !== null) {
      const kind =
        duplicate.entity_type.replace("work_", "") === "planned_shift"
          ? "shift"
          : duplicate.entity_type.replace("work_", "");
      if (
        kind !== "rule" &&
        kind !== "shift" &&
        kind !== "log" &&
        kind !== "break"
      )
        throw new AppError("INTERNAL_REDACTED", false);
      return {
        outcome: "duplicate",
        entityKind: kind,
        entityId: duplicate.entity_id,
      };
    }
    const row = await this.database
      .prepare(
        `SELECT entity_kind, entity_id, expected_version, expires_at, consumed_at FROM work_undo_actions WHERE token = ? AND scope_user_id = ?`,
      )
      .bind(token, scope.userId)
      .first();
    if (row === null) return { outcome: "not_found" };
    const parsed = undoSchema.safeParse(row);
    if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
    const undo = parsed.data;
    if (undo.consumed_at !== null) return { outcome: "used" };
    if (undo.expires_at <= context.now.getTime()) return { outcome: "expired" };
    const current = await this.entityByKind(
      scope,
      undo.entity_kind,
      undo.entity_id,
    );
    if (current?.version !== undo.expected_version) return { outcome: "stale" };
    if (undo.entity_kind === "rule") {
      const reference = await this.database
        .prepare(
          `SELECT id FROM work_logs WHERE user_id = ? AND rule_id = ? LIMIT 1`,
        )
        .bind(scope.userId, undo.entity_id)
        .first();
      if (reference !== null) return { outcome: "stale" };
    }
    if (undo.entity_kind === "log") {
      const reference = await this.database
        .prepare(
          `SELECT id FROM work_breaks WHERE user_id = ? AND work_log_id = ? LIMIT 1`,
        )
        .bind(scope.userId, undo.entity_id)
        .first();
      if (reference !== null) return { outcome: "stale" };
    }
    const timestamp = context.now.getTime();
    const referenceGuard =
      undo.entity_kind === "rule"
        ? `AND NOT EXISTS (SELECT 1 FROM work_logs WHERE user_id = ? AND rule_id = ?)`
        : undo.entity_kind === "log"
          ? `AND NOT EXISTS (SELECT 1 FROM work_breaks WHERE user_id = ? AND work_log_id = ?)`
          : "";
    const claimBindings: (string | number)[] = [
      timestamp,
      context.idempotencyKey,
      token,
      scope.userId,
      timestamp,
      undo.expected_version,
      scope.userId,
      undo.entity_id,
      undo.expected_version,
    ];
    if (referenceGuard !== "") claimBindings.push(scope.userId, undo.entity_id);
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE work_undo_actions SET consumed_at = ?, consumed_by_idempotency_key = ?
        WHERE token = ? AND scope_user_id = ? AND consumed_at IS NULL AND expires_at > ? AND expected_version = ?
          AND EXISTS (SELECT 1 FROM ${this.tableName(undo.entity_kind)} WHERE user_id = ? AND id = ? AND version = ?) ${referenceGuard}`,
        )
        .bind(...claimBindings),
      this.database
        .prepare(
          `DELETE FROM ${this.tableName(undo.entity_kind)} WHERE user_id = ? AND id = ? AND version = ?
        AND EXISTS (SELECT 1 FROM work_undo_actions WHERE token = ? AND scope_user_id = ? AND consumed_by_idempotency_key = ?)`,
        )
        .bind(
          scope.userId,
          undo.entity_id,
          undo.expected_version,
          token,
          scope.userId,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_log (id, scope_user_id, actor_user_id, action, entity_type, entity_id, before_json, after_json, correlation_id, idempotency_key, created_at)
        SELECT ?, ?, ?, 'work.reverted', ?, ?, ?, 'null', ?, ?, ? FROM work_undo_actions
        WHERE token = ? AND scope_user_id = ? AND consumed_by_idempotency_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          entityType(undo.entity_kind),
          undo.entity_id,
          JSON.stringify(current),
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          token,
          scope.userId,
          context.idempotencyKey,
        ),
    ]);
    if (results.every((result) => result.meta.changes === 0))
      return { outcome: "stale" };
    if (results.some((result) => result.meta.changes !== 1))
      throw new AppError("INTERNAL_REDACTED", true);
    return {
      outcome: "reverted",
      entityKind: undo.entity_kind,
      entityId: undo.entity_id,
    };
  }

  async purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number> {
    validateLimit(limit);
    const result = await this.database
      .prepare(
        `DELETE FROM work_undo_actions WHERE token IN (
      SELECT token FROM work_undo_actions WHERE scope_user_id = ? AND expires_at <= ? ORDER BY expires_at LIMIT ?)`,
      )
      .bind(scope.userId, before.getTime(), limit)
      .run();
    return result.meta.changes;
  }
}
