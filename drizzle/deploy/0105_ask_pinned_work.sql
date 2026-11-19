-- 0105: task 13 slice A — pinned work rides along with a referral ask
-- (docs/KIT_V4_AUDIT.md `ask-pinned-work` / `pinned-work-in-asks`,
-- docs/KIT_V4_BUILD_PLAN.md section 3b row 13). Additive only: one new table,
-- no column changes to any existing table.
--
-- `askWorkItems` copies the piece as the seeker chose it at send time (title,
-- kind, source, url, order) instead of joining `workItems` on read, so editing
-- or deleting a showcase piece later never rewrites what a referrer has already
-- been shown. The count an ask can carry is the plan's existing
-- `showcase.pins` entitlement (shared/planEntitlements.ts), enforced in
-- server/db.ts, so this migration adds no new limit.
-- Deleting the ask removes its rows; deleting the showcase piece keeps the
-- history and nulls the link.

CREATE TABLE IF NOT EXISTS `askWorkItems` (
  `id` int AUTO_INCREMENT NOT NULL,
  `referralRequestId` int NOT NULL,
  `workItemId` int NULL,
  `title` varchar(160) NOT NULL,
  `kind` enum('case_study','project','article','code','other') NOT NULL DEFAULT 'other',
  `source` varchar(80) NULL,
  `url` varchar(2048) NULL,
  `position` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `askWorkItems_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `ask_work_items_request_piece_unique`(`referralRequestId`,`workItemId`),
  INDEX `ask_work_items_request_idx`(`referralRequestId`,`position`),
  CONSTRAINT `ask_work_items_request_fk` FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ask_work_items_piece_fk` FOREIGN KEY (`workItemId`) REFERENCES `workItems` (`id`) ON DELETE SET NULL
);
