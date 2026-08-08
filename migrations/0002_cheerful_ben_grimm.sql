CREATE TABLE `event_undo_actions` (
	`token` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`source_idempotency_key` text NOT NULL,
	`before_json` text,
	`expected_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_undo_version_ck" CHECK("event_undo_actions"."expected_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_undo_source_uq` ON `event_undo_actions` (`scope_user_id`,`source_idempotency_key`);--> statement-breakpoint
CREATE INDEX `event_undo_scope_expiry_idx` ON `event_undo_actions` (`scope_user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `event_undo_purge_idx` ON `event_undo_actions` (`expires_at`,`consumed_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_kind` text NOT NULL,
	`title` text NOT NULL,
	`local_date` text,
	`start_at_utc` integer,
	`end_at_utc` integer,
	`time_zone` text,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`last_mutation_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`cancelled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "events_kind_ck" CHECK("events"."event_kind" IN ('date_only', 'instant')),
	CONSTRAINT "events_title_ck" CHECK(length("events"."title") BETWEEN 1 AND 200),
	CONSTRAINT "events_status_ck" CHECK("events"."status" IN ('active', 'cancelled')),
	CONSTRAINT "events_version_ck" CHECK("events"."version" > 0),
	CONSTRAINT "events_shape_ck" CHECK((
        "events"."event_kind" = 'date_only'
        AND "events"."local_date" IS NOT NULL
        AND "events"."start_at_utc" IS NULL
        AND "events"."end_at_utc" IS NULL
        AND "events"."time_zone" IS NULL
      ) OR (
        "events"."event_kind" = 'instant'
        AND "events"."local_date" IS NULL
        AND "events"."start_at_utc" IS NOT NULL
        AND "events"."end_at_utc" IS NOT NULL
        AND "events"."start_at_utc" < "events"."end_at_utc"
        AND "events"."time_zone" IS NOT NULL
      )),
	CONSTRAINT "events_cancelled_at_ck" CHECK(("events"."status" = 'active' AND "events"."cancelled_at" IS NULL)
          OR ("events"."status" = 'cancelled' AND "events"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_scope_id_uq` ON `events` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `events_scope_date_idx` ON `events` (`user_id`,`status`,`local_date`);--> statement-breakpoint
CREATE INDEX `events_scope_instant_idx` ON `events` (`user_id`,`status`,`start_at_utc`,`end_at_utc`);