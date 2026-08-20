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

/**
 * Sessione OAuth opaca: user-bound, single-use, TTL 10 minuti. OpenRouter non
 * documenta un parametro `state`, quindi il binding CSRF viaggia nel
 * `callback_url` ed è questa riga a legarlo all'utente.
 */
export const aiOauthSessions = sqliteTable(
  "ai_oauth_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: text("chat_id").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    status: text("status", { enum: ["pending", "consumed"] }).notNull(),
    correlationId: text("correlation_id").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("ai_oauth_sessions_scope_idx").on(table.userId, table.status),
    index("ai_oauth_sessions_expiry_idx").on(table.expiresAt),
    check(
      "ai_oauth_sessions_status_ck",
      sql`${table.status} IN ('pending', 'consumed')`,
    ),
  ],
);

/**
 * Credenziale BYOK cifrata con envelope encryption: la chiave in chiaro non
 * viene mai persistita e non transita da Telegram.
 */
export const aiCredentials = sqliteTable(
  "ai_credentials",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["openrouter"] }).notNull(),
    status: text("status", { enum: ["active", "revoked"] }).notNull(),
    recordVersion: integer("record_version").notNull(),
    kekVersion: integer("kek_version").notNull(),
    nonce: text("nonce").notNull(),
    wrappedDek: text("wrapped_dek").notNull(),
    ciphertext: text("ciphertext").notNull(),
    label: text("label"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    check(
      "ai_credentials_status_ck",
      sql`${table.status} IN ('active', 'revoked')`,
    ),
    check(
      "ai_credentials_provider_ck",
      sql`${table.provider} IN ('openrouter')`,
    ),
    check("ai_credentials_version_ck", sql`${table.recordVersion} > 0`),
  ],
);

/**
 * Ledger del budget: la prenotazione è atomica e precede la chiamata, il
 * consuntivo la chiude col costo reale. Tre controlli distinti restano
 * distinti: budget applicativo, hard limit del provider, costo per operazione.
 */
export const aiBudgetEntries = sqliteTable(
  "ai_budget_entries",
  {
    entryKey: text("entry_key").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    reservedMicros: integer("reserved_micros").notNull(),
    actualMicros: integer("actual_micros"),
    status: text("status", {
      enum: ["reserved", "settled", "released"],
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("ai_budget_entries_scope_day_idx").on(
      table.userId,
      table.localDate,
      table.status,
    ),
    index("ai_budget_entries_stale_idx").on(table.status, table.updatedAt),
    check(
      "ai_budget_entries_status_ck",
      sql`${table.status} IN ('reserved', 'settled', 'released')`,
    ),
    check("ai_budget_entries_reserved_ck", sql`${table.reservedMicros} >= 0`),
  ],
);
