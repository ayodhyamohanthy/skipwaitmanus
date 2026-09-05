-- 0036: users.suspended — admin users directory + suspend enforcement.
-- Follows the hand-written operational style of 0035 (no drizzle snapshot).
-- MySQL 8.0 syntax — no IF NOT EXISTS; scripts/apply-missing-columns.mjs and
-- the boot-time schemaReconcile both apply this idempotently.
ALTER TABLE `users` ADD COLUMN `suspended` BOOLEAN NOT NULL DEFAULT false;
