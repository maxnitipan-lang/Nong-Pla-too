CREATE TABLE `site_settings` (
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `campus_buildings` ADD `accent` varchar(20) DEFAULT '#123b52' NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_buildings` ADD `mapX` int DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_buildings` ADD `mapY` int DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_buildings` ADD `mapWidth` int DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_buildings` ADD `mapHeight` int DEFAULT 17 NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_buildings` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campus_news` ADD `sortOrder` int DEFAULT 0 NOT NULL;
