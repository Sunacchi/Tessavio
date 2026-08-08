CREATE TABLE `task_undo_actions` (
	`token` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`source_idempotency_key` text NOT NULL,
	`before_json` text,
	`expected_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_undo_version_ck" CHECK("task_undo_actions"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_undo_source_uq` ON `task_undo_actions` (`scope_user_id`,`source_idempotency_key`);--> statement-breakpoint
CREATE INDEX `task_undo_scope_expiry_idx` ON `task_undo_actions` (`scope_user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `task_undo_purge_idx` ON `task_undo_actions` (`expires_at`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`priority` text NOT NULL,
	`due_kind` text NOT NULL,
	`due_date_local` text,
	`due_at_utc` integer,
	`time_zone` text,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tasks_title_ck" CHECK(length("tasks"."title") BETWEEN 1 AND 200),
	CONSTRAINT "tasks_priority_ck" CHECK("tasks"."priority" IN ('low', 'medium', 'high')),
	CONSTRAINT "tasks_due_kind_ck" CHECK("tasks"."due_kind" IN ('none', 'date_only', 'instant')),
	CONSTRAINT "tasks_status_ck" CHECK("tasks"."status" IN ('open', 'completed')),
	CONSTRAINT "tasks_version_ck" CHECK("tasks"."version" > 0),
	CONSTRAINT "tasks_due_shape_ck" CHECK((
        "tasks"."due_kind" = 'none'
        AND "tasks"."due_date_local" IS NULL
        AND "tasks"."due_at_utc" IS NULL
        AND "tasks"."time_zone" IS NULL
      ) OR (
        "tasks"."due_kind" = 'date_only'
        AND "tasks"."due_date_local" IS NOT NULL
        AND "tasks"."due_at_utc" IS NULL
        AND "tasks"."time_zone" IS NULL
      ) OR (
        "tasks"."due_kind" = 'instant'
        AND "tasks"."due_date_local" IS NULL
        AND "tasks"."due_at_utc" IS NOT NULL
        AND "tasks"."time_zone" IS NOT NULL
      )),
	CONSTRAINT "tasks_completed_at_ck" CHECK(("tasks"."status" = 'open' AND "tasks"."completed_at" IS NULL)
          OR ("tasks"."status" = 'completed' AND "tasks"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_scope_id_uq` ON `tasks` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_scope_status_idx` ON `tasks` (`user_id`,`status`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_scope_date_idx` ON `tasks` (`user_id`,`status`,`due_date_local`);--> statement-breakpoint
CREATE INDEX `tasks_scope_instant_idx` ON `tasks` (`user_id`,`status`,`due_at_utc`);