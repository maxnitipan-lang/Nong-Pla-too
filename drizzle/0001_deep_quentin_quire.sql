CREATE TABLE `campus_buildings` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`shortName` varchar(120) NOT NULL,
	`category` enum('วิชาการ','ปฏิบัติการ','บริการ','กิจกรรม') NOT NULL,
	`description` text NOT NULL,
	`floors` int NOT NULL,
	`latitude` varchar(32) NOT NULL,
	`longitude` varchar(32) NOT NULL,
	`floorDetails` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campus_buildings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campus_news` (
	`id` varchar(64) NOT NULL,
	`tag` varchar(80) NOT NULL,
	`title` varchar(255) NOT NULL,
	`excerpt` text NOT NULL,
	`dateLabel` varchar(80) NOT NULL,
	`timeLabel` varchar(120) NOT NULL,
	`accent` varchar(20) NOT NULL,
	`published` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campus_news_id` PRIMARY KEY(`id`)
);
