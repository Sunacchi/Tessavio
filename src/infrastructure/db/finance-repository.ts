import { z } from "zod";
import type {
  FinanceMutationContext,
  FinanceRepository,
  MutateFinanceResult,
  UndoFinanceResult,
} from "../../application/ports";
import {
  financeMaximumAmountMinor,
  type FinanceCurrencyTotal,
  type FinanceDateRange,
  type FinanceEntryRecord,
  type FinanceEntryValues,
} from "../../domains/finance/finance";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

/*
 * D1 returns untyped rows and persisted audit JSON. Both boundaries are parsed
 * again here so corrupted storage cannot bypass the monetary domain limits.
 */
const storedEntrySchema = z.object({
  id: z.string().min(1),
  entry_kind: z.enum(["expense", "income"]),
  amount_minor: z.number().int().positive().max(financeMaximumAmountMinor),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  local_date: z.string().min(1),
  category: z.string().min(1).max(100),
  merchant: z.string().min(1).max(200).nullable(),
  payment_method: z.string().min(1).max(100).nullable(),
  note: z.string().min(1).max(500).nullable(),
  source: z.literal("manual_command"),
  status: z.enum(["active", "deleted"]),
  version: z.number().int().positive(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  deleted_at: z.number().int().nullable(),
});

const entryJsonSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["expense", "income"]),
    amountMinor: z.number().int().positive().max(financeMaximumAmountMinor),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    localDate: z.string().min(1),
    category: z.string().min(1).max(100),
    merchant: z.string().min(1).max(200).nullable(),
    paymentMethod: z.string().min(1).max(100).nullable(),
    note: z.string().min(1).max(500).nullable(),
    source: z.literal("manual_command"),
    status: z.enum(["active", "deleted"]),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    deletedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

const duplicateMutationSchema = z.object({
  after_json: z.string(),
  token: z.string().min(1).nullable(),
  expires_at: z.number().int().nullable(),
});
const duplicateUndoSchema = z.object({ after_json: z.string() });
const undoRowSchema = z.object({
  entry_id: z.string().min(1),
  before_json: z.string().nullable(),
  expected_version: z.number().int().positive(),
  expires_at: z.number().int(),
  consumed_at: z.number().int().nullable(),
});
const totalRowSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/u),
  expense_minor: z.string().regex(/^\d+$/u),
  income_minor: z.string().regex(/^\d+$/u),
  entry_count: z.number().int().nonnegative(),
});

const selectColumns = `id, entry_kind, amount_minor, currency, local_date,
  category, merchant, payment_method, note, source, status, version,
  created_at, updated_at, deleted_at`;

function fromStoredRow(value: unknown): FinanceEntryRecord {
  const parsed = storedEntrySchema.safeParse(value);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  const row = parsed.data;
  if (
    (row.status === "active" && row.deleted_at !== null) ||
    (row.status === "deleted" && row.deleted_at === null)
  ) {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  return {
    id: row.id,
    kind: row.entry_kind,
    amountMinor: row.amount_minor,
    currency: row.currency,
    localDate: row.local_date,
    category: row.category,
    merchant: row.merchant,
    paymentMethod: row.payment_method,
    note: row.note,
    source: row.source,
    status: row.status,
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
  };
}

function parseJsonEntry(value: string): FinanceEntryRecord | null {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  if (json === null) return null;
  const parsed = entryJsonSchema.safeParse(json);
  if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
  return {
    ...parsed.data,
    createdAt: new Date(parsed.data.createdAt),
    updatedAt: new Date(parsed.data.updatedAt),
    deletedAt:
      parsed.data.deletedAt === null ? null : new Date(parsed.data.deletedAt),
  };
}

function serializeEntry(entry: FinanceEntryRecord | null): string {
  return JSON.stringify(entry);
}

function newEntry(
  entryId: string,
  values: FinanceEntryValues,
  now: Date,
): FinanceEntryRecord {
  return {
    id: entryId,
    ...values,
    source: "manual_command",
    status: "active",
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("INVALID_INPUT", false);
  }
}

export class D1FinanceRepository implements FinanceRepository {
  constructor(private readonly database: D1Database) {}

  private async getCurrent(
    scope: UserScope,
    entryId: string,
  ): Promise<FinanceEntryRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT ${selectColumns} FROM finance_entries
         WHERE user_id = ? AND id = ?`,
      )
      .bind(scope.userId, entryId)
      .first();
    return row === null ? null : fromStoredRow(row);
  }

  async get(
    scope: UserScope,
    entryId: string,
  ): Promise<FinanceEntryRecord | null> {
    const entry = await this.getCurrent(scope, entryId);
    return entry?.status === "active" ? entry : null;
  }

  async list(
    scope: UserScope,
    range: FinanceDateRange,
    limit: number,
  ): Promise<FinanceEntryRecord[]> {
    validateLimit(limit);
    const rows = await this.database
      .prepare(
        `SELECT ${selectColumns}
         FROM finance_entries
         WHERE user_id = ? AND status = 'active'
           AND local_date >= ? AND local_date <= ?
         ORDER BY local_date DESC, created_at DESC, id
         LIMIT ?`,
      )
      .bind(scope.userId, range.startDate, range.endDate, limit)
      .all();
    return rows.results.map(fromStoredRow);
  }

  async totals(
    scope: UserScope,
    range: FinanceDateRange,
  ): Promise<FinanceCurrencyTotal[]> {
    const rows = await this.database
      .prepare(
        `SELECT currency,
           CAST(SUM(CASE WHEN entry_kind = 'expense' THEN amount_minor ELSE 0 END) AS TEXT) AS expense_minor,
           CAST(SUM(CASE WHEN entry_kind = 'income' THEN amount_minor ELSE 0 END) AS TEXT) AS income_minor,
           COUNT(*) AS entry_count
         FROM finance_entries
         WHERE user_id = ? AND status = 'active'
           AND local_date >= ? AND local_date <= ?
         GROUP BY currency
         ORDER BY currency`,
      )
      .bind(scope.userId, range.startDate, range.endDate)
      .all();
    return rows.results.map((value) => {
      const parsed = totalRowSchema.safeParse(value);
      if (!parsed.success) throw new AppError("INTERNAL_REDACTED", false);
      const expenseMinor = BigInt(parsed.data.expense_minor);
      const incomeMinor = BigInt(parsed.data.income_minor);
      return {
        currency: parsed.data.currency,
        expenseMinor,
        incomeMinor,
        netMinor: incomeMinor - expenseMinor,
        entryCount: parsed.data.entry_count,
      };
    });
  }

  private async duplicateMutation(
    scope: UserScope,
    idempotencyKey: string,
  ): Promise<MutateFinanceResult | null> {
    const row = await this.database
      .prepare(
        `SELECT a.after_json, u.token, u.expires_at
         FROM audit_log a
         LEFT JOIN finance_undo_actions u
           ON u.scope_user_id = a.scope_user_id
          AND u.source_idempotency_key = a.idempotency_key
         WHERE a.scope_user_id = ? AND a.idempotency_key = ?
           AND a.entity_type = 'finance_entry'
           AND a.action IN ('finance.created', 'finance.updated', 'finance.deleted')`,
      )
      .bind(scope.userId, idempotencyKey)
      .first();
    if (row === null) return null;
    const duplicate = duplicateMutationSchema.safeParse(row);
    if (!duplicate.success) throw new AppError("INTERNAL_REDACTED", false);
    const entry = parseJsonEntry(duplicate.data.after_json);
    if (entry === null) throw new AppError("INTERNAL_REDACTED", false);
    return {
      outcome: "duplicate",
      entry,
      undoToken: duplicate.data.token,
      undoExpiresAt:
        duplicate.data.expires_at === null
          ? null
          : new Date(duplicate.data.expires_at),
    };
  }

  async create(
    scope: UserScope,
    entryId: string,
    values: FinanceEntryValues,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult> {
    const duplicate = await this.duplicateMutation(
      scope,
      context.idempotencyKey,
    );
    if (duplicate !== null) return duplicate;
    const entry = newEntry(entryId, values, context.now);
    const timestamp = context.now.getTime();
    const afterJson = serializeEntry(entry);
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO finance_entries (
             id, user_id, entry_kind, amount_minor, currency, local_date,
             category, merchant, payment_method, note, source, status,
             version, last_mutation_key, created_at, updated_at, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual_command',
             'active', 1, ?, ?, ?, NULL)`,
        )
        .bind(
          entry.id,
          scope.userId,
          entry.kind,
          entry.amountMinor,
          entry.currency,
          entry.localDate,
          entry.category,
          entry.merchant,
          entry.paymentMethod,
          entry.note,
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
           SELECT ?, ?, ?, 'finance.created', 'finance_entry', ?, 'null', ?, ?, ?, ?
           FROM finance_entries
           WHERE user_id = ? AND id = ? AND version = 1
             AND last_mutation_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          entry.id,
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          entry.id,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO finance_undo_actions (
             token, scope_user_id, entry_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           )
           SELECT ?, ?, ?, ?, NULL, 1, ?, ?
           FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ?
             AND entity_type = 'finance_entry'`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          entry.id,
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
      entry,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async update(
    scope: UserScope,
    entryId: string,
    expectedVersion: number,
    values: FinanceEntryValues,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult> {
    const duplicate = await this.duplicateMutation(
      scope,
      context.idempotencyKey,
    );
    if (duplicate !== null) return duplicate;
    const current = await this.getCurrent(scope, entryId);
    if (current?.status !== "active") {
      return { outcome: "not_found" };
    }
    if (current.version !== expectedVersion) return { outcome: "stale" };
    const entry: FinanceEntryRecord = {
      ...current,
      ...values,
      version: current.version + 1,
      updatedAt: context.now,
    };
    return this.applyChange(scope, current, entry, "finance.updated", context);
  }

  async delete(
    scope: UserScope,
    entryId: string,
    expectedVersion: number,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult> {
    const duplicate = await this.duplicateMutation(
      scope,
      context.idempotencyKey,
    );
    if (duplicate !== null) return duplicate;
    const current = await this.getCurrent(scope, entryId);
    if (current?.status !== "active") {
      return { outcome: "not_found" };
    }
    if (current.version !== expectedVersion) return { outcome: "stale" };
    const entry: FinanceEntryRecord = {
      ...current,
      status: "deleted",
      version: current.version + 1,
      updatedAt: context.now,
      deletedAt: context.now,
    };
    return this.applyChange(scope, current, entry, "finance.deleted", context);
  }

  private async applyChange(
    scope: UserScope,
    current: FinanceEntryRecord,
    entry: FinanceEntryRecord,
    action: "finance.updated" | "finance.deleted",
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult> {
    const timestamp = context.now.getTime();
    const beforeJson = serializeEntry(current);
    const afterJson = serializeEntry(entry);
    const results = await this.database.batch([
      this.database
        .prepare(
          `UPDATE finance_entries
           SET entry_kind = ?, amount_minor = ?, currency = ?, local_date = ?,
               category = ?, merchant = ?, payment_method = ?, note = ?,
               status = ?, version = ?, last_mutation_key = ?, updated_at = ?,
               deleted_at = ?
           WHERE user_id = ? AND id = ? AND version = ? AND status = 'active'`,
        )
        .bind(
          entry.kind,
          entry.amountMinor,
          entry.currency,
          entry.localDate,
          entry.category,
          entry.merchant,
          entry.paymentMethod,
          entry.note,
          entry.status,
          entry.version,
          context.idempotencyKey,
          timestamp,
          entry.deletedAt?.getTime() ?? null,
          scope.userId,
          entry.id,
          current.version,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, ?, 'finance_entry', ?, ?, ?, ?, ?, ?
           FROM finance_entries
           WHERE user_id = ? AND id = ? AND version = ?
             AND last_mutation_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          action,
          entry.id,
          beforeJson,
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          entry.id,
          entry.version,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO finance_undo_actions (
             token, scope_user_id, entry_id, source_idempotency_key,
             before_json, expected_version, expires_at, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
           FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ?
             AND entity_type = 'finance_entry'`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          entry.id,
          context.idempotencyKey,
          beforeJson,
          entry.version,
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
      outcome: action === "finance.updated" ? "updated" : "deleted",
      entry,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async undo(
    scope: UserScope,
    token: string,
    context: Omit<FinanceMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoFinanceResult> {
    const duplicateRow = await this.database
      .prepare(
        `SELECT after_json FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ?
           AND action = 'finance.reverted' AND entity_type = 'finance_entry'`,
      )
      .bind(scope.userId, context.idempotencyKey)
      .first();
    if (duplicateRow !== null) {
      const duplicate = duplicateUndoSchema.safeParse(duplicateRow);
      if (!duplicate.success) throw new AppError("INTERNAL_REDACTED", false);
      return {
        outcome: "duplicate",
        entry: parseJsonEntry(duplicate.data.after_json),
      };
    }

    const row = await this.database
      .prepare(
        `SELECT entry_id, before_json, expected_version, expires_at, consumed_at
         FROM finance_undo_actions
         WHERE token = ? AND scope_user_id = ?`,
      )
      .bind(token, scope.userId)
      .first();
    if (row === null) return { outcome: "not_found" };
    const stored = undoRowSchema.safeParse(row);
    if (!stored.success) throw new AppError("INTERNAL_REDACTED", false);
    if (stored.data.consumed_at !== null) return { outcome: "used" };
    if (stored.data.expires_at <= context.now.getTime()) {
      return { outcome: "expired" };
    }
    const current = await this.getCurrent(scope, stored.data.entry_id);
    if (current?.version !== stored.data.expected_version) {
      return { outcome: "stale" };
    }
    const previous =
      stored.data.before_json === null
        ? null
        : parseJsonEntry(stored.data.before_json);
    if (stored.data.before_json !== null && previous === null) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    const restored: FinanceEntryRecord | null =
      previous === null
        ? null
        : {
            ...previous,
            version: current.version + 1,
            updatedAt: context.now,
          };
    const timestamp = context.now.getTime();
    const beforeJson = serializeEntry(current);
    const afterJson = serializeEntry(restored);
    const claim = this.database
      .prepare(
        `UPDATE finance_undo_actions
         SET consumed_at = ?, consumed_by_idempotency_key = ?
         WHERE token = ? AND scope_user_id = ? AND consumed_at IS NULL
           AND expires_at > ? AND expected_version = ?
           AND EXISTS (
             SELECT 1 FROM finance_entries
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
              `DELETE FROM finance_entries
               WHERE user_id = ? AND id = ? AND version = ?
                 AND EXISTS (
                   SELECT 1 FROM finance_undo_actions
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
        : this.database
            .prepare(
              `UPDATE finance_entries
               SET entry_kind = ?, amount_minor = ?, currency = ?,
                   local_date = ?, category = ?, merchant = ?,
                   payment_method = ?, note = ?, status = ?, version = ?,
                   last_mutation_key = ?, updated_at = ?, deleted_at = ?
               WHERE user_id = ? AND id = ? AND version = ?
                 AND EXISTS (
                   SELECT 1 FROM finance_undo_actions
                   WHERE token = ? AND scope_user_id = ?
                     AND consumed_by_idempotency_key = ?
                 )`,
            )
            .bind(
              restored.kind,
              restored.amountMinor,
              restored.currency,
              restored.localDate,
              restored.category,
              restored.merchant,
              restored.paymentMethod,
              restored.note,
              restored.status,
              restored.version,
              context.idempotencyKey,
              timestamp,
              restored.deletedAt?.getTime() ?? null,
              scope.userId,
              restored.id,
              current.version,
              token,
              scope.userId,
              context.idempotencyKey,
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
           SELECT ?, ?, ?, 'finance.reverted', 'finance_entry', ?, ?, ?, ?, ?, ?
           FROM finance_undo_actions
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
    return { outcome: "reverted", entry: restored };
  }

  async purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number> {
    validateLimit(limit);
    const result = await this.database
      .prepare(
        `DELETE FROM finance_undo_actions
         WHERE token IN (
           SELECT token FROM finance_undo_actions
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
