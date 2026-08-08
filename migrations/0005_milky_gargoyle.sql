CREATE TABLE `planned_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`start_at_utc` integer NOT NULL,
	`end_at_utc` integer NOT NULL,
	`original_time_zone` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "planned_shifts_title_ck" CHECK(length("planned_shifts"."title") BETWEEN 1 AND 200),
	CONSTRAINT "planned_shifts_interval_ck" CHECK("planned_shifts"."end_at_utc" > "planned_shifts"."start_at_utc" AND "planned_shifts"."end_at_utc" - "planned_shifts"."start_at_utc" <= 172800000),
	CONSTRAINT "planned_shifts_version_ck" CHECK("planned_shifts"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_shifts_scope_id_uq` ON `planned_shifts` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `planned_shifts_scope_time_idx` ON `planned_shifts` (`user_id`,`start_at_utc`,`end_at_utc`);--> statement-breakpoint
CREATE TABLE `work_breaks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`work_log_id` text NOT NULL,
	`start_at_utc` integer NOT NULL,
	`end_at_utc` integer NOT NULL,
	`original_time_zone` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`work_log_id`) REFERENCES `work_logs`(`user_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "work_breaks_interval_ck" CHECK("work_breaks"."end_at_utc" > "work_breaks"."start_at_utc" AND "work_breaks"."end_at_utc" - "work_breaks"."start_at_utc" <= 172800000),
	CONSTRAINT "work_breaks_version_ck" CHECK("work_breaks"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_breaks_scope_id_uq` ON `work_breaks` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `work_breaks_scope_log_time_idx` ON `work_breaks` (`user_id`,`work_log_id`,`start_at_utc`,`end_at_utc`);--> statement-breakpoint
CREATE TABLE `work_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`start_at_utc` integer NOT NULL,
	`end_at_utc` integer NOT NULL,
	`original_time_zone` text NOT NULL,
	`rule_id` text NOT NULL,
	`rule_version` integer NOT NULL,
	`rule_name` text NOT NULL,
	`break_treatment` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`rule_id`) REFERENCES `work_rules`(`user_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "work_logs_title_ck" CHECK(length("work_logs"."title") BETWEEN 1 AND 200),
	CONSTRAINT "work_logs_rule_name_ck" CHECK(length("work_logs"."rule_name") BETWEEN 1 AND 100),
	CONSTRAINT "work_logs_break_treatment_ck" CHECK("work_logs"."break_treatment" IN ('paid', 'unpaid')),
	CONSTRAINT "work_logs_interval_ck" CHECK("work_logs"."end_at_utc" > "work_logs"."start_at_utc" AND "work_logs"."end_at_utc" - "work_logs"."start_at_utc" <= 172800000),
	CONSTRAINT "work_logs_rule_version_ck" CHECK("work_logs"."rule_version" > 0),
	CONSTRAINT "work_logs_version_ck" CHECK("work_logs"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_logs_scope_id_uq` ON `work_logs` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `work_logs_scope_time_idx` ON `work_logs` (`user_id`,`start_at_utc`,`end_at_utc`);--> statement-breakpoint
CREATE INDEX `work_logs_scope_rule_idx` ON `work_logs` (`user_id`,`rule_id`);--> statement-breakpoint
CREATE TABLE `work_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`break_treatment` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "work_rules_name_ck" CHECK(length("work_rules"."name") BETWEEN 1 AND 100),
	CONSTRAINT "work_rules_break_treatment_ck" CHECK("work_rules"."break_treatment" IN ('paid', 'unpaid')),
	CONSTRAINT "work_rules_version_ck" CHECK("work_rules"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_rules_scope_id_uq` ON `work_rules` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `work_rules_scope_list_idx` ON `work_rules` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `work_undo_actions` (
	`token` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`source_idempotency_key` text NOT NULL,
	`expected_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "work_undo_entity_kind_ck" CHECK("work_undo_actions"."entity_kind" IN ('rule', 'shift', 'log', 'break')),
	CONSTRAINT "work_undo_version_ck" CHECK("work_undo_actions"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_undo_source_uq` ON `work_undo_actions` (`scope_user_id`,`source_idempotency_key`);--> statement-breakpoint
CREATE INDEX `work_undo_scope_expiry_idx` ON `work_undo_actions` (`scope_user_id`,`expires_at`);