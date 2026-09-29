CREATE TABLE `campus_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`building` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_alerts_status_created` ON `campus_alerts` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `campus_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`change_text` text NOT NULL,
	`trend` text NOT NULL,
	`accent` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campus_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` text NOT NULL,
	`resource` text NOT NULL,
	`building` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`source` text DEFAULT 'simulated' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_readings_unique` ON `campus_readings` (`recorded_at`,`resource`,`building`);--> statement-breakpoint
CREATE INDEX `idx_readings_resource_recorded` ON `campus_readings` (`resource`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `campus_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`impact` text NOT NULL,
	`tag` text NOT NULL,
	`tone` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recommendations_status` ON `campus_recommendations` (`status`);