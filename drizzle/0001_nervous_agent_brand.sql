CREATE TABLE `campus_import_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	`value` real NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `campus_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_import_readings_unique` ON `campus_import_readings` (`import_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `campus_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`resource` text NOT NULL,
	`building` text NOT NULL,
	`source` text NOT NULL,
	`row_count` integer NOT NULL,
	`missing_hours` integer NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`status` text DEFAULT 'staging' NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_imports_resource_active` ON `campus_imports` (`resource`,`active`);