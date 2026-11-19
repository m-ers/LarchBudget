ALTER TABLE `accounts` ADD `import_mapping` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `to_sort` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch` text;--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_to_sort_idx` ON `transactions` (`date`) WHERE "transactions"."to_sort" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_account_import_unique` ON `transactions` (`account_id`,`import_id`);