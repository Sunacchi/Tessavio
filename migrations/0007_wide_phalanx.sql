CREATE TABLE `list_items` (
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
	CONSTRAINT "list_items_text_ck" CHECK(length("list_items"."text") BETWEEN 1 AND 300),
	CONSTRAINT "list_items_source_ck" CHECK("list_items"."source" IN ('manual_command')),
	CONSTRAINT "list_items_status_ck" CHECK("list_items"."status" IN ('open', 'completed', 'deleted')),
	CONSTRAINT "list_items_version_ck" CHECK("list_items"."version" > 0),
	CONSTRAINT "list_items_lifecycle_ck" CHECK(("list_items"."status" = 'open' AND "list_items"."completed_at" IS NULL AND "list_items"."deleted_at" IS NULL)
          OR ("list_items"."status" = 'completed' AND "list_items"."completed_at" IS NOT NULL AND "list_items"."deleted_at" IS NULL)
          OR ("list_items"."status" = 'deleted' AND "list_items"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_items_scope_id_uq` ON `list_items` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `list_items_scope_list_status_idx` ON `list_items` (`user_id`,`list_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `list_undo_actions` (
	`token` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`source_idempotency_key` text NOT NULL,
	`before_json` text,
	`expected_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "list_undo_entity_kind_ck" CHECK("list_undo_actions"."entity_kind" IN ('list', 'item', 'note')),
	CONSTRAINT "list_undo_version_ck" CHECK("list_undo_actions"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_undo_source_uq` ON `list_undo_actions` (`scope_user_id`,`source_idempotency_key`);--> statement-breakpoint
CREATE INDEX `list_undo_scope_expiry_idx` ON `list_undo_actions` (`scope_user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `lists` (
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
	CONSTRAINT "lists_title_ck" CHECK(length("lists"."title") BETWEEN 1 AND 100),
	CONSTRAINT "lists_source_ck" CHECK("lists"."source" IN ('manual_command')),
	CONSTRAINT "lists_status_ck" CHECK("lists"."status" IN ('active', 'deleted')),
	CONSTRAINT "lists_version_ck" CHECK("lists"."version" > 0),
	CONSTRAINT "lists_deleted_at_ck" CHECK(("lists"."status" = 'active' AND "lists"."deleted_at" IS NULL)
          OR ("lists"."status" = 'deleted' AND "lists"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lists_scope_id_uq` ON `lists` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `lists_scope_status_created_idx` ON `lists` (`user_id`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `notes` (
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
	CONSTRAINT "notes_title_ck" CHECK(length("notes"."title") BETWEEN 1 AND 100),
	CONSTRAINT "notes_body_ck" CHECK(length("notes"."body") BETWEEN 1 AND 4000),
	CONSTRAINT "notes_source_ck" CHECK("notes"."source" IN ('manual_command')),
	CONSTRAINT "notes_status_ck" CHECK("notes"."status" IN ('active', 'deleted')),
	CONSTRAINT "notes_version_ck" CHECK("notes"."version" > 0),
	CONSTRAINT "notes_deleted_at_ck" CHECK(("notes"."status" = 'active' AND "notes"."deleted_at" IS NULL)
          OR ("notes"."status" = 'deleted' AND "notes"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_scope_id_uq` ON `notes` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `notes_scope_status_created_idx` ON `notes` (`user_id`,`status`,`created_at`,`id`);