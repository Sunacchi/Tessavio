PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_finance_entries` (
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
	CONSTRAINT "finance_entries_kind_ck" CHECK("__new_finance_entries"."entry_kind" IN ('expense', 'income')),
	CONSTRAINT "finance_entries_amount_ck" CHECK("__new_finance_entries"."amount_minor" BETWEEN 1 AND 2147483647),
	CONSTRAINT "finance_entries_currency_ck" CHECK("__new_finance_entries"."currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "finance_entries_date_ck" CHECK(length("__new_finance_entries"."local_date") = 10 AND "__new_finance_entries"."local_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "finance_entries_category_ck" CHECK(length("__new_finance_entries"."category") BETWEEN 1 AND 100),
	CONSTRAINT "finance_entries_merchant_ck" CHECK("__new_finance_entries"."merchant" IS NULL OR length("__new_finance_entries"."merchant") BETWEEN 1 AND 200),
	CONSTRAINT "finance_entries_payment_method_ck" CHECK("__new_finance_entries"."payment_method" IS NULL OR length("__new_finance_entries"."payment_method") BETWEEN 1 AND 100),
	CONSTRAINT "finance_entries_note_ck" CHECK("__new_finance_entries"."note" IS NULL OR length("__new_finance_entries"."note") BETWEEN 1 AND 500),
	CONSTRAINT "finance_entries_source_ck" CHECK("__new_finance_entries"."source" IN ('manual_command', 'ai_proposal')),
	CONSTRAINT "finance_entries_status_ck" CHECK("__new_finance_entries"."status" IN ('active', 'deleted')),
	CONSTRAINT "finance_entries_version_ck" CHECK("__new_finance_entries"."version" > 0),
	CONSTRAINT "finance_entries_deleted_at_ck" CHECK(("__new_finance_entries"."status" = 'active' AND "__new_finance_entries"."deleted_at" IS NULL)
          OR ("__new_finance_entries"."status" = 'deleted' AND "__new_finance_entries"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_finance_entries`("id", "user_id", "entry_kind", "amount_minor", "currency", "local_date", "category", "merchant", "payment_method", "note", "source", "status", "version", "last_mutation_key", "created_at", "updated_at", "deleted_at") SELECT "id", "user_id", "entry_kind", "amount_minor", "currency", "local_date", "category", "merchant", "payment_method", "note", "source", "status", "version", "last_mutation_key", "created_at", "updated_at", "deleted_at" FROM `finance_entries`;--> statement-breakpoint
DROP TABLE `finance_entries`;--> statement-breakpoint
ALTER TABLE `__new_finance_entries` RENAME TO `finance_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `finance_entries_scope_id_uq` ON `finance_entries` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `finance_entries_scope_date_idx` ON `finance_entries` (`user_id`,`status`,`local_date`,`currency`,`entry_kind`,`id`);--> statement-breakpoint
CREATE TABLE `__new_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`list_id` text NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`list_id`) REFERENCES `lists`(`user_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "list_items_text_ck" CHECK(length("__new_list_items"."text") BETWEEN 1 AND 300),
	CONSTRAINT "list_items_source_ck" CHECK("__new_list_items"."source" IN ('manual_command', 'ai_proposal')),
	CONSTRAINT "list_items_status_ck" CHECK("__new_list_items"."status" IN ('open', 'completed', 'deleted')),
	CONSTRAINT "list_items_version_ck" CHECK("__new_list_items"."version" > 0),
	CONSTRAINT "list_items_lifecycle_ck" CHECK(("__new_list_items"."status" = 'open' AND "__new_list_items"."completed_at" IS NULL AND "__new_list_items"."deleted_at" IS NULL)
          OR ("__new_list_items"."status" = 'completed' AND "__new_list_items"."completed_at" IS NOT NULL AND "__new_list_items"."deleted_at" IS NULL)
          OR ("__new_list_items"."status" = 'deleted' AND "__new_list_items"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_list_items`("id", "user_id", "list_id", "text", "source", "status", "version", "last_mutation_key", "created_at", "updated_at", "completed_at", "deleted_at") SELECT "id", "user_id", "list_id", "text", "source", "status", "version", "last_mutation_key", "created_at", "updated_at", "completed_at", "deleted_at" FROM `list_items`;--> statement-breakpoint
DROP TABLE `list_items`;--> statement-breakpoint
ALTER TABLE `__new_list_items` RENAME TO `list_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `list_items_scope_id_uq` ON `list_items` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `list_items_scope_list_status_idx` ON `list_items` (`user_id`,`list_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `__new_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lists_title_ck" CHECK(length("__new_lists"."title") BETWEEN 1 AND 100),
	CONSTRAINT "lists_source_ck" CHECK("__new_lists"."source" IN ('manual_command', 'ai_proposal')),
	CONSTRAINT "lists_status_ck" CHECK("__new_lists"."status" IN ('active', 'deleted')),
	CONSTRAINT "lists_version_ck" CHECK("__new_lists"."version" > 0),
	CONSTRAINT "lists_deleted_at_ck" CHECK(("__new_lists"."status" = 'active' AND "__new_lists"."deleted_at" IS NULL)
          OR ("__new_lists"."status" = 'deleted' AND "__new_lists"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_lists`("id", "user_id", "title", "source", "status", "version", "last_mutation_key", "created_at", "updated_at", "deleted_at") SELECT "id", "user_id", "title", "source", "status", "version", "last_mutation_key", "created_at", "updated_at", "deleted_at" FROM `lists`;--> statement-breakpoint
DROP TABLE `lists`;--> statement-breakpoint
ALTER TABLE `__new_lists` RENAME TO `lists`;--> statement-breakpoint
CREATE UNIQUE INDEX `lists_scope_id_uq` ON `lists` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `lists_scope_status_created_idx` ON `lists` (`user_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notes_title_ck" CHECK(length("__new_notes"."title") BETWEEN 1 AND 100),
	CONSTRAINT "notes_body_ck" CHECK(length("__new_notes"."body") BETWEEN 1 AND 4000),
	CONSTRAINT "notes_source_ck" CHECK("__new_notes"."source" IN ('manual_command', 'ai_proposal')),
	CONSTRAINT "notes_status_ck" CHECK("__new_notes"."status" IN ('active', 'deleted')),
	CONSTRAINT "notes_version_ck" CHECK("__new_notes"."version" > 0),
	CONSTRAINT "notes_deleted_at_ck" CHECK(("__new_notes"."status" = 'active' AND "__new_notes"."deleted_at" IS NULL)
          OR ("__new_notes"."status" = 'deleted' AND "__new_notes"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_notes`("id", "user_id", "title", "body", "source", "status", "version", "last_mutation_key", "created_at", "updated_at", "deleted_at") SELECT "id", "user_id", "title", "body", "source", "status", "version", "last_mutation_key", "created_at", "updated_at", "deleted_at" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;--> statement-breakpoint
CREATE UNIQUE INDEX `notes_scope_id_uq` ON `notes` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `notes_scope_status_created_idx` ON `notes` (`user_id`,`status`,`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `planned_shifts` ADD `provenance` text DEFAULT 'entered' NOT NULL;