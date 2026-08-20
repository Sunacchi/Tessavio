import { z } from "zod";
import type {
  PreferenceMutationContext,
  PreferenceRepository,
  SetPreferencesResult,
  UndoPreferencesResult,
} from "../../application/ports/preferences";
import type {
  PreferenceProfile,
  PreferenceValues,
} from "../../domains/preferences/preferences";
import type { UserScope } from "../../shared/contracts";
import { AppError } from "../../shared/errors";

const profileSchema = z
  .object({
    language: z.literal("it"),
    timeZone: z.string().min(1),
    hourFormat: z.enum(["12h", "24h"]),
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/u),
    quietHours: z
      .object({
        startMinute: z.number().int().min(0).max(1_439),
        endMinute: z.number().int().min(0).max(1_439),
      })
      .strict()
      .nullable(),
    version: z.number().int().positive(),
  })
  .strict();

const storedProfileSchema = z.object({
  language: z.literal("it"),
  time_zone: z.string().min(1),
  hour_format: z.enum(["12h", "24h"]),
  default_currency: z.string().regex(/^[A-Z]{3}$/u),
  quiet_hours_start_minute: z.number().int().min(0).max(1_439).nullable(),
  quiet_hours_end_minute: z.number().int().min(0).max(1_439).nullable(),
  version: z.number().int().positive(),
});

const duplicateMutationSchema = z.object({
  after_json: z.string(),
  token: z.string().min(1).nullable(),
  expires_at: z.number().int().nullable(),
});

const duplicateUndoSchema = z.object({ after_json: z.string() });

const undoRowSchema = z.object({
  before_json: z.string().nullable(),
  expected_version: z.number().int().positive(),
  expires_at: z.number().int(),
  consumed_at: z.number().int().nullable(),
});

function parseJsonProfile(value: string): PreferenceProfile | null {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  if (json === null) {
    return null;
  }
  const parsed = profileSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError("INTERNAL_REDACTED", false);
  }
  return parsed.data;
}

function serializeProfile(profile: PreferenceProfile | null): string {
  return JSON.stringify(profile);
}

export class D1PreferenceRepository implements PreferenceRepository {
  constructor(private readonly database: D1Database) {}

  async get(scope: UserScope): Promise<PreferenceProfile | null> {
    const row = await this.database
      .prepare(
        `SELECT language, time_zone, hour_format, default_currency,
                quiet_hours_start_minute, quiet_hours_end_minute, version
         FROM user_preferences
         WHERE user_id = ?`,
      )
      .bind(scope.userId)
      .first();
    if (row === null) {
      return null;
    }
    const parsed = storedProfileSchema.safeParse(row);
    if (!parsed.success) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    return {
      language: parsed.data.language,
      timeZone: parsed.data.time_zone,
      hourFormat: parsed.data.hour_format,
      defaultCurrency: parsed.data.default_currency,
      quietHours:
        parsed.data.quiet_hours_start_minute === null ||
        parsed.data.quiet_hours_end_minute === null
          ? null
          : {
              startMinute: parsed.data.quiet_hours_start_minute,
              endMinute: parsed.data.quiet_hours_end_minute,
            },
      version: parsed.data.version,
    };
  }

  async set(
    scope: UserScope,
    values: PreferenceValues,
    context: PreferenceMutationContext,
  ): Promise<SetPreferencesResult> {
    const duplicateRow = await this.database
      .prepare(
        `SELECT a.after_json, u.token, u.expires_at
         FROM audit_log a
         LEFT JOIN preference_undo_actions u
           ON u.scope_user_id = a.scope_user_id
          AND u.source_idempotency_key = a.idempotency_key
         WHERE a.scope_user_id = ? AND a.idempotency_key = ?
           AND a.action IN ('preferences.created', 'preferences.updated')`,
      )
      .bind(scope.userId, context.idempotencyKey)
      .first();
    if (duplicateRow !== null) {
      const duplicate = duplicateMutationSchema.safeParse(duplicateRow);
      if (!duplicate.success) {
        throw new AppError("INTERNAL_REDACTED", false);
      }
      const profile = parseJsonProfile(duplicate.data.after_json);
      if (profile === null) {
        throw new AppError("INTERNAL_REDACTED", false);
      }
      return {
        outcome: "duplicate",
        profile,
        undoToken: duplicate.data.token,
        undoExpiresAt:
          duplicate.data.expires_at === null
            ? null
            : new Date(duplicate.data.expires_at),
      };
    }

    const current = await this.get(scope);
    const nextProfile: PreferenceProfile = {
      language: values.language,
      timeZone: values.timeZone,
      hourFormat: values.hourFormat,
      defaultCurrency: values.defaultCurrency,
      quietHours:
        values.quietHours === undefined
          ? (current?.quietHours ?? null)
          : values.quietHours,
      version: (current?.version ?? 0) + 1,
    };
    const timestamp = context.now.getTime();
    const beforeJson = serializeProfile(current);
    const afterJson = serializeProfile(nextProfile);
    const action =
      current === null ? "preferences.created" : "preferences.updated";

    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO user_preferences (
             user_id, language, time_zone, hour_format, default_currency,
             quiet_hours_start_minute, quiet_hours_end_minute,
             version, last_mutation_key, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             language = excluded.language,
             time_zone = excluded.time_zone,
             hour_format = excluded.hour_format,
             default_currency = excluded.default_currency,
             quiet_hours_start_minute = excluded.quiet_hours_start_minute,
             quiet_hours_end_minute = excluded.quiet_hours_end_minute,
             version = excluded.version,
             last_mutation_key = excluded.last_mutation_key,
             updated_at = excluded.updated_at
           WHERE user_preferences.version = ?`,
        )
        .bind(
          scope.userId,
          values.language,
          values.timeZone,
          values.hourFormat,
          values.defaultCurrency,
          nextProfile.quietHours?.startMinute ?? null,
          nextProfile.quietHours?.endMinute ?? null,
          nextProfile.version,
          context.idempotencyKey,
          timestamp,
          timestamp,
          current?.version ?? 0,
        ),
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, ?, 'user_preferences', ?, ?, ?, ?, ?, ?
           FROM user_preferences
           WHERE user_id = ? AND version = ? AND last_mutation_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          action,
          scope.userId,
          beforeJson,
          afterJson,
          context.correlationId,
          context.idempotencyKey,
          timestamp,
          scope.userId,
          nextProfile.version,
          context.idempotencyKey,
        ),
      this.database
        .prepare(
          `INSERT INTO preference_undo_actions (
             token, scope_user_id, source_idempotency_key, before_json,
             expected_version, expires_at, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?
           FROM audit_log
           WHERE scope_user_id = ? AND idempotency_key = ?`,
        )
        .bind(
          context.undoToken,
          scope.userId,
          context.idempotencyKey,
          current === null ? null : beforeJson,
          nextProfile.version,
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
      outcome: current === null ? "created" : "updated",
      profile: nextProfile,
      undoToken: context.undoToken,
      undoExpiresAt: context.undoExpiresAt,
    };
  }

  async undo(
    scope: UserScope,
    token: string,
    context: Omit<PreferenceMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoPreferencesResult> {
    const duplicateRow = await this.database
      .prepare(
        `SELECT after_json FROM audit_log
         WHERE scope_user_id = ? AND idempotency_key = ?
           AND action = 'preferences.reverted'`,
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
        profile: parseJsonProfile(duplicate.data.after_json),
      };
    }

    const storedRow = await this.database
      .prepare(
        `SELECT before_json, expected_version, expires_at, consumed_at
         FROM preference_undo_actions
         WHERE token = ? AND scope_user_id = ?`,
      )
      .bind(token, scope.userId)
      .first();
    if (storedRow === null) {
      return { outcome: "not_found" };
    }
    const stored = undoRowSchema.safeParse(storedRow);
    if (!stored.success) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    if (stored.data.consumed_at !== null) {
      return { outcome: "used" };
    }
    if (stored.data.expires_at <= context.now.getTime()) {
      return { outcome: "expired" };
    }

    const current = await this.get(scope);
    if (current?.version !== stored.data.expected_version) {
      return { outcome: "stale" };
    }

    const previous =
      stored.data.before_json === null
        ? null
        : parseJsonProfile(stored.data.before_json);
    if (stored.data.before_json !== null && previous === null) {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    const restored: PreferenceProfile | null =
      previous === null ? null : { ...previous, version: current.version + 1 };
    const timestamp = context.now.getTime();
    const beforeJson = serializeProfile(current);
    const afterJson = serializeProfile(restored);

    const claimStatement = this.database
      .prepare(
        `UPDATE preference_undo_actions
         SET consumed_at = ?, consumed_by_idempotency_key = ?
         WHERE token = ? AND scope_user_id = ? AND consumed_at IS NULL
           AND expires_at > ? AND expected_version = ?
           AND EXISTS (
             SELECT 1 FROM user_preferences
             WHERE user_id = ? AND version = ?
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
        current.version,
      );

    const mutationStatement =
      restored === null
        ? this.database
            .prepare(
              `DELETE FROM user_preferences
               WHERE user_id = ? AND version = ?
                 AND EXISTS (
                   SELECT 1 FROM preference_undo_actions
                   WHERE token = ? AND scope_user_id = ?
                     AND consumed_by_idempotency_key = ?
                 )`,
            )
            .bind(
              scope.userId,
              current.version,
              token,
              scope.userId,
              context.idempotencyKey,
            )
        : this.database
            .prepare(
              `UPDATE user_preferences
               SET language = ?, time_zone = ?, hour_format = ?,
                   default_currency = ?, quiet_hours_start_minute = ?,
                   quiet_hours_end_minute = ?, version = ?, last_mutation_key = ?,
                   updated_at = ?
               WHERE user_id = ? AND version = ?
                 AND EXISTS (
                   SELECT 1 FROM preference_undo_actions
                   WHERE token = ? AND scope_user_id = ?
                     AND consumed_by_idempotency_key = ?
                 )`,
            )
            .bind(
              restored.language,
              restored.timeZone,
              restored.hourFormat,
              restored.defaultCurrency,
              restored.quietHours?.startMinute ?? null,
              restored.quietHours?.endMinute ?? null,
              restored.version,
              context.idempotencyKey,
              timestamp,
              scope.userId,
              current.version,
              token,
              scope.userId,
              context.idempotencyKey,
            );

    const results = await this.database.batch([
      claimStatement,
      mutationStatement,
      this.database
        .prepare(
          `INSERT INTO audit_log (
             id, scope_user_id, actor_user_id, action, entity_type, entity_id,
             before_json, after_json, correlation_id, idempotency_key, created_at
           )
           SELECT ?, ?, ?, 'preferences.reverted', 'user_preferences', ?,
                  ?, ?, ?, ?, ?
           FROM preference_undo_actions
           WHERE token = ? AND scope_user_id = ?
             AND consumed_by_idempotency_key = ?`,
        )
        .bind(
          context.auditId,
          scope.userId,
          context.actorUserId,
          scope.userId,
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
    return { outcome: "reverted", profile: restored };
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
        `DELETE FROM preference_undo_actions
         WHERE token IN (
           SELECT token FROM preference_undo_actions
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
