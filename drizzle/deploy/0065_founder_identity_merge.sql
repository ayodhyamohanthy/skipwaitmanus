-- Founder identity merge (#89). His three addresses become one account:
-- user 6 (ayodhya@skipwait.me, canonical person 5) stays the canonical row.
--  * ayodhyarammohanthy@gmail.com (his typed login, no prod row yet) and
--    mayodhya.14.cstmtech@anits.edu.in (user 29, never linked to a person)
--    become verified email aliases of person 5, so a verified sign-in with
--    either address (WorkOS or email code) lands on user 6.
--  * user 6's contact email becomes the gmail address.
--  * user 29 and user 32 (qa-sweep-1's orphaned email-code row; its person
--    already resolves to user 31) are suspended. Their rows stay for audit.
-- Every statement is guarded on the exact prod rows seen Sep 24 02:32 IST and
-- is idempotent.
CREATE TABLE IF NOT EXISTS `canonicalEmailAliases` (
 `id` int AUTO_INCREMENT PRIMARY KEY,
 `normalizedEmail` varchar(320) NOT NULL,
 `canonicalPersonId` int NOT NULL,
 `reason` varchar(120) NULL,
 `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE INDEX `canonical_email_alias_email_unique` (`normalizedEmail`),
 INDEX `canonical_email_alias_person_idx` (`canonicalPersonId`),
 CONSTRAINT `canonical_email_alias_person_fk` FOREIGN KEY (`canonicalPersonId`) REFERENCES `canonicalPeople` (`id`) ON DELETE CASCADE
);

INSERT IGNORE INTO canonicalEmailAliases (normalizedEmail, canonicalPersonId, reason)
SELECT v.email, 5, 'founder_identity_merge_sep24' FROM (
  SELECT 'ayodhyarammohanthy@gmail.com' AS email UNION ALL SELECT 'mayodhya.14.cstmtech@anits.edu.in'
) v
WHERE EXISTS (SELECT 1 FROM canonicalPeople p WHERE p.id = 5 AND p.normalizedVerifiedEmail = 'ayodhya@skipwait.me')
  AND NOT EXISTS (SELECT 1 FROM canonicalPeople p2 WHERE p2.normalizedVerifiedEmail = v.email)
  AND NOT EXISTS (SELECT 1 FROM verifiedLoginAliases a WHERE a.normalizedVerifiedEmail = v.email);

UPDATE users SET email = 'ayodhyarammohanthy@gmail.com'
WHERE id = 6 AND openId = 'workemail_ayodhya@skipwait.me' AND canonicalPersonId = 5;

UPDATE users SET suspended = 1, sessionsValidAfter = CURRENT_TIMESTAMP
WHERE suspended = 0 AND (
  (id = 29 AND openId = 'workemail_mayodhya.14.cstmtech@anits.edu.in' AND canonicalPersonId IS NULL)
  OR (id = 32 AND openId = 'workemail_qa-sweep-1@skipwait.me' AND canonicalPersonId IS NULL)
);

INSERT INTO identityLinkAudits (canonicalPersonId, canonicalUserId, provider, action, evidence)
SELECT 5, 6, 'operator', 'operator_duplicate_merge', '{"merged":"user 29 + gmail alias into user 6","issue":89,"migration":"0065"}'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM identityLinkAudits WHERE action = 'operator_duplicate_merge' AND evidence LIKE '%"migration":"0065"%' AND canonicalUserId = 6);
INSERT INTO identityLinkAudits (canonicalPersonId, canonicalUserId, provider, action, evidence)
SELECT 1, 31, 'operator', 'operator_duplicate_merge', '{"retired":"user 32 (orphan otp row) in favor of user 31","issue":89,"migration":"0065"}'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM identityLinkAudits WHERE action = 'operator_duplicate_merge' AND evidence LIKE '%"migration":"0065"%' AND canonicalUserId = 31);
