CREATE TABLE `walk_networks` (
	`id` varchar(32) NOT NULL,
	`data` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `walk_networks_id` PRIMARY KEY(`id`)
);
