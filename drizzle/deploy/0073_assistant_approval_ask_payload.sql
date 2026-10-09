-- Assistant-proposed asks (assistants part b). An approval can carry the ask an
-- assistant proposed; it is executed only when the owner approves it in the app.
-- Additive nullable columns only. Guarded for safe re-runs.
SET @c1 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistantApprovals' AND COLUMN_NAME = 'targetRoleUrl');
SET @d1 = IF(@c1 = 0, 'ALTER TABLE `assistantApprovals` ADD COLUMN `targetRoleUrl` TEXT NULL', 'SELECT 1');
PREPARE s1 FROM @d1;
EXECUTE s1;
DEALLOCATE PREPARE s1;
SET @c2 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistantApprovals' AND COLUMN_NAME = 'attachmentIds');
SET @d2 = IF(@c2 = 0, 'ALTER TABLE `assistantApprovals` ADD COLUMN `attachmentIds` TEXT NULL', 'SELECT 1');
PREPARE s2 FROM @d2;
EXECUTE s2;
DEALLOCATE PREPARE s2;
SET @c3 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistantApprovals' AND COLUMN_NAME = 'idempotencyKey');
SET @d3 = IF(@c3 = 0, 'ALTER TABLE `assistantApprovals` ADD COLUMN `idempotencyKey` VARCHAR(64) NULL', 'SELECT 1');
PREPARE s3 FROM @d3;
EXECUTE s3;
DEALLOCATE PREPARE s3;
SET @c4 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assistantApprovals' AND COLUMN_NAME = 'executedRequestId');
SET @d4 = IF(@c4 = 0, 'ALTER TABLE `assistantApprovals` ADD COLUMN `executedRequestId` INT NULL', 'SELECT 1');
PREPARE s4 FROM @d4;
EXECUTE s4;
DEALLOCATE PREPARE s4;
