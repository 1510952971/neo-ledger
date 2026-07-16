CREATE TABLE `app_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`theme` text DEFAULT 'cream' NOT NULL,
	`lock_enabled` integer DEFAULT false NOT NULL,
	`pin_hash` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
