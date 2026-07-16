CREATE TABLE `pending_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ledger_id` integer DEFAULT 1 NOT NULL,
	`raw_text` text NOT NULL,
	`title` text NOT NULL,
	`amount` integer NOT NULL,
	`type` text NOT NULL,
	`account_id` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`occurred_at` text NOT NULL,
	`status` text DEFAULT '待确认' NOT NULL,
	`balance_applied` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `system_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ledger_id` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `asset_class` text DEFAULT '现金流' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `offline_id` text;