CREATE TABLE `budget_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
