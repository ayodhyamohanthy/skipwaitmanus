-- Seeker saved alerts (kit: /alerts Saved alerts tab).
-- Additive only. Watchers notify once when a verified referrer joins the
-- watched company. The deploy pipeline applies this file
-- (see server/schemaDeployGuard.test.ts).
CREATE TABLE IF NOT EXISTS `seekerAlerts` (
 `id` int AUTO_INCREMENT,
 `userId` int NOT NULL,
 `companyDomain` varchar(255) NOT NULL,
 `paused` boolean NOT NULL DEFAULT false,
 `notifiedAt` timestamp NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT `seekerAlerts_id` PRIMARY KEY(`id`),
 CONSTRAINT `seeker_alerts_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
 UNIQUE INDEX `seeker_alerts_user_domain_unique`(`userId`,`companyDomain`),
 INDEX `seeker_alerts_user_idx`(`userId`),
 INDEX `seeker_alerts_domain_idx`(`companyDomain`)
);
