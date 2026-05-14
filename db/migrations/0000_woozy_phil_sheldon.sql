CREATE TABLE `bets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`bet_type` text NOT NULL,
	`deadline` text NOT NULL,
	`voting_deadline` text,
	`settlement_mode` text,
	`entry_fee` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`winning_outcome_id` integer,
	`winning_prop_answer` text,
	`winning_submission_id` integer,
	`is_boosted` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`settled_at` text,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winning_outcome_id`) REFERENCES `outcomes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winning_submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bets_status_idx` ON `bets` (`status`);--> statement-breakpoint
CREATE INDEX `bets_deadline_idx` ON `bets` (`deadline`);--> statement-breakpoint
CREATE TABLE `gif_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bet_id` integer NOT NULL,
	`voter_user_id` integer NOT NULL,
	`submission_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`bet_id`) REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gif_votes_bet_user_idx` ON `gif_votes` (`bet_id`,`voter_user_id`);--> statement-breakpoint
CREATE TABLE `outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bet_id` integer NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bet_id`) REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settlement_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bet_id` integer NOT NULL,
	`voter_user_id` integer NOT NULL,
	`outcome_id` integer,
	`prop_answer` text,
	`is_void_vote` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`bet_id`) REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outcome_id`) REFERENCES `outcomes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_votes_bet_user_idx` ON `settlement_votes` (`bet_id`,`voter_user_id`);--> statement-breakpoint
CREATE TABLE `stipend_log` (
	`user_id` integer NOT NULL,
	`iso_week` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `iso_week`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bet_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`gif_url` text NOT NULL,
	`caption` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`bet_id`) REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_bet_user_idx` ON `submissions` (`bet_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`bet_id` integer,
	`amount` integer NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bet_id`) REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE TABLE `wagers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bet_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`outcome_id` integer,
	`prop_answer` text,
	`stake` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`bet_id`) REFERENCES `bets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outcome_id`) REFERENCES `outcomes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wagers_bet_user_idx` ON `wagers` (`bet_id`,`user_id`);