import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "../schema";

/**
 * Un job AI per messaggio. Le proposte sono persistite **prima** di qualsiasi
 * esecuzione: un retry della Queue rilegge invece di richiamare il modello.
 */
export const aiProposalJobs = sqliteTable(
  "ai_proposal_jobs",
  {
    jobId: text("job_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    correlationId: text("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: ["claimed", "planned", "completed", "failed"],
    }).notNull(),
    schemaVersion: text("schema_version").notNull(),
    policyVersion: text("policy_version").notNull(),
    model: text("model").notNull(),
    planJson: text("plan_json"),
    replyText: text("reply_text"),
    failureCode: text("failure_code"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("ai_proposal_jobs_scope_job_uq").on(table.userId, table.jobId),
    index("ai_proposal_jobs_expiry_idx").on(table.expiresAt),
    check(
      "ai_proposal_jobs_status_ck",
      sql`${table.status} IN ('claimed', 'planned', 'completed', 'failed')`,
    ),
  ],
);

/**
 * Token opaco, single-use e user-bound di una preview: stesso pattern dei token
 * di Undo già in produzione.
 */
export const aiProposalConfirmations = sqliteTable(
  "ai_proposal_confirmations",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => aiProposalJobs.jobId, { onDelete: "cascade" }),
    proposalIndex: integer("proposal_index").notNull(),
    status: text("status", { enum: ["pending", "used"] }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("ai_proposal_confirmations_scope_idx").on(table.userId, table.status),
    index("ai_proposal_confirmations_expiry_idx").on(table.expiresAt),
    check(
      "ai_proposal_confirmations_status_ck",
      sql`${table.status} IN ('pending', 'used')`,
    ),
    check(
      "ai_proposal_confirmations_index_ck",
      sql`${table.proposalIndex} >= 0`,
    ),
  ],
);
