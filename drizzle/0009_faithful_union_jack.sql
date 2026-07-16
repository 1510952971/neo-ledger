CREATE TABLE `achievements` (
	`ledger_id` integer DEFAULT 1 NOT NULL,
	`code` text NOT NULL,
	`unlocked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`ledger_id`, `code`)
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ledger_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`total_amount` integer NOT NULL,
	`periods` integer NOT NULL,
	`paid_periods` integer DEFAULT 0 NOT NULL,
	`fee_amount` integer DEFAULT 0 NOT NULL,
	`account_id` integer NOT NULL,
	`start_month` text NOT NULL,
	`charge_day` integer DEFAULT 1 NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `currency` text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency` text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `installment_id` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `installment_number` integer;