import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    status: text("status", { enum: ["active"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [check("users_status_ck", sql`${table.status} IN ('active')`)],
);

export const telegramIdentities = sqliteTable(
  "telegram_identities",
  {
    telegramUserId: text("telegram_user_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    linkedAt: integer("linked_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("telegram_identities_user_id_uq").on(table.userId)],
);

export const userPreferences = sqliteTable(
  "user_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    language: text("language", { enum: ["it"] }).notNull(),
    timeZone: text("time_zone").notNull(),
    hourFormat: text("hour_format", { enum: ["12h", "24h"] }).notNull(),
    defaultCurrency: text("default_currency").notNull(),
    quietHoursStartMinute: integer("quiet_hours_start_minute"),
    quietHoursEndMinute: integer("quiet_hours_end_minute"),
    version: integer("version").notNull(),
    lastMutationKey: text("last_mutation_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    check("user_preferences_language_ck", sql`${table.language} IN ('it')`),
    check(
      "user_preferences_hour_format_ck",
      sql`${table.hourFormat} IN ('12h', '24h')`,
    ),
    check("user_preferences_version_ck", sql`${table.version} > 0`),
    check(
      "user_preferences_currency_ck",
      sql`${table.defaultCurrency} GLOB '[A-Z][A-Z][A-Z]'`,
    ),
    check(
      "user_preferences_quiet_hours_ck",
      sql`(${table.quietHoursStartMinute} IS NULL AND ${table.quietHoursEndMinute} IS NULL)
          OR (${table.quietHoursStartMinute} BETWEEN 0 AND 1439
              AND ${table.quietHoursEndMinute} BETWEEN 0 AND 1439
              AND ${table.quietHoursStartMinute} <> ${table.quietHoursEndMinute})`,
    ),
  ],
);

export const preferenceUndoActions = sqliteTable(
  "preference_undo_actions",
  {
    token: text("token").primaryKey(),
    scopeUserId: text("scope_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceIdempotencyKey: text("source_idempotency_key").notNull(),
    beforeJson: text("before_json"),
    expectedVersion: integer("expected_version").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    consumedByIdempotencyKey: text("consumed_by_idempotency_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("preference_undo_source_uq").on(
      table.scopeUserId,
      table.sourceIdempotencyKey,
    ),
    index("preference_undo_scope_expiry_idx").on(
      table.scopeUserId,
      table.expiresAt,
    ),
    index("preference_undo_purge_idx").on(table.expiresAt, table.consumedAt),
    check(
      "preference_undo_expected_version_ck",
      sql`${table.expectedVersion} > 0`,
    ),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventKind: text("event_kind", {
      enum: ["date_only", "instant"],
    }).notNull(),
    title: text("title").notNull(),
    localDate: text("local_date"),
    startAtUtc: integer("start_at_utc", { mode: "timestamp_ms" }),
    endAtUtc: integer("end_at_utc", { mode: "timestamp_ms" }),
    timeZone: text("time_zone"),
    status: text("status", { enum: ["active", "cancelled"] }).notNull(),
    version: integer("version").notNull(),
    lastMutationKey: text("last_mutation_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("events_scope_id_uq").on(table.userId, table.id),
    index("events_scope_date_idx").on(
      table.userId,
      table.status,
      table.localDate,
    ),
    index("events_scope_instant_idx").on(
      table.userId,
      table.status,
      table.startAtUtc,
      table.endAtUtc,
    ),
    check(
      "events_kind_ck",
      sql`${table.eventKind} IN ('date_only', 'instant')`,
    ),
    check("events_title_ck", sql`length(${table.title}) BETWEEN 1 AND 200`),
    check("events_status_ck", sql`${table.status} IN ('active', 'cancelled')`),
    check("events_version_ck", sql`${table.version} > 0`),
    check(
      "events_shape_ck",
      sql`(
        ${table.eventKind} = 'date_only'
        AND ${table.localDate} IS NOT NULL
        AND ${table.startAtUtc} IS NULL
        AND ${table.endAtUtc} IS NULL
        AND ${table.timeZone} IS NULL
      ) OR (
        ${table.eventKind} = 'instant'
        AND ${table.localDate} IS NULL
        AND ${table.startAtUtc} IS NOT NULL
        AND ${table.endAtUtc} IS NOT NULL
        AND ${table.startAtUtc} < ${table.endAtUtc}
        AND ${table.timeZone} IS NOT NULL
      )`,
    ),
    check(
      "events_cancelled_at_ck",
      sql`(${table.status} = 'active' AND ${table.cancelledAt} IS NULL)
          OR (${table.status} = 'cancelled' AND ${table.cancelledAt} IS NOT NULL)`,
    ),
  ],
);

export const eventUndoActions = sqliteTable(
  "event_undo_actions",
  {
    token: text("token").primaryKey(),
    scopeUserId: text("scope_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    sourceIdempotencyKey: text("source_idempotency_key").notNull(),
    beforeJson: text("before_json"),
    expectedVersion: integer("expected_version").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    consumedByIdempotencyKey: text("consumed_by_idempotency_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("event_undo_source_uq").on(
      table.scopeUserId,
      table.sourceIdempotencyKey,
    ),
    index("event_undo_scope_expiry_idx").on(table.scopeUserId, table.expiresAt),
    index("event_undo_purge_idx").on(table.expiresAt, table.consumedAt),
    check("event_undo_version_ck", sql`${table.expectedVersion} > 0`),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    priority: text("priority", { enum: ["low", "medium", "high"] }).notNull(),
    dueKind: text("due_kind", {
      enum: ["none", "date_only", "instant"],
    }).notNull(),
    dueDateLocal: text("due_date_local"),
    dueAtUtc: integer("due_at_utc", { mode: "timestamp_ms" }),
    timeZone: text("time_zone"),
    status: text("status", { enum: ["open", "completed"] }).notNull(),
    version: integer("version").notNull(),
    lastMutationKey: text("last_mutation_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("tasks_scope_id_uq").on(table.userId, table.id),
    index("tasks_scope_status_idx").on(
      table.userId,
      table.status,
      table.priority,
      table.createdAt,
    ),
    index("tasks_scope_date_idx").on(
      table.userId,
      table.status,
      table.dueDateLocal,
    ),
    index("tasks_scope_instant_idx").on(
      table.userId,
      table.status,
      table.dueAtUtc,
    ),
    check("tasks_title_ck", sql`length(${table.title}) BETWEEN 1 AND 200`),
    check(
      "tasks_priority_ck",
      sql`${table.priority} IN ('low', 'medium', 'high')`,
    ),
    check(
      "tasks_due_kind_ck",
      sql`${table.dueKind} IN ('none', 'date_only', 'instant')`,
    ),
    check("tasks_status_ck", sql`${table.status} IN ('open', 'completed')`),
    check("tasks_version_ck", sql`${table.version} > 0`),
    check(
      "tasks_due_shape_ck",
      sql`(
        ${table.dueKind} = 'none'
        AND ${table.dueDateLocal} IS NULL
        AND ${table.dueAtUtc} IS NULL
        AND ${table.timeZone} IS NULL
      ) OR (
        ${table.dueKind} = 'date_only'
        AND ${table.dueDateLocal} IS NOT NULL
        AND ${table.dueAtUtc} IS NULL
        AND ${table.timeZone} IS NULL
      ) OR (
        ${table.dueKind} = 'instant'
        AND ${table.dueDateLocal} IS NULL
        AND ${table.dueAtUtc} IS NOT NULL
        AND ${table.timeZone} IS NOT NULL
      )`,
    ),
    check(
      "tasks_completed_at_ck",
      sql`(${table.status} = 'open' AND ${table.completedAt} IS NULL)
          OR (${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL)`,
    ),
  ],
);

export const taskUndoActions = sqliteTable(
  "task_undo_actions",
  {
    token: text("token").primaryKey(),
    scopeUserId: text("scope_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    sourceIdempotencyKey: text("source_idempotency_key").notNull(),
    beforeJson: text("before_json"),
    expectedVersion: integer("expected_version").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    consumedByIdempotencyKey: text("consumed_by_idempotency_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("task_undo_source_uq").on(
      table.scopeUserId,
      table.sourceIdempotencyKey,
    ),
    index("task_undo_scope_expiry_idx").on(table.scopeUserId, table.expiresAt),
    index("task_undo_purge_idx").on(table.expiresAt, table.consumedAt),
    check("task_undo_version_ck", sql`${table.expectedVersion} > 0`),
  ],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    requestedAtUtc: integer("requested_at_utc", {
      mode: "timestamp_ms",
    }).notNull(),
    dueAtUtc: integer("due_at_utc", { mode: "timestamp_ms" }).notNull(),
    originalTimeZone: text("original_time_zone").notNull(),
    status: text("status", {
      enum: [
        "pending",
        "claimed",
        "sending",
        "sent",
        "cancelled",
        "permanent_failure",
        "ambiguous",
      ],
    }).notNull(),
    version: integer("version").notNull(),
    lastMutationKey: text("last_mutation_key").notNull(),
    claimJobId: text("claim_job_id"),
    claimCorrelationId: text("claim_correlation_id"),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    claimExpiresAt: integer("claim_expires_at", { mode: "timestamp_ms" }),
    enqueuedAt: integer("enqueued_at", { mode: "timestamp_ms" }),
    deliveryPreferenceVersion: integer("delivery_preference_version"),
    deliveryQuietStartMinute: integer("delivery_quiet_start_minute"),
    deliveryQuietEndMinute: integer("delivery_quiet_end_minute"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("reminders_scope_id_uq").on(table.userId, table.id),
    uniqueIndex("reminders_claim_job_uq").on(table.claimJobId),
    index("reminders_due_claim_idx").on(table.status, table.dueAtUtc),
    index("reminders_scope_list_idx").on(
      table.userId,
      table.status,
      table.dueAtUtc,
    ),
    index("reminders_recovery_idx").on(
      table.status,
      table.enqueuedAt,
      table.claimExpiresAt,
    ),
    check("reminders_text_ck", sql`length(${table.text}) BETWEEN 1 AND 200`),
    check(
      "reminders_status_ck",
      sql`${table.status} IN ('pending', 'claimed', 'sending', 'sent', 'cancelled', 'permanent_failure', 'ambiguous')`,
    ),
    check("reminders_version_ck", sql`${table.version} > 0`),
    check("reminders_attempt_ck", sql`${table.attemptCount} >= 0`),
  ],
);

export const reminderUndoActions = sqliteTable(
  "reminder_undo_actions",
  {
    token: text("token").primaryKey(),
    scopeUserId: text("scope_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reminderId: text("reminder_id").notNull(),
    sourceIdempotencyKey: text("source_idempotency_key").notNull(),
    beforeJson: text("before_json"),
    expectedVersion: integer("expected_version").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    consumedByIdempotencyKey: text("consumed_by_idempotency_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("reminder_undo_source_uq").on(
      table.scopeUserId,
      table.sourceIdempotencyKey,
    ),
    index("reminder_undo_scope_expiry_idx").on(
      table.scopeUserId,
      table.expiresAt,
    ),
    check("reminder_undo_version_ck", sql`${table.expectedVersion} > 0`),
  ],
);

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    dedupeKey: text("dedupe_key").primaryKey(),
    scopeUserId: text("scope_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reminderId: text("reminder_id").notNull(),
    jobId: text("job_id").notNull(),
    status: text("status", {
      enum: ["pending", "sending", "sent", "ambiguous", "permanent_failure"],
    }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    remoteMessageId: text("remote_message_id"),
    lastErrorCode: text("last_error_code"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("notification_deliveries_reminder_uq").on(
      table.scopeUserId,
      table.reminderId,
    ),
    index("notification_deliveries_scope_idx").on(
      table.scopeUserId,
      table.createdAt,
    ),
    check(
      "notification_deliveries_status_ck",
      sql`${table.status} IN ('pending', 'sending', 'sent', 'ambiguous', 'permanent_failure')`,
    ),
    check(
      "notification_deliveries_attempt_ck",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);

export const inboundUpdates = sqliteTable(
  "inbound_updates",
  {
    updateId: integer("update_id").primaryKey(),
    jobId: text("job_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: [
        "pending_enqueue",
        "enqueued",
        "processing",
        "completed",
        "completed_ambiguous",
        "dead",
      ],
    }).notNull(),
    envelopeJson: text("envelope_json").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    lastErrorCode: text("last_error_code"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("inbound_updates_job_id_uq").on(table.jobId),
    uniqueIndex("inbound_updates_idempotency_key_uq").on(table.idempotencyKey),
    index("inbound_updates_recovery_idx").on(table.status, table.updatedAt),
    check(
      "inbound_updates_status_ck",
      sql`${table.status} IN ('pending_enqueue', 'enqueued', 'processing', 'completed', 'completed_ambiguous', 'dead')`,
    ),
    check("inbound_updates_attempt_count_ck", sql`${table.attemptCount} >= 0`),
  ],
);

export const effects = sqliteTable(
  "effects",
  {
    effectKey: text("effect_key").primaryKey(),
    scopeUserId: text("scope_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull(),
    kind: text("kind", { enum: ["onboarding_start"] }).notNull(),
    status: text("status", { enum: ["claimed", "completed"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("effects_scope_idx").on(table.scopeUserId, table.createdAt),
    check("effects_kind_ck", sql`${table.kind} IN ('onboarding_start')`),
    check(
      "effects_status_ck",
      sql`${table.status} IN ('claimed', 'completed')`,
    ),
  ],
);

export const deliveries = sqliteTable(
  "deliveries",
  {
    deliveryKey: text("delivery_key").primaryKey(),
    scopeUserId: text("scope_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id").notNull(),
    kind: text("kind", { enum: ["telegram_reply"] }).notNull(),
    status: text("status", {
      enum: ["pending", "sending", "sent", "ambiguous", "permanent_failure"],
    }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    remoteMessageId: text("remote_message_id"),
    lastErrorCode: text("last_error_code"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("deliveries_scope_idx").on(table.scopeUserId, table.createdAt),
    check("deliveries_kind_ck", sql`${table.kind} IN ('telegram_reply')`),
    check(
      "deliveries_status_ck",
      sql`${table.status} IN ('pending', 'sending', 'sent', 'ambiguous', 'permanent_failure')`,
    ),
    check("deliveries_attempt_count_ck", sql`${table.attemptCount} >= 0`),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    scopeUserId: text("scope_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeJson: text("before_json").notNull(),
    afterJson: text("after_json").notNull(),
    correlationId: text("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("audit_log_idempotency_key_uq").on(table.idempotencyKey),
    index("audit_log_scope_idx").on(table.scopeUserId, table.createdAt),
  ],
);

export const ingressRateLimits = sqliteTable(
  "ingress_rate_limits",
  {
    bucketKey: text("bucket_key").primaryKey(),
    windowExpiresAt: integer("window_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    requestCount: integer("request_count").notNull(),
  },
  (table) => [
    check("ingress_rate_limits_count_ck", sql`${table.requestCount} > 0`),
  ],
);

export const webhookConcurrencyLeases = sqliteTable(
  "webhook_concurrency_leases",
  {
    leaseId: text("lease_id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("webhook_concurrency_expiry_idx").on(table.expiresAt)],
);
