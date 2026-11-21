CREATE TABLE `deleted_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`import_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deleted_imports_account_import_unique` ON `deleted_imports` (`account_id`,`import_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `starting_balance` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `balance_date` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `income` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `starting` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Existing data: mark each account's starting balance (it belongs to no
-- category and is never "to sort"), and record what the account held on
-- that day, so nothing changes for accounts that exist.
UPDATE `transactions` SET `starting` = 1, `to_sort` = 0, `category_id` = NULL
WHERE `import_id` IS NULL AND `payee` = 'Starting balance'
  AND `id` IN (SELECT min(`id`) FROM `transactions` GROUP BY `account_id`);--> statement-breakpoint
UPDATE `accounts` SET `balance_date` = coalesce(
  (SELECT `date` FROM `transactions` WHERE `transactions`.`account_id` = `accounts`.`id` AND `transactions`.`starting` = 1),
  date(`created_at`, 'unixepoch', 'localtime')
);--> statement-breakpoint
UPDATE `accounts` SET `starting_balance` = coalesce(
  (SELECT sum(`amount`) FROM `transactions`
   WHERE `transactions`.`account_id` = `accounts`.`id` AND `transactions`.`date` <= `accounts`.`balance_date`),
  0
);
