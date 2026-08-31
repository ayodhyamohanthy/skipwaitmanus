CREATE TABLE IF NOT EXISTS `documentBlobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fileKey` varchar(512) NOT NULL UNIQUE,
  `data` longblob NOT NULL,
  `sizeBytes` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (`id`)
);
