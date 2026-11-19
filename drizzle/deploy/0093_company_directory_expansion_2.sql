-- 0093: directory expansion batch 2. Additive, idempotent: rows skipped when the slug
-- (or domain) already exists. Same rows as DIRECTORY_EXPANSION_SEED_2 in
-- shared/companyDirectoryExpansionSeed.ts (server/companyDirectoryExpansionContract.test.ts).
SET NAMES utf8mb4;

INSERT INTO `companies` (`slug`, `name`, `initials`, `industry`, `location`, `functions`, `blurb`, `status`, `sortOrder`)
SELECT v.slug, v.name, v.initials, v.industry, v.location, v.functions, v.blurb, 'listed', v.sortOrder FROM (
  SELECT 'capco' AS slug, 'Capco' AS name, 'C' AS initials, 'Consulting and technology services' AS industry, 'Global' AS location, '["Consulting","Technology","Operations"]' AS functions, 'Find a warmer path into Capco through verified employees.' AS blurb, 280 AS sortOrder
  UNION ALL SELECT 'blackstone', 'Blackstone', 'B', 'Investment management', 'Global', '["Finance","Technology","Operations"]', 'Find a warmer path into Blackstone through verified employees.', 290
  UNION ALL SELECT 'citiustech', 'CitiusTech', 'CT', 'Healthcare technology services', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into CitiusTech through verified employees.', 300
  UNION ALL SELECT 'ibm', 'IBM', 'IBM', 'Technology and consulting', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into IBM through verified employees.', 310
  UNION ALL SELECT 'bnp-paribas', 'BNP Paribas', 'BNP', 'Banking and financial services', 'Global', '["Finance","Technology","Operations"]', 'Find a warmer path into BNP Paribas through verified employees.', 320
  UNION ALL SELECT 'servicenow', 'ServiceNow', 'SN', 'Workflow software', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into ServiceNow through verified employees.', 330
  UNION ALL SELECT 'iqvia', 'IQVIA', 'IQ', 'Life sciences data and services', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into IQVIA through verified employees.', 340
  UNION ALL SELECT 'maersk', 'Maersk', 'M', 'Shipping and logistics', 'Global', '["Operations","Technology","Logistics"]', 'Find a warmer path into Maersk through verified employees.', 350
  UNION ALL SELECT 'ford', 'Ford', 'F', 'Automotive', 'Global', '["Engineering","Manufacturing","Operations"]', 'Find a warmer path into Ford through verified employees.', 360
  UNION ALL SELECT 'concentrix', 'Concentrix', 'C', 'Customer experience services', 'Global', '["Operations","Technology","Customer service"]', 'Find a warmer path into Concentrix through verified employees.', 370
  UNION ALL SELECT 'societe-generale', 'Societe Generale', 'SG', 'Banking and financial services', 'Global', '["Finance","Technology","Operations"]', 'Find a warmer path into Societe Generale through verified employees.', 380
  UNION ALL SELECT 'nintendo', 'Nintendo', 'N', 'Games and entertainment', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into Nintendo through verified employees.', 390
) v
WHERE NOT EXISTS (SELECT 1 FROM `companies` c WHERE c.slug = v.slug);

INSERT INTO `companyDomains` (`companyId`, `domain`, `isPrimary`)
SELECT c.id, v.domain, true FROM (
  SELECT 'capco' AS slug, 'capco.com' AS domain
  UNION ALL SELECT 'blackstone', 'blackstone.com'
  UNION ALL SELECT 'citiustech', 'citiustech.com'
  UNION ALL SELECT 'ibm', 'ibm.com'
  UNION ALL SELECT 'bnp-paribas', 'bnpparibas.com'
  UNION ALL SELECT 'servicenow', 'servicenow.com'
  UNION ALL SELECT 'iqvia', 'iqvia.com'
  UNION ALL SELECT 'maersk', 'maersk.com'
  UNION ALL SELECT 'ford', 'ford.com'
  UNION ALL SELECT 'concentrix', 'concentrix.com'
  UNION ALL SELECT 'societe-generale', 'societegenerale.com'
  UNION ALL SELECT 'nintendo', 'nintendo.com'
) v
INNER JOIN `companies` c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM `companyDomains` d WHERE d.domain = v.domain);
