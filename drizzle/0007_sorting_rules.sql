CREATE TABLE `sorting_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`category_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `rule_id` integer REFERENCES sorting_rules(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `transactions_rule_idx` ON `transactions` (`rule_id`) WHERE "transactions"."rule_id" IS NOT NULL;