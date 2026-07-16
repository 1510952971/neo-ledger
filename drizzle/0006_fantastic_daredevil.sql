CREATE TABLE `ledgers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '🏠' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ledger_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`target_amount` integer NOT NULL,
	`saved_amount` integer DEFAULT 0 NOT NULL,
	`deadline` text NOT NULL,
	`icon` text DEFAULT '🌟' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_category_budgets` (
	`ledger_id` integer DEFAULT 1 NOT NULL,
	`category` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`ledger_id`, `category`)
);
--> statement-breakpoint
INSERT INTO `__new_category_budgets`("ledger_id", "category", "amount", "updated_at") SELECT "ledger_id", "category", "amount", "updated_at" FROM `category_budgets`;--> statement-breakpoint
DROP TABLE `category_budgets`;--> statement-breakpoint
ALTER TABLE `__new_category_budgets` RENAME TO `category_budgets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `accounts` ADD `ledger_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `ledger_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `ledger_id` integer DEFAULT 1 NOT NULL;