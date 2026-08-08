CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`correlation_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_idempotency_key_uq` ON `audit_log` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `audit_log_scope_idx` ON `audit_log` (`scope_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`delivery_key` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`remote_message_id` text,
	`last_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "deliveries_kind_ck" CHECK("deliveries"."kind" IN ('telegram_reply')),
	CONSTRAINT "deliveries_status_ck" CHECK("deliveries"."status" IN ('pending', 'sending', 'sent', 'ambiguous', 'permanent_failure')),
	CONSTRAINT "deliveries_attempt_count_ck" CHECK("deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `deliveries_scope_idx` ON `deliveries` (`scope_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `effects` (
	`effect_key` text PRIMARY KEY NOT NULL,
	`scope_user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`scope_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "effects_kind_ck" CHECK("effects"."kind" IN ('onboarding_start')),
	CONSTRAINT "effects_status_ck" CHECK("effects"."status" IN ('claimed', 'completed'))
);
--> statement-breakpoint
CREATE INDEX `effects_scope_idx` ON `effects` (`scope_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inbound_updates` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`envelope_json` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`lease_expires_at` integer,
	`last_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "inbound_updates_status_ck" CHECK("inbound_updates"."status" IN ('pending_enqueue', 'enqueued', 'processing', 'completed', 'completed_ambiguous', 'dead')),
	CONSTRAINT "inbound_updates_attempt_count_ck" CHECK("inbound_updates"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_updates_job_id_uq` ON `inbound_updates` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_updates_idempotency_key_uq` ON `inbound_updates` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `inbound_updates_recovery_idx` ON `inbound_updates` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ingress_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`window_expires_at` integer NOT NULL,
	`request_count` integer NOT NULL,
	CONSTRAINT "ingress_rate_limits_count_ck" CHECK("ingress_rate_limits"."request_count" > 0)
);
--> statement-breakpoint
CREATE TABLE `telegram_identities` (
	`telegram_user_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_identities_user_id_uq` ON `telegram_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "users_status_ck" CHECK("users"."status" IN ('active'))
);
--> statement-breakpoint
CREATE TABLE `webhook_concurrency_leases` (
	`lease_id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhook_concurrency_expiry_idx` ON `webhook_concurrency_leases` (`expires_at`);