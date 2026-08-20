CREATE TABLE `ai_proposal_confirmations` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`proposal_index` integer NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `ai_proposal_jobs`(`job_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_proposal_confirmations_status_ck" CHECK("ai_proposal_confirmations"."status" IN ('pending', 'used')),
	CONSTRAINT "ai_proposal_confirmations_index_ck" CHECK("ai_proposal_confirmations"."proposal_index" >= 0)
);
--> statement-breakpoint
CREATE INDEX `ai_proposal_confirmations_scope_idx` ON `ai_proposal_confirmations` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ai_proposal_confirmations_expiry_idx` ON `ai_proposal_confirmations` (`expires_at`);--> statement-breakpoint
CREATE TABLE `ai_proposal_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`schema_version` text NOT NULL,
	`policy_version` text NOT NULL,
	`model` text NOT NULL,
	`plan_json` text,
	`reply_text` text,
	`failure_code` text,
	`lease_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_proposal_jobs_status_ck" CHECK("ai_proposal_jobs"."status" IN ('claimed', 'planned', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_proposal_jobs_scope_job_uq` ON `ai_proposal_jobs` (`user_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `ai_proposal_jobs_expiry_idx` ON `ai_proposal_jobs` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_effects` (
	`effect_key` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "effects_kind_ck" CHECK("__new_effects"."kind" IN ('onboarding_start', 'ai_execution')),
	CONSTRAINT "effects_status_ck" CHECK("__new_effects"."status" IN ('claimed', 'completed'))
);
--> statement-breakpoint
INSERT INTO `__new_effects`("effect_key", "scope_user_id", "job_id", "kind", "status", "created_at", "completed_at") SELECT "effect_key", "scope_user_id", "job_id", "kind", "status", "created_at", "completed_at" FROM `effects`;--> statement-breakpoint
DROP TABLE `effects`;--> statement-breakpoint
ALTER TABLE `__new_effects` RENAME TO `effects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `effects_scope_idx` ON `effects` (`scope_user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `events` ADD `provenance` text DEFAULT 'entered' NOT NULL;--> statement-breakpoint
ALTER TABLE `reminders` ADD `provenance` text DEFAULT 'entered' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `provenance` text DEFAULT 'entered' NOT NULL;