CREATE TABLE `crdt_tombstones` (
	`crdt_id` text PRIMARY KEY NOT NULL,
	`ledger_id` integer NOT NULL,
	`deleted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `economic_settings` (
	`ledger_id` integer PRIMARY KEY NOT NULL,
	`inflation_bps` integer DEFAULT 250 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `peer_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room` text NOT NULL,
	`from_node` text NOT NULL,
	`to_node` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `crdt_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;