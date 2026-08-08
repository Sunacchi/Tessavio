CREATE TABLE `preference_undo_actions` (
	`token` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`source_idempotency_key` text NOT NULL,
	`before_json` text,
	`expected_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preference_undo_expected_version_ck" CHECK("preference_undo_actions"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preference_undo_source_uq` ON `preference_undo_actions` (`scope_user_id`,`source_idempotency_key`);--> statement-breakpoint
CREATE INDEX `preference_undo_scope_expiry_idx` ON `preference_undo_actions` (`scope_user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `preference_undo_purge_idx` ON `preference_undo_actions` (`expires_at`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`time_zone` text NOT NULL,
	`hour_format` text NOT NULL,
	`default_currency` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_preferences_language_ck" CHECK("user_preferences"."language" IN ('it')),
	CONSTRAINT "user_preferences_hour_format_ck" CHECK("user_preferences"."hour_format" IN ('12h', '24h')),
	CONSTRAINT "user_preferences_version_ck" CHECK("user_preferences"."version" > 0),
	CONSTRAINT "user_preferences_currency_ck" CHECK("user_preferences"."default_currency" GLOB '[A-Z][A-Z][A-Z]')
);
