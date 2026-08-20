CREATE TABLE `ai_budget_entries` (
	`entry_key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`local_date` text NOT NULL,
	`reserved_micros` integer NOT NULL,
	`actual_micros` integer,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_budget_entries_status_ck" CHECK("ai_budget_entries"."status" IN ('reserved', 'settled', 'released')),
	CONSTRAINT "ai_budget_entries_reserved_ck" CHECK("ai_budget_entries"."reserved_micros" >= 0)
);
--> statement-breakpoint
CREATE INDEX `ai_budget_entries_scope_day_idx` ON `ai_budget_entries` (`user_id`,`local_date`,`status`);--> statement-breakpoint
CREATE INDEX `ai_budget_entries_stale_idx` ON `ai_budget_entries` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ai_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`record_version` integer NOT NULL,
	`kek_version` integer NOT NULL,
	`nonce` text NOT NULL,
	`wrapped_dek` text NOT NULL,
	`ciphertext` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_credentials_status_ck" CHECK("ai_credentials"."status" IN ('active', 'revoked')),
	CONSTRAINT "ai_credentials_provider_ck" CHECK("ai_credentials"."provider" IN ('openrouter')),
	CONSTRAINT "ai_credentials_version_ck" CHECK("ai_credentials"."record_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `ai_oauth_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`code_verifier` text NOT NULL,
	`code_challenge` text NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_oauth_sessions_status_ck" CHECK("ai_oauth_sessions"."status" IN ('pending', 'consumed'))
);
--> statement-breakpoint
CREATE INDEX `ai_oauth_sessions_scope_idx` ON `ai_oauth_sessions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ai_oauth_sessions_expiry_idx` ON `ai_oauth_sessions` (`expires_at`);