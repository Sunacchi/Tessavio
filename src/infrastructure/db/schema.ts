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
