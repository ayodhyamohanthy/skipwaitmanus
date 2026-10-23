-- 0106: D-132 audit item 2 - the level and credit cost an ask was priced at is
-- stored once at creation. Additive only: one new table, no change to any
-- existing table or row. Rows are written only while ASK_LEVEL_COST is on, so
-- with the flag off the table stays empty and every ask keeps the flat 1 credit.
CREATE TABLE IF NOT EXISTS `askCosts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `referralRequestId` int NOT NULL,
  `jobLevel` int NOT NULL,
  `creditCost` int NOT NULL,
  `source` varchar(40) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `askCosts_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `ask_costs_request_unique`(`referralRequestId`),
  CONSTRAINT `ask_costs_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE
);
