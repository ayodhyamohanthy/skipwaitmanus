-- 0099: D-115 plan family (main, Oct 21) - aiToolCallLogs records one row per
-- AI tool call (tool, model, tokens in/out, cost micro-USD, plan) so benefit
-- caps can be set from real cost before pricing go-live. Additive only; the
-- information_schema guard makes re-runs no-ops.

SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aiToolCallLogs');
SET @ddl = IF(@tbl_exists = 0, 'CREATE TABLE IF NOT EXISTS `aiToolCallLogs` (`id` int AUTO_INCREMENT NOT NULL, `tool` varchar(64) NOT NULL, `model` varchar(128) NOT NULL, `tokensIn` int NOT NULL, `tokensOut` int NOT NULL, `costUsdMicros` bigint NULL, `planFamilyId` varchar(32) NULL, `userId` int NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT `aiToolCallLogs_id` PRIMARY KEY(`id`), INDEX `ai_tool_call_log_tool_idx`(`tool`,`createdAt`))', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
