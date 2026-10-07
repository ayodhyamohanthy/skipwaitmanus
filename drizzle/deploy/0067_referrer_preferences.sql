-- Referrer preferences (kit: /referrer-setup, pause, capacity, visibility).
-- Additive columns only. The deploy pipeline applies this file
-- (see server/schemaDeployGuard.test.ts).
ALTER TABLE `profiles` ADD COLUMN `preferAreas` TEXT NULL;
ALTER TABLE `profiles` ADD COLUMN `referrerVisibility` ENUM('anon','named') NOT NULL DEFAULT 'anon';
ALTER TABLE `profiles` ADD COLUMN `notifyNewAsk` boolean NOT NULL DEFAULT true;
ALTER TABLE `profiles` ADD COLUMN `notifyDigest` boolean NOT NULL DEFAULT false;
ALTER TABLE `profiles` ADD COLUMN `paused` boolean NOT NULL DEFAULT false;
