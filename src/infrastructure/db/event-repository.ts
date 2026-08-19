import { z } from "zod";
import type {
  EventMutationContext,
  EventRepository,
  MutateEventResult,
  UndoEventResult,
} from "../../application/ports";
import type {
  EventDayWindow,
  EventRangeWindow,
  EventRecord,
  EventValues,
} from "../../domains/events/events";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

const storedEventSchema = z.object({
  id: z.string().min(1),
  event_kind: z.enum(["date_only", "instant"]),
  title: z.string().min(1).max(200),
  local_date: z.string().nullable(),
  start_at_utc: z.number().int().nullable(),
  end_at_utc: z.number().int().nullable(),
  time_zone: z.string().min(1).nullable(),
  status: z.enum(["active", "cancelled"]),
  version: z.number().int().positive(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  cancelled_at: z.number().int().nullable(),
});

const eventJsonSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("date_only"),
      title: z.string().min(1).max(200),
      localDate: z.string().min(1),
      status: z.enum(["active", "cancelled"]),
      version: z.number().int().positive(),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
      cancelledAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      kind: z.literal("instant"),
      title: z.string().min(1).max(200),
      startAtUtc: z.iso.datetime({ offset: true }),
      endAtUtc: z.iso.datetime({ offset: true }),
      originalTimeZone: z.string().min(1),
      status: z.enum(["active", "cancelled"]),
      version: z.number().int().positive(),
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
      cancelledAt: z.iso.datetime({ offset: true }).nullable(),
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
  event_id: z.string().min(1),
  before_json: z.string().nullable(),
  expected_version: z.number().int().positive(),
  expires_at: z.number().int(),
  consumed_at: z.number().int().nullable(),
});

function fromStoredRow(value: unknown): EventRecord {
  const parsed = storedEventSchema.safeParse(value);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  const row = parsed.data;
  const base = {
    id: row.id,
    title: row.title,
    status: row.status,
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    cancelledAt: row.cancelled_at === null ? null : new Date(row.cancelled_at),
  } as const;
  if (row.event_kind === "date_only") {
    if (
      row.local_date === null ||
      row.start_at_utc !== null ||
      row.end_at_utc !== null ||
      row.time_zone !== null
    ) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    return { ...base, kind: "date_only", localDate: row.local_date };
  }
  if (
    row.local_date !== null ||
    row.start_at_utc === null ||
    row.end_at_utc === null ||
    row.time_zone === null
  ) {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  return {
    ...base,
    kind: "instant",
    startAtUtc: new Date(row.start_at_utc),
    endAtUtc: new Date(row.end_at_utc),
    originalTimeZone: row.time_zone,
  };
}

function parseJsonEvent(value: string): EventRecord | null {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  if (json === null) return null;
  const parsed = eventJsonSchema.safeParse(json);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  const event = parsed.data;
  const base = {
    id: event.id,
    title: event.title,
    status: event.status,
    version: event.version,
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.updatedAt),
    cancelledAt:
      event.cancelledAt === null ? null : new Date(event.cancelledAt),
  } as const;
  return event.kind === "date_only"
    ? { ...base, kind: "date_only", localDate: event.localDate }
    : {
        ...base,
        kind: "instant",
        startAtUtc: new Date(event.startAtUtc),
        endAtUtc: new Date(event.endAtUtc),
        originalTimeZone: event.originalTimeZone,
      };
}

function serializeEvent(event: EventRecord | null): string {
  return JSON.stringify(event);
}

function nextEvent(
  eventId: string,
  values: EventValues,
  now: Date,
  current: EventRecord | null,
): EventRecord {
  const base = {
    id: eventId,
    title: values.title,
    status: "active" as const,
    version: (current?.version ?? 0) + 1,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    cancelledAt: null,
  };
  return values.kind === "date_only"
    ? { ...base, kind: "date_only", localDate: values.localDate }
    : {
        ...base,
        kind: "instant",
        startAtUtc: values.startAtUtc,
        endAtUtc: values.endAtUtc,
        originalTimeZone: values.originalTimeZone,
      };
}

function storageValues(
  event: EventRecord,
): readonly [
  string,
  string | null,
  number | null,
  number | null,
  string | null,
] {
  return event.kind === "date_only"
    ? [event.kind, event.localDate, null, null, null]
    : [
        event.kind,
        null,
        event.startAtUtc.getTime(),
        event.endAtUtc.getTime(),
        event.originalTimeZone,
      ];
}

export class D1EventRepository implements EventRepository {
  constructor(private readonly database: D1Database) {}

  async get(scope: UserScope, eventId: string): Promise<EventRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, event_kind, title, local_date, start_at_utc, end_at_utc,
                time_zone, status, version, created_at, updated_at, cancelled_at
         FROM events
         WHERE user_id = ? AND id = ?`,
      )
      .bind(scope.userId, eventId)
      .first();
    return row === null ? null : fromStoredRow(row);
  }

  async listForDay(
    scope: UserScope,
    window: EventDayWindow,
    limit?: number,
  ): Promise<EventRecord[]> {
    const suffix = limit === undefined ? "" : " LIMIT ?";
    const bindings: (string | number)[] = [
      scope.userId,
      window.localDate,
      window.endAtUtc.getTime(),
      window.startAtUtc.getTime(),
    ];
    if (limit !== undefined) bindings.push(limit);
    const rows = await this.database
      .prepare(
        `SELECT id, event_kind, title, local_date, start_at_utc, end_at_utc,
                time_zone, status, version, created_at, updated_at, cancelled_at
         FROM events
         WHERE user_id = ? AND status = 'active' AND (
           (event_kind = 'date_only' AND local_date = ?)
           OR
           (event_kind = 'instant' AND start_at_utc < ? AND end_at_utc > ?)
         )
         ORDER BY CASE event_kind WHEN 'date_only' THEN 0 ELSE 1 END,
                  start_at_utc, title, id${suffix}`,
      )
      .bind(...bindings)
      .all();
    return rows.results.map(fromStoredRow);
  }

  async listForRange(
    scope: UserScope,
    window: EventRangeWindow,
    limit: number,
  ): Promise<EventRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 501) {
      throw new AppError("INVALID_INPUT", false);
    }
    const rows = await this.database
      .prepare(
        `SELECT id, event_kind, title, local_date, start_at_utc, end_at_utc,
                time_zone, status, version, created_at, updated_at, cancelled_at
         FROM events
         WHERE user_id = ? AND status = 'active' AND (
           (event_kind = 'date_only' AND local_date >= ? AND local_date <= ?)
           OR
           (event_kind = 'instant' AND start_at_utc < ? AND end_at_utc > ?)
         )
         ORDER BY CASE event_kind WHEN 'date_only' THEN 0 ELSE 1 END,
                  local_date, start_at_utc, id
         LIMIT ?`,
      )
      .bind(
        scope.userId,
        window.startDate,
        window.endDate,
        window.endAtUtc.getTime(),
        window.startAtUtc.getTime(),
        limit,
      )
      .all();
    return rows.results.map(fromStoredRow);
  }

  private async duplicateMutation(
    scope: UserScope,
    idempotencyKey: string,
  ): Promise<MutateEventResult | null> {
    const row = await this.database
      .prepare(
        `SELECT a.after_json, u.token, u.expires_at
         FROM audit_log a
         LEFT JOIN event_undo_actions u
           ON u.scope_user_id = a.scope_user_id
          AND u.source_idempotency_key = a.idempotency_key
         WHERE a.scope_user_id = ? AND a.idempotency_key = ?
           AND a.entity_type = 'event'
           AND a.action IN ('event.created', 'event.updated', 'event.cancelled')`,
      )
      .bind(scope.userId, idempotencyKey)
      .first();
    if (row === null) return null;
    const duplicate = duplicateMutationSchema.safeParse(row);
    if (!duplicate.success) throw new AppError("INTERNAL_REDACTED", false);
    const event = parseJsonEvent(duplicate.data.after_json);
    if (event === null) throw new AppError("INTERNAL_REDACTED", false);
    return {
      outcome: "duplicate",
      event,
      undoToken: duplicate.data.token,
      undoExpiresAt:
        duplicate.data.expires_at === null
          ? null
          : new Date(duplicate.data.expires_at),
    };
  }

  async create(
    scope: UserScope,
    eventId: string,
    values: EventValues,
    context: EventMutationContext,
  ): Promise<MutateEventResult> {
    const duplicate = await this.duplicateMutation(
      scope,
      context.idempotencyKey,
    );
    if (duplicate !== null) return duplicate;

    const event = nextEvent(eventId, values, context.now, null);
    const [kind, localDate, startAtUtc, endAtUtc, timeZone] =
      storageValues(event);
    const timestamp = context.now.getTime();
    const afterJson = serializeEvent(event);
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO events (
             id, user_id, event_kind, title, local_date, start_at_utc,
             end_at_utc, time_zone, status, version, last_mutation_key,
             created_at, updated_at, cancelled_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, NULL)`,
        )
        .bind(
          event.id,
          scope.userId,
          kind,
          event.title,
          localDate,
          startAtUtc,
          endAtUtc,
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
           SELECT ?, ?, ?, 'event.created', 'event', ?, 'null', ?, ?, ?, ?
           FROM events
           WHERE user_id = ? AND id = ? AND version = 1
             AND last_mutation_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          event.id,
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          event.id,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO event_undo_actions (
             token, scope_user_id, event_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           )
           SELECT ?, ?, ?, ?, NULL, 1, ?, ?
           FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ?
             AND entity_type = 'event'`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          event.id,
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
      event,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async update(
    scope: UserScope,
    eventId: string,
    values: EventValues,
    context: EventMutationContext,
  ): Promise<MutateEventResult> {
    const duplicate = await this.duplicateMutation(
      scope,
      context.idempotencyKey,
    );
    if (duplicate !== null) return duplicate;
    const current = await this.get(scope, eventId);
    if (current === null) return { outcome: "not_found" };
    if (current.status === "cancelled") {
      return { outcome: "already_cancelled" };
    }

    const event = nextEvent(eventId, values, context.now, current);
    const [kind, localDate, startAtUtc, endAtUtc, timeZone] =
      storageValues(event);
    const timestamp = context.now.getTime();
    const beforeJson = serializeEvent(current);
    const afterJson = serializeEvent(event);
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE events
           SET event_kind = ?, title = ?, local_date = ?, start_at_utc = ?,
               end_at_utc = ?, time_zone = ?, version = ?,
               last_mutation_key = ?, updated_at = ?, cancelled_at = NULL
           WHERE user_id = ? AND id = ? AND version = ? AND status = 'active'`,
        )
        .bind(
          kind,
          event.title,
          localDate,
          startAtUtc,
          endAtUtc,
          timeZone,
          event.version,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          event.id,
          current.version,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, 'event.updated', 'event', ?, ?, ?, ?, ?, ?
           FROM events
           WHERE user_id = ? AND id = ? AND version = ?
             AND last_mutation_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          event.id,
          beforeJson,
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          event.id,
          event.version,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO event_undo_actions (
             token, scope_user_id, event_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
           FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ?
             AND entity_type = 'event'`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          event.id,
          context.idempotencyKey,
          beforeJson,
          event.version,
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
      outcome: "updated",
      event,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async cancel(
    scope: UserScope,
    eventId: string,
    context: EventMutationContext,
  ): Promise<MutateEventResult> {
    const duplicate = await this.duplicateMutation(
      scope,
      context.idempotencyKey,
    );
    if (duplicate !== null) return duplicate;
    const current = await this.get(scope, eventId);
    if (current === null) return { outcome: "not_found" };
    if (current.status === "cancelled") {
      return { outcome: "already_cancelled" };
    }

    const event: EventRecord = {
      ...current,
      status: "cancelled",
      version: current.version + 1,
      updatedAt: context.now,
      cancelledAt: context.now,
    };
    const timestamp = context.now.getTime();
    const beforeJson = serializeEvent(current);
    const afterJson = serializeEvent(event);
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE events
           SET status = 'cancelled', version = ?, last_mutation_key = ?,
               updated_at = ?, cancelled_at = ?
           WHERE user_id = ? AND id = ? AND version = ? AND status = 'active'`,
        )
        .bind(
          event.version,
          context.idempotencyKey,
          timestamp,
          timestamp,
          scope.userId,
          event.id,
          current.version,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, 'event.cancelled', 'event', ?, ?, ?, ?, ?, ?
           FROM events
           WHERE user_id = ? AND id = ? AND version = ?
             AND last_mutation_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          event.id,
          beforeJson,
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          event.id,
          event.version,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO event_undo_actions (
             token, scope_user_id, event_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
           FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ?
             AND entity_type = 'event'`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          event.id,
          context.idempotencyKey,
          beforeJson,
          event.version,
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
      outcome: "cancelled",
      event,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async undo(
    scope: UserScope,
    token: string,
    context: Omit<EventMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoEventResult> {
    const duplicateRow = await this.database
      .prepare(
        `SELECT after_json FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ?
           AND action = 'event.reverted' AND entity_type = 'event'`,
      )
      .bind(scope.userId, context.idempotencyKey)
      .first();
    if (duplicateRow !== null) {
      const duplicate = duplicateUndoSchema.safeParse(duplicateRow);
      if (!duplicate.success) {
        throw new AppError("INTERNAL_REDACTED", false);
      }
      return {
        outcome: "duplicate",
        event: parseJsonEvent(duplicate.data.after_json),
      };
    }

    const storedRow = await this.database
      .prepare(
        `SELECT event_id, before_json, expected_version, expires_at, consumed_at
         FROM event_undo_actions
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

    const current = await this.get(scope, stored.data.event_id);
    if (current?.version !== stored.data.expected_version) {
      return { outcome: "stale" };
    }
    const previous =
      stored.data.before_json === null
        ? null
        : parseJsonEvent(stored.data.before_json);
    if (stored.data.before_json !== null && previous === null) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    const restored: EventRecord | null =
      previous === null
        ? null
        : {
            ...previous,
            version: current.version + 1,
            updatedAt: context.now,
          };
    const timestamp = context.now.getTime();
    const beforeJson = serializeEvent(current);
    const afterJson = serializeEvent(restored);

    const claim = this.database
      .prepare(
        `UPDATE event_undo_actions
         SET consumed_at = ?, consumed_by_idempotency_key = ?
         WHERE token = ? AND scope_user_id = ? AND consumed_at IS NULL
           AND expires_at > ? AND expected_version = ?
           AND EXISTS (
             SELECT 1 FROM events
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
              `DELETE FROM events
               WHERE user_id = ? AND id = ? AND version = ?
                 AND EXISTS (
                   SELECT 1 FROM event_undo_actions
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
            const [kind, localDate, startAtUtc, endAtUtc, timeZone] =
              storageValues(restored);
            return this.database
              .prepare(
                `UPDATE events
                 SET event_kind = ?, title = ?, local_date = ?,
                     start_at_utc = ?, end_at_utc = ?, time_zone = ?,
                     status = ?, version = ?, last_mutation_key = ?,
                     updated_at = ?, cancelled_at = ?
                 WHERE user_id = ? AND id = ? AND version = ?
                   AND EXISTS (
                     SELECT 1 FROM event_undo_actions
                     WHERE token = ? AND scope_user_id = ?
                       AND consumed_by_idempotency_key = ?
                   )`,
              )
              .bind(
                kind,
                restored.title,
                localDate,
                startAtUtc,
                endAtUtc,
                timeZone,
                restored.status,
                restored.version,
                context.idempotencyKey,
                timestamp,
                restored.cancelledAt?.getTime() ?? null,
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
           SELECT ?, ?, ?, 'event.reverted', 'event', ?, ?, ?, ?, ?, ?
           FROM event_undo_actions
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
    return { outcome: "reverted", event: restored };
  }

  async purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("INVALID_INPUT", false);
    }
    const result = await this.database
      .prepare(
        `DELETE FROM event_undo_actions
         WHERE token IN (
           SELECT token FROM event_undo_actions
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
