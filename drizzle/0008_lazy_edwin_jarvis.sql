CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ledger_id` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '👤' NOT NULL,
	`is_me` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `paid_by_member_id` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `split_with_member_id` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `split_mode` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `my_share_percent` integer DEFAULT 100 NOT NULL;