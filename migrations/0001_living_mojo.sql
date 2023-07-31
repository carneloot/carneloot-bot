CREATE TABLE `notification_history` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`user_id` text NOT NULL,
	`message_id` integer NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messageIdIdx` ON `notification_history` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniqueIndex` ON `notification_history` (`notification_id`,`user_id`);