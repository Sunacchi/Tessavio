import { z } from "zod";
import type {
  MutateTaskResult,
  TaskMutationContext,
  TaskRepository,
  UndoTaskResult,
} from "../../application/ports";
import type {
  TaskDayWindow,
  TaskRecord,
  TaskStatus,
  TaskValues,
} from "../../domains/tasks/tasks";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

const storedTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  priority: z.enum(["low", "medium", "high"]),
  due_kind: z.enum(["none", "date_only", "instant"]),
  due_date_local: z.string().nullable(),
  due_at_utc: z.number().int().nullable(),
  time_zone: z.string().min(1).nullable(),
  status: z.enum(["open", "completed"]),
  version: z.number().int().positive(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  completed_at: z.number().int().nullable(),
});

const taskJsonSchema = z.discriminatedUnion("dueKind", [
  z
    .object({
      id: z.string().min(1),
      dueKind: z.literal("none"),
      title: z.string().min(1).max(200),
      priority: z.enum(["low", "medium", "high"]),
      status: z.enum(["open", "completed"]),
      version: z.number().int().positive(),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
      completedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      dueKind: z.literal("date_only"),
      dueDateLocal: z.string().min(1),
      title: z.string().min(1).max(200),
      priority: z.enum(["low", "medium", "high"]),
      status: z.enum(["open", "completed"]),
      version: z.number().int().positive(),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
      completedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      dueKind: z.literal("instant"),
      dueAtUtc: z.iso.datetime({ offset: true }),
      originalTimeZone: z.string().min(1),
      title: z.string().min(1).max(200),
      priority: z.enum(["low", "medium", "high"]),
      status: z.enum(["open", "completed"]),
      version: z.number().int().positive(),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
      completedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict(),
]);

const duplicateMutationSchema = z.object({
  after_json: z.string(),
  token: z.string().min(1).nullable(),
  expires_at: z.number().int().nullable(),
});
const duplicateUndoSchema = z.object({ after_json: z.string() });
const undoRowSchema = z.object({
  task_id: z.string().min(1),
  before_json: z.string().nullable(),
  expected_version: z.number().int().positive(),
  expires_at: z.number().int(),
  consumed_at: z.number().int().nullable(),
});

const selectColumns = `id, title, priority, due_kind, due_date_local,
  due_at_utc, time_zone, status, version, created_at, updated_at, completed_at`;

function fromStoredRow(value: unknown): TaskRecord {
  const parsed = storedTaskSchema.safeParse(value);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  const row = parsed.data;
  const base = {
    id: row.id,
    title: row.title,
    priority: row.priority,
    status: row.status,
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at === null ? null : new Date(row.completed_at),
  } as const;
  if (row.due_kind === "none") {
    if (
      row.due_date_local !== null ||
      row.due_at_utc !== null ||
      row.time_zone !== null
    ) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    return { ...base, dueKind: "none" };
  }
  if (row.due_kind === "date_only") {
    if (
      row.due_date_local === null ||
      row.due_at_utc !== null ||
      row.time_zone !== null
    ) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    return {
      ...base,
      dueKind: "date_only",
      dueDateLocal: row.due_date_local,
    };
  }
  if (
    row.due_date_local !== null ||
    row.due_at_utc === null ||
    row.time_zone === null
  ) {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  return {
    ...base,
    dueKind: "instant",
    dueAtUtc: new Date(row.due_at_utc),
    originalTimeZone: row.time_zone,
  };
}

function parseJsonTask(value: string): TaskRecord | null {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  if (json === null) return null;
  const parsed = taskJsonSchema.safeParse(json);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  const task = parsed.data;
  const base = {
    id: task.id,
    title: task.title,
    priority: task.priority,
    status: task.status,
    version: task.version,
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt),
    completedAt: task.completedAt === null ? null : new Date(task.completedAt),
  } as const;
  switch (task.dueKind) {
    case "none":
      return { ...base, dueKind: "none" };
    case "date_only":
      return {
        ...base,
        dueKind: "date_only",
        dueDateLocal: task.dueDateLocal,
      };
    case "instant":
      return {
        ...base,
        dueKind: "instant",
        dueAtUtc: new Date(task.dueAtUtc),
        originalTimeZone: task.originalTimeZone,
      };
  }
}

function serializeTask(task: TaskRecord | null): string {
  return JSON.stringify(task);
}

function newTask(taskId: string, values: TaskValues, now: Date): TaskRecord {
  const base = {
    id: taskId,
    title: values.title,
    priority: values.priority,
    status: "open" as const,
    version: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  switch (values.dueKind) {
    case "none":
      return { ...base, dueKind: "none" };
    case "date_only":
      return {
        ...base,
        dueKind: "date_only",
        dueDateLocal: values.dueDateLocal,
      };
    case "instant":
      return {
        ...base,
        dueKind: "instant",
        dueAtUtc: values.dueAtUtc,
        originalTimeZone: values.originalTimeZone,
      };
  }
}

function storageValues(
  task: TaskRecord,
): readonly [string, string | null, number | null, string | null] {
  switch (task.dueKind) {
    case "none":
      return [task.dueKind, null, null, null];
    case "date_only":
      return [task.dueKind, task.dueDateLocal, null, null];
    case "instant":
      return [
        task.dueKind,
        null,
        task.dueAtUtc.getTime(),
        task.originalTimeZone,
      ];
  }
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("INVALID_INPUT", false);
  }
}

export class D1TaskRepository implements TaskRepository {
  constructor(private readonly database: D1Database) {}

  async get(scope: UserScope, taskId: string): Promise<TaskRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT ${selectColumns} FROM tasks WHERE user_id = ? AND id = ?`,
      )
      .bind(scope.userId, taskId)
      .first();
    return row === null ? null : fromStoredRow(row);
  }

  async listOpen(scope: UserScope, limit: number): Promise<TaskRecord[]> {
    validateLimit(limit);
    const rows = await this.database
      .prepare(
        `SELECT ${selectColumns}
         FROM tasks
         WHERE user_id = ? AND status = 'open'
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                  CASE due_kind WHEN 'date_only' THEN 0 WHEN 'instant' THEN 1 ELSE 2 END,
                  due_date_local, due_at_utc, created_at, id
         LIMIT ?`,
      )
      .bind(scope.userId, limit)
      .all();
    return rows.results.map(fromStoredRow);
  }

  async listForDay(
    scope: UserScope,
    window: TaskDayWindow,
    limit?: number,
  ): Promise<TaskRecord[]> {
    const suffix = limit === undefined ? "" : " LIMIT ?";
    const bindings: (string | number)[] = [
      scope.userId,
      window.localDate,
      window.startAtUtc.getTime(),
      window.endAtUtc.getTime(),
    ];
    if (limit !== undefined) bindings.push(limit);
    const rows = await this.database
      .prepare(
        `SELECT ${selectColumns}
         FROM tasks
         WHERE user_id = ? AND status = 'open' AND (
           (due_kind = 'date_only' AND due_date_local = ?)
           OR (due_kind = 'instant' AND due_at_utc >= ? AND due_at_utc < ?)
         )
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                  CASE due_kind WHEN 'date_only' THEN 0 ELSE 1 END,
                  due_at_utc, title, id${suffix}`,
      )
      .bind(...bindings)
      .all();
    return rows.results.map(fromStoredRow);
  }

  private async duplicateMutation(
    scope: UserScope,
    idempotencyKey: string,
  ): Promise<MutateTaskResult | null> {
    const row = await this.database
      .prepare(
        `SELECT a.after_json, u.token, u.expires_at
         FROM audit_log a
         LEFT JOIN task_undo_actions u
           ON u.scope_user_id = a.scope_user_id
          AND u.source_idempotency_key = a.idempotency_key
         WHERE a.scope_user_id = ? AND a.idempotency_key = ?
           AND a.entity_type = 'task'
           AND a.action IN ('task.created', 'task.completed', 'task.reopened')`,
      )
      .bind(scope.userId, idempotencyKey)
      .first();
    if (row === null) return null;
    const duplicate = duplicateMutationSchema.safeParse(row);
    if (!duplicate.success) throw new AppError("INTERNAL_REDACTED", false);
    const task = parseJsonTask(duplicate.data.after_json);
    if (task === null) throw new AppError("INTERNAL_REDACTED", false);
    return {
      outcome: "duplicate",
      task,
      undoToken: duplicate.data.token,
      undoExpiresAt:
        duplicate.data.expires_at === null
          ? null
          : new Date(duplicate.data.expires_at),
    };
  }

  async create(
    scope: UserScope,
    taskId: string,
    values: TaskValues,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult> {
    const duplicate = await this.duplicateMutation(
      scope,
      context.idempotencyKey,
    );
    if (duplicate !== null) return duplicate;
    const task = newTask(taskId, values, context.now);
    const [dueKind, dueDateLocal, dueAtUtc, timeZone] = storageValues(task);
    const timestamp = context.now.getTime();
    const afterJson = serializeTask(task);
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO tasks (
             id, user_id, title, priority, due_kind, due_date_local,
             due_at_utc, time_zone, status, version, last_mutation_key,
             created_at, updated_at, completed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, ?, NULL)`,
        )
        .bind(
          task.id,
          scope.userId,
          task.title,
          task.priority,
          dueKind,
          dueDateLocal,
          dueAtUtc,
          timeZone,
          context.idempotencyKey,
          timestamp,
          timestamp,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, 'task.created', 'task', ?, 'null', ?, ?, ?, ?
           FROM tasks
           WHERE user_id = ? AND id = ? AND version = 1
             AND last_mutation_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          task.id,
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          task.id,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO task_undo_actions (
             token, scope_user_id, task_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           )
           SELECT ?, ?, ?, ?, NULL, 1, ?, ?
           FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ?
             AND entity_type = 'task'`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          task.id,
          context.idempotencyKey,
          context.undoExpiresAt.getTime(),
          timestamp,
          scope.userId,
          context.idempotencyKey,
        ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return {
      outcome: "created",
      task,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  private async setStatus(
    scope: UserScope,
    taskId: string,
    target: TaskStatus,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult> {
    const duplicate = await this.duplicateMutation(
      scope,
      context.idempotencyKey,
    );
    if (duplicate !== null) return duplicate;
    const current = await this.get(scope, taskId);
    if (current === null) return { outcome: "not_found" };
    if (current.status === target) {
      return {
        outcome: target === "completed" ? "already_completed" : "already_open",
      };
    }
    const task: TaskRecord = {
      ...current,
      status: target,
      version: current.version + 1,
      updatedAt: context.now,
      completedAt: target === "completed" ? context.now : null,
    };
    const timestamp = context.now.getTime();
    const beforeJson = serializeTask(current);
    const afterJson = serializeTask(task);
    const action = target === "completed" ? "task.completed" : "task.reopened";
    const outcome = target === "completed" ? "completed" : "reopened";
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE tasks
           SET status = ?, version = ?, last_mutation_key = ?,
               updated_at = ?, completed_at = ?
           WHERE user_id = ? AND id = ? AND version = ? AND status = ?`,
        )
        .bind(
          target,
          task.version,
          context.idempotencyKey,
          timestamp,
          task.completedAt?.getTime() ?? null,
          scope.userId,
          task.id,
          current.version,
          current.status,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, ?, 'task', ?, ?, ?, ?, ?, ?
           FROM tasks
           WHERE user_id = ? AND id = ? AND version = ?
             AND last_mutation_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          action,
          task.id,
          beforeJson,
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          task.id,
          task.version,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO task_undo_actions (
             token, scope_user_id, task_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
           FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ?
             AND entity_type = 'task'`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          task.id,
          context.idempotencyKey,
          beforeJson,
          task.version,
          context.undoExpiresAt.getTime(),
          timestamp,
          scope.userId,
          context.idempotencyKey,
        ),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return {
      outcome,
      task,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  complete(
    scope: UserScope,
    taskId: string,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult> {
    return this.setStatus(scope, taskId, "completed", context);
  }

  reopen(
    scope: UserScope,
    taskId: string,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult> {
    return this.setStatus(scope, taskId, "open", context);
  }

  async undo(
    scope: UserScope,
    token: string,
    context: Omit<TaskMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoTaskResult> {
    const duplicateRow = await this.database
      .prepare(
        `SELECT after_json FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ?
           AND action = 'task.reverted' AND entity_type = 'task'`,
      )
      .bind(scope.userId, context.idempotencyKey)
      .first();
    if (duplicateRow !== null) {
      const duplicate = duplicateUndoSchema.safeParse(duplicateRow);
      if (!duplicate.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        outcome: "duplicate",
        task: parseJsonTask(duplicate.data.after_json),
      };
    }

    const storedRow = await this.database
      .prepare(
        `SELECT task_id, before_json, expected_version, expires_at, consumed_at
         FROM task_undo_actions
         WHERE token = ? AND scope_user_id = ?`,
      )
      .bind(token, scope.userId)
      .first();
    if (storedRow === null) return { outcome: "not_found" };
    const stored = undoRowSchema.safeParse(storedRow);
    if (!stored.success) throw new AppError("INTERNAL_REDACTED", false);
    if (stored.data.consumed_at !== null) return { outcome: "used" };
    if (stored.data.expires_at <= context.now.getTime()) {
      return { outcome: "expired" };
    }
    const current = await this.get(scope, stored.data.task_id);
    if (current?.version !== stored.data.expected_version) {
      return { outcome: "stale" };
    }
    const previous =
      stored.data.before_json === null
        ? null
        : parseJsonTask(stored.data.before_json);
    if (stored.data.before_json !== null && previous === null) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    const restored: TaskRecord | null =
      previous === null
        ? null
        : {
            ...previous,
            version: current.version + 1,
            updatedAt: context.now,
          };
    const timestamp = context.now.getTime();
    const beforeJson = serializeTask(current);
    const afterJson = serializeTask(restored);
    const claim = this.database
      .prepare(
        `UPDATE task_undo_actions
         SET consumed_at = ?, consumed_by_idempotency_key = ?
         WHERE token = ? AND scope_user_id = ? AND consumed_at IS NULL
           AND expires_at > ? AND expected_version = ?
           AND EXISTS (
             SELECT 1 FROM tasks
             WHERE user_id = ? AND id = ? AND version = ?
           )`,
      )
      .bind(
        timestamp,
        context.idempotencyKey,
        token,
        scope.userId,
        timestamp,
        current.version,
        scope.userId,
        current.id,
        current.version,
      );
    const mutation =
      restored === null
        ? this.database
            .prepare(
              `DELETE FROM tasks
               WHERE user_id = ? AND id = ? AND version = ?
                 AND EXISTS (
                   SELECT 1 FROM task_undo_actions
                   WHERE token = ? AND scope_user_id = ?
                     AND consumed_by_idempotency_key = ?
                 )`,
            )
            .bind(
              scope.userId,
              current.id,
              current.version,
              token,
              scope.userId,
              context.idempotencyKey,
            )
        : (() => {
            const [dueKind, dueDateLocal, dueAtUtc, timeZone] =
              storageValues(restored);
            return this.database
              .prepare(
                `UPDATE tasks
                 SET title = ?, priority = ?, due_kind = ?, due_date_local = ?,
                     due_at_utc = ?, time_zone = ?, status = ?, version = ?,
                     last_mutation_key = ?, updated_at = ?, completed_at = ?
                 WHERE user_id = ? AND id = ? AND version = ?
                   AND EXISTS (
                     SELECT 1 FROM task_undo_actions
                     WHERE token = ? AND scope_user_id = ?
                       AND consumed_by_idempotency_key = ?
                   )`,
              )
              .bind(
                restored.title,
                restored.priority,
                dueKind,
                dueDateLocal,
                dueAtUtc,
                timeZone,
                restored.status,
                restored.version,
                context.idempotencyKey,
                timestamp,
                restored.completedAt?.getTime() ?? null,
                scope.userId,
                restored.id,
                current.version,
                token,
                scope.userId,
                context.idempotencyKey,
              );
          })();
    const results = await this.database.batch([
      claim,
      mutation,
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, 'task.reverted', 'task', ?, ?, ?, ?, ?, ?
           FROM task_undo_actions
           WHERE token = ? AND scope_user_id = ?
             AND consumed_by_idempotency_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          current.id,
          beforeJson,
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
    return { outcome: "reverted", task: restored };
  }

  async purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number> {
    validateLimit(limit);
    const result = await this.database
      .prepare(
        `DELETE FROM task_undo_actions
         WHERE token IN (
           SELECT token FROM task_undo_actions
           WHERE scope_user_id = ? AND expires_at <= ?
           ORDER BY expires_at
           LIMIT ?
         )`,
      )
      .bind(scope.userId, before.getTime(), limit)
      .run();
    return result.meta.changes;
  }
}
