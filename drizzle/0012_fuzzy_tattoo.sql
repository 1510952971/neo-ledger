CREATE TABLE `fire_settings` (
	`ledger_id` integer PRIMARY KEY NOT NULL,
	`monthly_expense` integer DEFAULT 1200000 NOT NULL,
	`annual_return_bps` integer DEFAULT 500 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
