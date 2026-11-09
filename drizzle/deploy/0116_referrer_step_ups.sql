-- 0116: D-057-session-gate (D-245, packet docs/plans/D-057-session-gate.md
-- section 0b.3), the in-session work-email step-up. Additive only: one new
-- table, no column changes to any existing table.
--   referrerStepUps  one row per step-up challenge, which may become one proof
--   that this account, in this session, confirmed this exact work email for
--   referrer actions. Only digests are stored: the challenge id, the session
--   key and the code are SHA-256 hex; the address is the work-email HMAC
--   fingerprint (server/workEmailKey.ts), never the address itself.
-- CREATE TABLE IF NOT EXISTS makes a re-run a no-op; the deploy pipeline applies
-- the file once (scripts/apply-deploy-migrations.sh).

CREATE TABLE IF NOT EXISTS `referrerStepUps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `challengeIdHash` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `sessionKeyHash` varchar(64) NOT NULL,
  `purpose` enum('referrer_actions') NOT NULL,
  `emailFingerprint` varchar(80) NOT NULL,
  `workEmailDomain` varchar(255) NOT NULL,
  `codeHash` varchar(64) NOT NULL,
  `codeExpiresAt` timestamp NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `verifiedAt` timestamp NULL,
  `proofExpiresAt` timestamp NULL,
  `revokedAt` timestamp NULL,
  `revokedReason` enum('superseded','logout') NULL,
  `createdAt` timestamp NOT NULL,
  CONSTRAINT `referrerStepUps_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `referrer_step_ups_challenge_unique`(`challengeIdHash`),
  INDEX `referrer_step_ups_proof_idx`(`userId`,`sessionKeyHash`,`purpose`,`verifiedAt`),
  CONSTRAINT `referrer_step_ups_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
