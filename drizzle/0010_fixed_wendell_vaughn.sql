CREATE TABLE `side_hustle_deductions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ledger_id` integer DEFAULT 1 NOT NULL,
	`transaction_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`note` text DEFAULT '副业经营成本' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `is_side_hustle` integer DEFAULT false NOT NULL;