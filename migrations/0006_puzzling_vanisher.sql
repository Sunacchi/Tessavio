CREATE TABLE `finance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`local_date` text NOT NULL,
	`category` text NOT NULL,
	`merchant` text,
	`payment_method` text,
	`note` text,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "finance_entries_kind_ck" CHECK("finance_entries"."entry_kind" IN ('expense', 'income')),
	CONSTRAINT "finance_entries_amount_ck" CHECK("finance_entries"."amount_minor" BETWEEN 1 AND 2147483647),
	CONSTRAINT "finance_entries_currency_ck" CHECK("finance_entries"."currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "finance_entries_date_ck" CHECK(length("finance_entries"."local_date") = 10 AND "finance_entries"."local_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "finance_entries_category_ck" CHECK(length("finance_entries"."category") BETWEEN 1 AND 100),
	CONSTRAINT "finance_entries_merchant_ck" CHECK("finance_entries"."merchant" IS NULL OR length("finance_entries"."merchant") BETWEEN 1 AND 200),
	CONSTRAINT "finance_entries_payment_method_ck" CHECK("finance_entries"."payment_method" IS NULL OR length("finance_entries"."payment_method") BETWEEN 1 AND 100),
	CONSTRAINT "finance_entries_note_ck" CHECK("finance_entries"."note" IS NULL OR length("finance_entries"."note") BETWEEN 1 AND 500),
	CONSTRAINT "finance_entries_source_ck" CHECK("finance_entries"."source" IN ('manual_command')),
	CONSTRAINT "finance_entries_status_ck" CHECK("finance_entries"."status" IN ('active', 'deleted')),
	CONSTRAINT "finance_entries_version_ck" CHECK("finance_entries"."version" > 0),
	CONSTRAINT "finance_entries_deleted_at_ck" CHECK(("finance_entries"."status" = 'active' AND "finance_entries"."deleted_at" IS NULL)
          OR ("finance_entries"."status" = 'deleted' AND "finance_entries"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_entries_scope_id_uq` ON `finance_entries` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `finance_entries_scope_date_idx` ON `finance_entries` (`user_id`,`status`,`local_date`,`currency`,`entry_kind`,`id`);--> statement-breakpoint
CREATE TABLE `finance_undo_actions` (
	`token` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`source_idempotency_key` text NOT NULL,
	`before_json` text,
	`expected_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "finance_undo_version_ck" CHECK("finance_undo_actions"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_undo_source_uq` ON `finance_undo_actions` (`scope_user_id`,`source_idempotency_key`);--> statement-breakpoint
CREATE INDEX `finance_undo_scope_expiry_idx` ON `finance_undo_actions` (`scope_user_id`,`expires_at`);