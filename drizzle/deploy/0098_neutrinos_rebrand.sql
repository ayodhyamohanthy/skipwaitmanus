-- 0098: Go Neutrinos rebranded to Neutrinos (owner, Oct 21 2026). Rename the directory row, make
-- neutrinos.com the primary domain and keep goneutrinos.com as an alias so existing verified
-- referrers and links keep working. Slug stays go-neutrinos (URLs unchanged). Idempotent and
-- non-destructive: each statement is a no-op once applied.
UPDATE `companies` SET `name` = 'Neutrinos', `initials` = 'N' WHERE `slug` = 'go-neutrinos' AND `name` = 'Go Neutrinos';
INSERT INTO `companyDomains` (`companyId`, `domain`, `isPrimary`)
  SELECT c.id, 'neutrinos.com', 0 FROM `companies` c
  WHERE c.slug = 'go-neutrinos' AND NOT EXISTS (SELECT 1 FROM `companyDomains` d WHERE d.domain = 'neutrinos.com');
UPDATE `companyDomains` d JOIN `companies` c ON c.id = d.companyId
  SET d.isPrimary = (d.domain = 'neutrinos.com')
  WHERE c.slug = 'go-neutrinos' AND d.domain IN ('neutrinos.com', 'goneutrinos.com');
