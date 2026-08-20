import { z } from "zod";
import type {
  ListMutationContext,
  ListRepository,
  MutateListEntityResult,
  UndoListResult,
} from "../../application/ports/lists";
import {
  listItemLimit,
  type ListEntityKind,
  type ListItemRecord,
  type ListItemValues,
  type ListRecord,
  type ListValues,
  type ListWithItems,
  type NoteRecord,
  type NoteValues,
} from "../../domains/lists/lists";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

type ListEntity = ListRecord | ListItemRecord | NoteRecord;

const listRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  source: z.literal("manual_command"),
  status: z.enum(["active", "deleted"]),
  version: z.number().int().positive(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  deleted_at: z.number().int().nullable(),
});

const itemRowSchema = z.object({
  id: z.string().min(1),
  list_id: z.string().min(1),
  text: z.string().min(1).max(300),
  source: z.literal("manual_command"),
  status: z.enum(["open", "completed", "deleted"]),
  version: z.number().int().positive(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  completed_at: z.number().int().nullable(),
  deleted_at: z.number().int().nullable(),
});

const noteRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(4_000),
  source: z.literal("manual_command"),
  status: z.enum(["active", "deleted"]),
  version: z.number().int().positive(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  deleted_at: z.number().int().nullable(),
});

const commonJsonFields = {
  id: z.string().min(1),
  source: z.literal("manual_command"),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  deletedAt: z.iso.datetime({ offset: true }).nullable(),
};

const listJsonSchema = z
  .object({
    ...commonJsonFields,
    title: z.string().min(1).max(100),
    status: z.enum(["active", "deleted"]),
  })
  .strict();
const itemJsonSchema = z
  .object({
    ...commonJsonFields,
    listId: z.string().min(1),
    text: z.string().min(1).max(300),
    status: z.enum(["open", "completed", "deleted"]),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
const noteJsonSchema = z
  .object({
    ...commonJsonFields,
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(4_000),
    status: z.enum(["active", "deleted"]),
  })
  .strict();

const duplicateSchema = z.object({
  entity_type: z.enum(["private_list", "private_list_item", "private_note"]),
  after_json: z.string(),
  token: z.string().min(1).nullable(),
  expires_at: z.number().int().nullable(),
  consumed_at: z.number().int().nullable(),
});
const duplicateUndoSchema = z.object({
  entity_type: z.enum(["private_list", "private_list_item", "private_note"]),
  entity_id: z.string().min(1),
});
const undoSchema = z.object({
  entity_kind: z.enum(["list", "item", "note"]),
  entity_id: z.string().min(1),
  before_json: z.string().nullable(),
  expected_version: z.number().int().positive(),
  expires_at: z.number().int(),
  consumed_at: z.number().int().nullable(),
});

function parseListRow(row: unknown): ListRecord {
  const parsed = listRowSchema.safeParse(row);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    id: parsed.data.id,
    title: parsed.data.title,
    source: parsed.data.source,
    status: parsed.data.status,
    version: parsed.data.version,
    createdAt: new Date(parsed.data.created_at),
    updatedAt: new Date(parsed.data.updated_at),
    deletedAt:
      parsed.data.deleted_at === null ? null : new Date(parsed.data.deleted_at),
  };
}

function parseItemRow(row: unknown): ListItemRecord {
  const parsed = itemRowSchema.safeParse(row);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    id: parsed.data.id,
    listId: parsed.data.list_id,
    text: parsed.data.text,
    source: parsed.data.source,
    status: parsed.data.status,
    version: parsed.data.version,
    createdAt: new Date(parsed.data.created_at),
    updatedAt: new Date(parsed.data.updated_at),
    completedAt:
      parsed.data.completed_at === null
        ? null
        : new Date(parsed.data.completed_at),
    deletedAt:
      parsed.data.deleted_at === null ? null : new Date(parsed.data.deleted_at),
  };
}

function parseNoteRow(row: unknown): NoteRecord {
  const parsed = noteRowSchema.safeParse(row);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    id: parsed.data.id,
    title: parsed.data.title,
    body: parsed.data.body,
    source: parsed.data.source,
    status: parsed.data.status,
    version: parsed.data.version,
    createdAt: new Date(parsed.data.created_at),
    updatedAt: new Date(parsed.data.updated_at),
    deletedAt:
      parsed.data.deleted_at === null ? null : new Date(parsed.data.deleted_at),
  };
}

function parseJsonDate(value: string): Date {
  return new Date(value);
}

function parseAuditEntity(kind: ListEntityKind, json: string): ListEntity {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  if (kind === "list") {
    const parsed = listJsonSchema.safeParse(raw);
    if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
    return {
      ...parsed.data,
      createdAt: parseJsonDate(parsed.data.createdAt),
      updatedAt: parseJsonDate(parsed.data.updatedAt),
      deletedAt:
        parsed.data.deletedAt === null
          ? null
          : parseJsonDate(parsed.data.deletedAt),
    };
  }
  if (kind === "item") {
    const parsed = itemJsonSchema.safeParse(raw);
    if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
    return {
      ...parsed.data,
      createdAt: parseJsonDate(parsed.data.createdAt),
      updatedAt: parseJsonDate(parsed.data.updatedAt),
      completedAt:
        parsed.data.completedAt === null
          ? null
          : parseJsonDate(parsed.data.completedAt),
      deletedAt:
        parsed.data.deletedAt === null
          ? null
          : parseJsonDate(parsed.data.deletedAt),
    };
  }
  const parsed = noteJsonSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    ...parsed.data,
    createdAt: parseJsonDate(parsed.data.createdAt),
    updatedAt: parseJsonDate(parsed.data.updatedAt),
    deletedAt:
      parsed.data.deletedAt === null
        ? null
        : parseJsonDate(parsed.data.deletedAt),
  };
}

function entityType(kind: ListEntityKind): string {
  return kind === "list"
    ? "private_list"
    : kind === "item"
      ? "private_list_item"
      : "private_note";
}

function kindFromEntityType(value: string): ListEntityKind {
  if (value === "private_list") return "list";
  if (value === "private_list_item") return "item";
  if (value === "private_note") return "note";
  throw new AppError("INTERNAL_REDACTED", false);
}

function tableName(kind: ListEntityKind): string {
  return kind === "list" ? "lists" : kind === "item" ? "list_items" : "notes";
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new AppError("INVALID_INPUT", false);
  }
}

export class D1ListRepository implements ListRepository {
  constructor(private readonly database: D1Database) {}

  private async getListRecord(
    scope: UserScope,
    listId: string,
    includeDeleted: boolean,
  ): Promise<ListRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, title, source, status, version, created_at, updated_at, deleted_at
         FROM lists WHERE user_id = ? AND id = ?${includeDeleted ? "" : " AND status = 'active'"}`,
      )
      .bind(scope.userId, listId)
      .first();
    return row === null ? null : parseListRow(row);
  }

  private async getItemRecord(
    scope: UserScope,
    itemId: string,
    includeDeleted: boolean,
  ): Promise<ListItemRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, list_id, text, source, status, version, created_at, updated_at, completed_at, deleted_at
         FROM list_items WHERE user_id = ? AND id = ?${includeDeleted ? "" : " AND status != 'deleted'"}`,
      )
      .bind(scope.userId, itemId)
      .first();
    return row === null ? null : parseItemRow(row);
  }

  private async getNoteRecord(
    scope: UserScope,
    noteId: string,
    includeDeleted: boolean,
  ): Promise<NoteRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, title, body, source, status, version, created_at, updated_at, deleted_at
         FROM notes WHERE user_id = ? AND id = ?${includeDeleted ? "" : " AND status = 'active'"}`,
      )
      .bind(scope.userId, noteId)
      .first();
    return row === null ? null : parseNoteRow(row);
  }

  async getList(
    scope: UserScope,
    listId: string,
  ): Promise<ListWithItems | null> {
    const list = await this.getListRecord(scope, listId, false);
    if (list === null) return null;
    const rows = await this.database
      .prepare(
        `SELECT id, list_id, text, source, status, version, created_at, updated_at, completed_at, deleted_at
         FROM list_items WHERE user_id = ? AND list_id = ? AND status != 'deleted'
         ORDER BY created_at, id LIMIT ?`,
      )
      .bind(scope.userId, listId, listItemLimit + 1)
      .all();
    return {
      list,
      items: rows.results.slice(0, listItemLimit).map(parseItemRow),
      truncated: rows.results.length > listItemLimit,
    };
  }

  async listLists(scope: UserScope, limit: number): Promise<ListRecord[]> {
    validateLimit(limit);
    const rows = await this.database
      .prepare(
        `SELECT id, title, source, status, version, created_at, updated_at, deleted_at
         FROM lists WHERE user_id = ? AND status = 'active'
         ORDER BY created_at, id LIMIT ?`,
      )
      .bind(scope.userId, limit)
      .all();
    return rows.results.map(parseListRow);
  }

  async listNotes(scope: UserScope, limit: number): Promise<NoteRecord[]> {
    validateLimit(limit);
    const rows = await this.database
      .prepare(
        `SELECT id, title, body, source, status, version, created_at, updated_at, deleted_at
         FROM notes WHERE user_id = ? AND status = 'active'
         ORDER BY created_at, id LIMIT ?`,
      )
      .bind(scope.userId, limit)
      .all();
    return rows.results.map(parseNoteRow);
  }

  getNote(scope: UserScope, noteId: string): Promise<NoteRecord | null> {
    return this.getNoteRecord(scope, noteId, false);
  }

  private async duplicate<T extends ListEntity>(
    scope: UserScope,
    key: string,
    kind: ListEntityKind,
    action: string,
  ): Promise<MutateListEntityResult<T> | null> {
    const row = await this.database
      .prepare(
        `SELECT a.entity_type, a.after_json, u.token, u.expires_at, u.consumed_at
         FROM audit_log a LEFT JOIN list_undo_actions u
           ON u.scope_user_id = a.scope_user_id AND u.source_idempotency_key = a.idempotency_key
         WHERE a.scope_user_id = ? AND a.idempotency_key = ? AND a.entity_type = ? AND a.action = ?`,
      )
      .bind(scope.userId, key, entityType(kind), action)
      .first();
    if (row === null) return null;
    const parsed = duplicateSchema.safeParse(row);
    if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
    return {
      outcome: "duplicate",
      entity: parseAuditEntity(kind, parsed.data.after_json) as T,
      undoToken: parsed.data.consumed_at === null ? parsed.data.token : null,
      undoExpiresAt:
        parsed.data.expires_at === null || parsed.data.consumed_at !== null
          ? null
          : new Date(parsed.data.expires_at),
    };
  }

  private async finishCreate<T extends ListEntity>(
    scope: UserScope,
    kind: ListEntityKind,
    action: string,
    entity: T,
    insert: D1PreparedStatement,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<T>> {
    const timestamp = context.now.getTime();
    const results = await this.database.batch([
      insert,
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           ) SELECT ?, ?, ?, ?, ?, ?, 'null', ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM ${tableName(kind)} WHERE user_id = ? AND id = ? AND version = 1 AND last_mutation_key = ?)`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          action,
          entityType(kind),
          entity.id,
          JSON.stringify(entity),
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          entity.id,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO list_undo_actions (
             token, scope_user_id, entity_kind, entity_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           ) SELECT ?, ?, ?, ?, ?, NULL, 1, ?, ? FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ? AND entity_type = ?`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          kind,
          entity.id,
          context.idempotencyKey,
          context.undoExpiresAt.getTime(),
          timestamp,
          scope.userId,
          context.idempotencyKey,
          entityType(kind),
        ),
    ]);
    if (results.every((result) => result.meta.changes === 0)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
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

  private async finishUpdate<T extends ListEntity>(
    scope: UserScope,
    kind: ListEntityKind,
    action: string,
    before: T,
    after: T,
    update: D1PreparedStatement,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<T>> {
    const timestamp = context.now.getTime();
    const results = await this.database.batch([
      update,
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM ${tableName(kind)} WHERE user_id = ? AND id = ? AND version = ? AND last_mutation_key = ?)`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          action,
          entityType(kind),
          after.id,
          JSON.stringify(before),
          JSON.stringify(after),
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          after.id,
          after.version,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO list_undo_actions (
             token, scope_user_id, entity_kind, entity_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ? AND entity_type = ?`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          kind,
          after.id,
          context.idempotencyKey,
          JSON.stringify(before),
          after.version,
          context.undoExpiresAt.getTime(),
          timestamp,
          scope.userId,
          context.idempotencyKey,
          entityType(kind),
        ),
    ]);
    if (results.every((result) => result.meta.changes === 0)) {
      return { outcome: "stale" };
    }
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
    return {
      outcome: action.endsWith(".deleted")
        ? "deleted"
        : action.endsWith(".completed")
          ? "completed"
          : action.endsWith(".reopened")
            ? "reopened"
            : "updated",
      entity: after,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async createList(
    scope: UserScope,
    listId: string,
    values: ListValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>> {
    const action = "lists.list.created";
    const duplicate = await this.duplicate<ListRecord>(
      scope,
      context.idempotencyKey,
      "list",
      action,
    );
    if (duplicate !== null) return duplicate;
    const entity: ListRecord = {
      id: listId,
      title: values.title,
      source: "manual_command",
      status: "active",
      version: 1,
      createdAt: context.now,
      updatedAt: context.now,
      deletedAt: null,
    };
    const timestamp = context.now.getTime();
    return this.finishCreate(
      scope,
      "list",
      action,
      entity,
      this.database
        .prepare(
          `INSERT INTO lists (id, user_id, title, source, status, version, last_mutation_key, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, 'manual_command', 'active', 1, ?, ?, ?, NULL)`,
        )
        .bind(
          listId,
          scope.userId,
          values.title,
          context.idempotencyKey,
          timestamp,
          timestamp,
        ),
      context,
    );
  }

  async renameList(
    scope: UserScope,
    listId: string,
    expectedVersion: number,
    values: ListValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>> {
    const action = "lists.list.updated";
    const duplicate = await this.duplicate<ListRecord>(
      scope,
      context.idempotencyKey,
      "list",
      action,
    );
    if (duplicate !== null) return duplicate;
    const before = await this.getListRecord(scope, listId, false);
    if (before === null) return { outcome: "not_found" };
    if (before.version !== expectedVersion) return { outcome: "stale" };
    const after: ListRecord = {
      ...before,
      title: values.title,
      version: before.version + 1,
      updatedAt: context.now,
    };
    return this.finishUpdate(
      scope,
      "list",
      action,
      before,
      after,
      this.database
        .prepare(
          `UPDATE lists SET title = ?, version = version + 1, last_mutation_key = ?, updated_at = ?
           WHERE user_id = ? AND id = ? AND status = 'active' AND version = ?`,
        )
        .bind(
          values.title,
          context.idempotencyKey,
          context.now.getTime(),
          scope.userId,
          listId,
          expectedVersion,
        ),
      context,
    );
  }

  async deleteList(
    scope: UserScope,
    listId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>> {
    const action = "lists.list.deleted";
    const duplicate = await this.duplicate<ListRecord>(
      scope,
      context.idempotencyKey,
      "list",
      action,
    );
    if (duplicate !== null) return duplicate;
    const before = await this.getListRecord(scope, listId, false);
    if (before === null) return { outcome: "not_found" };
    if (before.version !== expectedVersion) return { outcome: "stale" };
    const child = await this.database
      .prepare(
        `SELECT id FROM list_items WHERE user_id = ? AND list_id = ? AND status != 'deleted' LIMIT 1`,
      )
      .bind(scope.userId, listId)
      .first();
    if (child !== null) return { outcome: "list_not_empty" };
    const after: ListRecord = {
      ...before,
      status: "deleted",
      version: before.version + 1,
      updatedAt: context.now,
      deletedAt: context.now,
    };
    const result = await this.finishUpdate(
      scope,
      "list",
      action,
      before,
      after,
      this.database
        .prepare(
          `UPDATE lists SET status = 'deleted', version = version + 1,
             last_mutation_key = ?, updated_at = ?, deleted_at = ?
           WHERE user_id = ? AND id = ? AND status = 'active' AND version = ?
             AND NOT EXISTS (
               SELECT 1 FROM list_items
               WHERE user_id = ? AND list_id = ? AND status != 'deleted'
             )`,
        )
        .bind(
          context.idempotencyKey,
          context.now.getTime(),
          context.now.getTime(),
          scope.userId,
          listId,
          expectedVersion,
          scope.userId,
          listId,
        ),
      context,
    );
    if (result.outcome !== "stale") return result;
    const racedChild = await this.database
      .prepare(
        `SELECT id FROM list_items WHERE user_id = ? AND list_id = ? AND status != 'deleted' LIMIT 1`,
      )
      .bind(scope.userId, listId)
      .first();
    return racedChild === null ? result : { outcome: "list_not_empty" };
  }

  async createItem(
    scope: UserScope,
    itemId: string,
    listId: string,
    values: ListItemValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>> {
    const action = "lists.item.created";
    const duplicate = await this.duplicate<ListItemRecord>(
      scope,
      context.idempotencyKey,
      "item",
      action,
    );
    if (duplicate !== null) return duplicate;
    const parent = await this.getListRecord(scope, listId, false);
    if (parent === null) return { outcome: "list_not_found" };
    const entity: ListItemRecord = {
      id: itemId,
      listId,
      text: values.text,
      source: "manual_command",
      status: "open",
      version: 1,
      createdAt: context.now,
      updatedAt: context.now,
      completedAt: null,
      deletedAt: null,
    };
    const timestamp = context.now.getTime();
    return this.finishCreate(
      scope,
      "item",
      action,
      entity,
      this.database
        .prepare(
          `INSERT INTO list_items (
             id, user_id, list_id, text, source, status, version,
             last_mutation_key, created_at, updated_at, completed_at, deleted_at
           ) SELECT ?, ?, id, ?, 'manual_command', 'open', 1, ?, ?, ?, NULL, NULL
             FROM lists WHERE user_id = ? AND id = ? AND status = 'active'`,
        )
        .bind(
          itemId,
          scope.userId,
          values.text,
          context.idempotencyKey,
          timestamp,
          timestamp,
          scope.userId,
          listId,
        ),
      context,
    );
  }

  private async changeItemState(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    target: "completed" | "open" | "deleted",
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>> {
    const action = `lists.item.${target === "open" ? "reopened" : target}`;
    const duplicate = await this.duplicate<ListItemRecord>(
      scope,
      context.idempotencyKey,
      "item",
      action,
    );
    if (duplicate !== null) return duplicate;
    const before = await this.getItemRecord(scope, itemId, false);
    if (before === null) return { outcome: "not_found" };
    if (before.version !== expectedVersion) return { outcome: "stale" };
    if (target === "completed" && before.status === "completed") {
      return { outcome: "already_completed" };
    }
    if (target === "open" && before.status === "open") {
      return { outcome: "already_open" };
    }
    const after: ListItemRecord = {
      ...before,
      status: target,
      version: before.version + 1,
      updatedAt: context.now,
      completedAt: target === "completed" ? context.now : null,
      deletedAt: target === "deleted" ? context.now : null,
    };
    const allowedStatus =
      target === "completed"
        ? "open"
        : target === "open"
          ? "completed"
          : before.status;
    return this.finishUpdate(
      scope,
      "item",
      action,
      before,
      after,
      this.database
        .prepare(
          `UPDATE list_items SET status = ?, version = version + 1,
             last_mutation_key = ?, updated_at = ?, completed_at = ?, deleted_at = ?
           WHERE user_id = ? AND id = ? AND status = ? AND version = ?`,
        )
        .bind(
          target,
          context.idempotencyKey,
          context.now.getTime(),
          after.completedAt?.getTime() ?? null,
          after.deletedAt?.getTime() ?? null,
          scope.userId,
          itemId,
          allowedStatus,
          expectedVersion,
        ),
      context,
    );
  }

  completeItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>> {
    return this.changeItemState(
      scope,
      itemId,
      expectedVersion,
      "completed",
      context,
    );
  }

  reopenItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>> {
    return this.changeItemState(
      scope,
      itemId,
      expectedVersion,
      "open",
      context,
    );
  }

  deleteItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>> {
    return this.changeItemState(
      scope,
      itemId,
      expectedVersion,
      "deleted",
      context,
    );
  }

  async createNote(
    scope: UserScope,
    noteId: string,
    values: NoteValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>> {
    const action = "lists.note.created";
    const duplicate = await this.duplicate<NoteRecord>(
      scope,
      context.idempotencyKey,
      "note",
      action,
    );
    if (duplicate !== null) return duplicate;
    const entity: NoteRecord = {
      id: noteId,
      ...values,
      source: "manual_command",
      status: "active",
      version: 1,
      createdAt: context.now,
      updatedAt: context.now,
      deletedAt: null,
    };
    const timestamp = context.now.getTime();
    return this.finishCreate(
      scope,
      "note",
      action,
      entity,
      this.database
        .prepare(
          `INSERT INTO notes (id, user_id, title, body, source, status, version, last_mutation_key, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, 'manual_command', 'active', 1, ?, ?, ?, NULL)`,
        )
        .bind(
          noteId,
          scope.userId,
          values.title,
          values.body,
          context.idempotencyKey,
          timestamp,
          timestamp,
        ),
      context,
    );
  }

  async updateNote(
    scope: UserScope,
    noteId: string,
    expectedVersion: number,
    values: NoteValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>> {
    const action = "lists.note.updated";
    const duplicate = await this.duplicate<NoteRecord>(
      scope,
      context.idempotencyKey,
      "note",
      action,
    );
    if (duplicate !== null) return duplicate;
    const before = await this.getNoteRecord(scope, noteId, false);
    if (before === null) return { outcome: "not_found" };
    if (before.version !== expectedVersion) return { outcome: "stale" };
    const after: NoteRecord = {
      ...before,
      ...values,
      version: before.version + 1,
      updatedAt: context.now,
    };
    return this.finishUpdate(
      scope,
      "note",
      action,
      before,
      after,
      this.database
        .prepare(
          `UPDATE notes SET title = ?, body = ?, version = version + 1,
             last_mutation_key = ?, updated_at = ?
           WHERE user_id = ? AND id = ? AND status = 'active' AND version = ?`,
        )
        .bind(
          values.title,
          values.body,
          context.idempotencyKey,
          context.now.getTime(),
          scope.userId,
          noteId,
          expectedVersion,
        ),
      context,
    );
  }

  async deleteNote(
    scope: UserScope,
    noteId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>> {
    const action = "lists.note.deleted";
    const duplicate = await this.duplicate<NoteRecord>(
      scope,
      context.idempotencyKey,
      "note",
      action,
    );
    if (duplicate !== null) return duplicate;
    const before = await this.getNoteRecord(scope, noteId, false);
    if (before === null) return { outcome: "not_found" };
    if (before.version !== expectedVersion) return { outcome: "stale" };
    const after: NoteRecord = {
      ...before,
      status: "deleted",
      version: before.version + 1,
      updatedAt: context.now,
      deletedAt: context.now,
    };
    return this.finishUpdate(
      scope,
      "note",
      action,
      before,
      after,
      this.database
        .prepare(
          `UPDATE notes SET status = 'deleted', version = version + 1,
             last_mutation_key = ?, updated_at = ?, deleted_at = ?
           WHERE user_id = ? AND id = ? AND status = 'active' AND version = ?`,
        )
        .bind(
          context.idempotencyKey,
          context.now.getTime(),
          context.now.getTime(),
          scope.userId,
          noteId,
          expectedVersion,
        ),
      context,
    );
  }

  private entityByKind(
    scope: UserScope,
    kind: ListEntityKind,
    id: string,
  ): Promise<ListEntity | null> {
    if (kind === "list") return this.getListRecord(scope, id, true);
    if (kind === "item") return this.getItemRecord(scope, id, true);
    return this.getNoteRecord(scope, id, true);
  }

  private restoreStatement(
    scope: UserScope,
    kind: ListEntityKind,
    snapshot: ListEntity,
    expectedVersion: number,
    context: Omit<ListMutationContext, "undoToken" | "undoExpiresAt">,
    token: string,
  ): D1PreparedStatement {
    const commonTail = [
      snapshot.version,
      context.idempotencyKey,
      context.now.getTime(),
      snapshot.deletedAt?.getTime() ?? null,
      scope.userId,
      snapshot.id,
      expectedVersion,
      token,
      scope.userId,
      context.idempotencyKey,
    ] as const;
    if (kind === "list") {
      const list = snapshot as ListRecord;
      return this.database
        .prepare(
          `UPDATE lists SET title = ?, source = ?, status = ?, version = ?,
             last_mutation_key = ?, updated_at = ?, deleted_at = ?
           WHERE user_id = ? AND id = ? AND version = ?
             AND EXISTS (SELECT 1 FROM list_undo_actions WHERE token = ? AND scope_user_id = ? AND consumed_by_idempotency_key = ?)`,
        )
        .bind(list.title, list.source, list.status, ...commonTail);
    }
    if (kind === "item") {
      const item = snapshot as ListItemRecord;
      return this.database
        .prepare(
          `UPDATE list_items SET list_id = ?, text = ?, source = ?, status = ?,
             version = ?, last_mutation_key = ?, updated_at = ?, completed_at = ?, deleted_at = ?
           WHERE user_id = ? AND id = ? AND version = ?
             AND EXISTS (SELECT 1 FROM list_undo_actions WHERE token = ? AND scope_user_id = ? AND consumed_by_idempotency_key = ?)
             AND EXISTS (SELECT 1 FROM lists WHERE user_id = ? AND id = ? AND status = 'active')`,
        )
        .bind(
          item.listId,
          item.text,
          item.source,
          item.status,
          item.version,
          context.idempotencyKey,
          context.now.getTime(),
          item.completedAt?.getTime() ?? null,
          item.deletedAt?.getTime() ?? null,
          scope.userId,
          item.id,
          expectedVersion,
          token,
          scope.userId,
          context.idempotencyKey,
          scope.userId,
          item.listId,
        );
    }
    const note = snapshot as NoteRecord;
    return this.database
      .prepare(
        `UPDATE notes SET title = ?, body = ?, source = ?, status = ?, version = ?,
           last_mutation_key = ?, updated_at = ?, deleted_at = ?
         WHERE user_id = ? AND id = ? AND version = ?
           AND EXISTS (SELECT 1 FROM list_undo_actions WHERE token = ? AND scope_user_id = ? AND consumed_by_idempotency_key = ?)`,
      )
      .bind(note.title, note.body, note.source, note.status, ...commonTail);
  }

  async undo(
    scope: UserScope,
    token: string,
    context: Omit<ListMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoListResult> {
    const duplicateRow = await this.database
      .prepare(
        `SELECT entity_type, entity_id FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ? AND action = 'lists.reverted'`,
      )
      .bind(scope.userId, context.idempotencyKey)
      .first();
    if (duplicateRow !== null) {
      const parsed = duplicateUndoSchema.safeParse(duplicateRow);
      if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        outcome: "duplicate",
        entityKind: kindFromEntityType(parsed.data.entity_type),
        entityId: parsed.data.entity_id,
      };
    }

    const row = await this.database
      .prepare(
        `SELECT entity_kind, entity_id, before_json, expected_version, expires_at, consumed_at
         FROM list_undo_actions WHERE token = ? AND scope_user_id = ?`,
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
    if (current?.version !== undo.expected_version) {
      return { outcome: "stale" };
    }
    if (undo.entity_kind === "list" && undo.before_json === null) {
      const child = await this.database
        .prepare(
          `SELECT id FROM list_items WHERE user_id = ? AND list_id = ? LIMIT 1`,
        )
        .bind(scope.userId, undo.entity_id)
        .first();
      if (child !== null) return { outcome: "stale" };
    }

    let restored: ListEntity | null = null;
    if (undo.before_json !== null) {
      const snapshot = parseAuditEntity(undo.entity_kind, undo.before_json);
      restored = {
        ...snapshot,
        version: current.version + 1,
        updatedAt: context.now,
      };
      if (undo.entity_kind === "item") {
        const item = restored as ListItemRecord;
        const parent = await this.getListRecord(scope, item.listId, false);
        if (parent === null) return { outcome: "stale" };
      }
    }

    const timestamp = context.now.getTime();
    const referenceGuard =
      undo.entity_kind === "list" && undo.before_json === null
        ? "AND NOT EXISTS (SELECT 1 FROM list_items WHERE user_id = ? AND list_id = ?)"
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
    const claim = this.database
      .prepare(
        `UPDATE list_undo_actions SET consumed_at = ?, consumed_by_idempotency_key = ?
         WHERE token = ? AND scope_user_id = ? AND consumed_at IS NULL AND expires_at > ? AND expected_version = ?
           AND EXISTS (SELECT 1 FROM ${tableName(undo.entity_kind)} WHERE user_id = ? AND id = ? AND version = ?)
           ${referenceGuard}`,
      )
      .bind(...claimBindings);
    const mutation =
      restored === null
        ? this.database
            .prepare(
              `DELETE FROM ${tableName(undo.entity_kind)} WHERE user_id = ? AND id = ? AND version = ?
               AND EXISTS (SELECT 1 FROM list_undo_actions WHERE token = ? AND scope_user_id = ? AND consumed_by_idempotency_key = ?)`,
            )
            .bind(
              scope.userId,
              undo.entity_id,
              undo.expected_version,
              token,
              scope.userId,
              context.idempotencyKey,
            )
        : this.restoreStatement(
            scope,
            undo.entity_kind,
            restored,
            undo.expected_version,
            context,
            token,
          );
    const results = await this.database.batch([
      claim,
      mutation,
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           ) SELECT ?, ?, ?, 'lists.reverted', ?, ?, ?, ?, ?, ?, ?
             FROM list_undo_actions
             WHERE token = ? AND scope_user_id = ? AND consumed_by_idempotency_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          entityType(undo.entity_kind),
          undo.entity_id,
          JSON.stringify(current),
          JSON.stringify(restored),
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          token,
          scope.userId,
          context.idempotencyKey,
        ),
    ]);
    if (results.every((result) => result.meta.changes === 0)) {
      return { outcome: "stale" };
    }
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new AppError("INTERNAL_REDACTED", true);
    }
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
        `DELETE FROM list_undo_actions WHERE token IN (
           SELECT token FROM list_undo_actions
           WHERE scope_user_id = ? AND expires_at <= ?
           ORDER BY expires_at LIMIT ?
         )`,
      )
      .bind(scope.userId, before.getTime(), limit)
      .run();
    return result.meta.changes;
  }
}
