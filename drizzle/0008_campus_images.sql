CREATE TABLE IF NOT EXISTS `campus_images` (
	`id` varchar(32) NOT NULL,
	`mime` varchar(40) NOT NULL,
	`data` mediumtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campus_images_id` PRIMARY KEY(`id`)
);
