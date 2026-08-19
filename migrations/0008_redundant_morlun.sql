CREATE TABLE `reminder_recurrence_occurrences` (
	`reminder_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recurrence_id` text NOT NULL,
	`scheduled_local` text NOT NULL,
	`due_at_utc` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`recurrence_id`) REFERENCES `reminder_recurrences`(`user_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`,`reminder_id`) REFERENCES `reminders`(`user_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reminder_occurrences_source_ck" CHECK("reminder_recurrence_occurrences"."source" IN ('calculated_recurrence'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_occurrences_scope_slot_uq` ON `reminder_recurrence_occurrences` (`user_id`,`recurrence_id`,`scheduled_local`);--> statement-breakpoint
CREATE INDEX `reminder_occurrences_scope_recurrence_idx` ON `reminder_recurrence_occurrences` (`user_id`,`recurrence_id`,`due_at_utc`);--> statement-breakpoint
CREATE TABLE `reminder_recurrence_undo_actions` (
	`token` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`recurrence_id` text NOT NULL,
	`source_idempotency_key` text NOT NULL,
	`before_json` text,
	`expected_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reminder_recurrence_undo_version_ck" CHECK("reminder_recurrence_undo_actions"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_recurrence_undo_source_uq` ON `reminder_recurrence_undo_actions` (`scope_user_id`,`source_idempotency_key`);--> statement-breakpoint
CREATE INDEX `reminder_recurrence_undo_scope_expiry_idx` ON `reminder_recurrence_undo_actions` (`scope_user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `reminder_recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`text` text NOT NULL,
	`frequency` text NOT NULL,
	`local_time` text NOT NULL,
	`time_zone` text NOT NULL,
	`next_local_date` text NOT NULL,
	`next_due_at_utc` integer NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`last_generation_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`cancelled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reminder_recurrences_text_ck" CHECK(length("reminder_recurrences"."text") BETWEEN 1 AND 200),
	CONSTRAINT "reminder_recurrences_frequency_ck" CHECK("reminder_recurrences"."frequency" IN ('daily', 'weekly')),
	CONSTRAINT "reminder_recurrences_status_ck" CHECK("reminder_recurrences"."status" IN ('active', 'cancelled')),
	CONSTRAINT "reminder_recurrences_version_ck" CHECK("reminder_recurrences"."version" > 0),
	CONSTRAINT "reminder_recurrences_lifecycle_ck" CHECK(("reminder_recurrences"."status" = 'active' AND "reminder_recurrences"."cancelled_at" IS NULL)
          OR ("reminder_recurrences"."status" = 'cancelled' AND "reminder_recurrences"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_recurrences_scope_id_uq` ON `reminder_recurrences` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `reminder_recurrences_due_idx` ON `reminder_recurrences` (`status`,`next_due_at_utc`,`id`);--> statement-breakpoint
CREATE INDEX `reminder_recurrences_scope_list_idx` ON `reminder_recurrences` (`user_id`,`status`,`next_due_at_utc`,`id`);