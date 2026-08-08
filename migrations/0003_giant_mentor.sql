CREATE TABLE `notification_deliveries` (
	`dedupe_key` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`reminder_id` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`remote_message_id` text,
	`last_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_deliveries_status_ck" CHECK("notification_deliveries"."status" IN ('pending', 'sending', 'sent', 'ambiguous', 'permanent_failure')),
	CONSTRAINT "notification_deliveries_attempt_ck" CHECK("notification_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_reminder_uq` ON `notification_deliveries` (`scope_user_id`,`reminder_id`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_scope_idx` ON `notification_deliveries` (`scope_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reminder_undo_actions` (
	`token` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`reminder_id` text NOT NULL,
	`source_idempotency_key` text NOT NULL,
	`before_json` text,
	`expected_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reminder_undo_version_ck" CHECK("reminder_undo_actions"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_undo_source_uq` ON `reminder_undo_actions` (`scope_user_id`,`source_idempotency_key`);--> statement-breakpoint
CREATE INDEX `reminder_undo_scope_expiry_idx` ON `reminder_undo_actions` (`scope_user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`text` text NOT NULL,
	`requested_at_utc` integer NOT NULL,
	`due_at_utc` integer NOT NULL,
	`original_time_zone` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`claim_job_id` text,
	`claim_correlation_id` text,
	`claimed_at` integer,
	`claim_expires_at` integer,
	`enqueued_at` integer,
	`delivery_preference_version` integer,
	`delivery_quiet_start_minute` integer,
	`delivery_quiet_end_minute` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`sent_at` integer,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reminders_text_ck" CHECK(length("reminders"."text") BETWEEN 1 AND 200),
	CONSTRAINT "reminders_status_ck" CHECK("reminders"."status" IN ('pending', 'claimed', 'sending', 'sent', 'cancelled', 'permanent_failure', 'ambiguous')),
	CONSTRAINT "reminders_version_ck" CHECK("reminders"."version" > 0),
	CONSTRAINT "reminders_attempt_ck" CHECK("reminders"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_scope_id_uq` ON `reminders` (`user_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_claim_job_uq` ON `reminders` (`claim_job_id`);--> statement-breakpoint
CREATE INDEX `reminders_due_claim_idx` ON `reminders` (`status`,`due_at_utc`);--> statement-breakpoint
CREATE INDEX `reminders_scope_list_idx` ON `reminders` (`user_id`,`status`,`due_at_utc`);--> statement-breakpoint
CREATE INDEX `reminders_recovery_idx` ON `reminders` (`status`,`enqueued_at`,`claim_expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`time_zone` text NOT NULL,
	`hour_format` text NOT NULL,
	`default_currency` text NOT NULL,
	`quiet_hours_start_minute` integer,
	`quiet_hours_end_minute` integer,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_preferences_language_ck" CHECK("__new_user_preferences"."language" IN ('it')),
	CONSTRAINT "user_preferences_hour_format_ck" CHECK("__new_user_preferences"."hour_format" IN ('12h', '24h')),
	CONSTRAINT "user_preferences_version_ck" CHECK("__new_user_preferences"."version" > 0),
	CONSTRAINT "user_preferences_currency_ck" CHECK("__new_user_preferences"."default_currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "user_preferences_quiet_hours_ck" CHECK(("__new_user_preferences"."quiet_hours_start_minute" IS NULL AND "__new_user_preferences"."quiet_hours_end_minute" IS NULL)
          OR ("__new_user_preferences"."quiet_hours_start_minute" BETWEEN 0 AND 1439
              AND "__new_user_preferences"."quiet_hours_end_minute" BETWEEN 0 AND 1439
              AND "__new_user_preferences"."quiet_hours_start_minute" <> "__new_user_preferences"."quiet_hours_end_minute"))
);
--> statement-breakpoint
INSERT INTO `__new_user_preferences`("user_id", "language", "time_zone", "hour_format", "default_currency", "quiet_hours_start_minute", "quiet_hours_end_minute", "version", "last_mutation_key", "created_at", "updated_at") SELECT "user_id", "language", "time_zone", "hour_format", "default_currency", NULL, NULL, "version", "last_mutation_key", "created_at", "updated_at" FROM `user_preferences`;--> statement-breakpoint
DROP TABLE `user_preferences`;--> statement-breakpoint
ALTER TABLE `__new_user_preferences` RENAME TO `user_preferences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
