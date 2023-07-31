CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`message` text NOT NULL,
	`owner_id` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`telegram_id` text NOT NULL,
	`username` text,
	`first_name` text NOT NULL,
	`last_name` text
);
--> statement-breakpoint
CREATE TABLE `users_to_notify` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apiKeyIdx` ON `api_keys` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `userIDIdx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `keywordIdx` ON `notifications` (`keyword`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegramIDIdx` ON `users` (`telegram_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `usernameIdx` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniqueIdx` ON `users_to_notify` (`notification_id`,`user_id`);