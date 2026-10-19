-- 0092: directory expansion. Additive, idempotent: rows are skipped when the slug
-- (or domain) already exists, so admin edits are never overwritten. Same rows as
-- shared/companyDirectoryExpansionSeed.ts (server/companyDirectoryExpansionContract.test.ts).
SET NAMES utf8mb4;

INSERT INTO `companies` (`slug`, `name`, `initials`, `industry`, `location`, `functions`, `blurb`, `status`, `sortOrder`)
SELECT v.slug, v.name, v.initials, v.industry, v.location, v.functions, v.blurb, 'listed', v.sortOrder FROM (
  SELECT 'pinterest' AS slug, 'Pinterest' AS name, 'P' AS initials, 'Technology' AS industry, 'Global' AS location, '["Engineering","Data","Operations"]' AS functions, 'Find a warmer path into Pinterest through verified employees.' AS blurb, 60 AS sortOrder
  UNION ALL SELECT 'kpmg', 'KPMG', 'K', 'Professional services', 'Global', '["Consulting","Technology","Operations"]', 'Find a warmer path into KPMG through verified employees.', 70
  UNION ALL SELECT 'accenture', 'Accenture', 'A', 'Consulting and technology services', 'Global', '["Consulting","Technology","Operations"]', 'Find a warmer path into Accenture through verified employees.', 80
  UNION ALL SELECT 'capgemini', 'Capgemini', 'C', 'Consulting and technology services', 'Global', '["Consulting","Technology","Operations"]', 'Find a warmer path into Capgemini through verified employees.', 90
  UNION ALL SELECT 'infosys', 'Infosys', 'I', 'Technology services', 'Global', '["Consulting","Technology","Operations"]', 'Find a warmer path into Infosys through verified employees.', 100
  UNION ALL SELECT 'cognizant', 'Cognizant', 'C', 'Technology services', 'Global', '["Consulting","Technology","Operations"]', 'Find a warmer path into Cognizant through verified employees.', 110
  UNION ALL SELECT 'kraken', 'Kraken', 'K', 'Crypto and financial services', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into Kraken through verified employees.', 120
  UNION ALL SELECT 'mongodb', 'MongoDB', 'M', 'Data platform software', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into MongoDB through verified employees.', 130
  UNION ALL SELECT 'korn-ferry', 'Korn Ferry', 'KF', 'Consulting', 'Global', '["Consulting","Operations","Data"]', 'Find a warmer path into Korn Ferry through verified employees.', 140
  UNION ALL SELECT 'snowflake', 'Snowflake', 'S', 'Data cloud software', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into Snowflake through verified employees.', 150
  UNION ALL SELECT 'blackrock', 'BlackRock', 'B', 'Investment management', 'Global', '["Finance","Technology","Operations"]', 'Find a warmer path into BlackRock through verified employees.', 160
  UNION ALL SELECT 'hashicorp', 'HashiCorp', 'H', 'Infrastructure software', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into HashiCorp through verified employees.', 170
  UNION ALL SELECT 'discord', 'Discord', 'D', 'Communication software', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into Discord through verified employees.', 180
  UNION ALL SELECT '1password', '1Password', '1P', 'Security software', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into 1Password through verified employees.', 190
  UNION ALL SELECT 'varonis', 'Varonis', 'V', 'Data security software', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into Varonis through verified employees.', 200
  UNION ALL SELECT 'lenovo', 'Lenovo', 'L', 'Technology hardware', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into Lenovo through verified employees.', 210
  UNION ALL SELECT 'upstart', 'Upstart', 'U', 'Lending technology', 'Global', '["Engineering","Data","Operations"]', 'Find a warmer path into Upstart through verified employees.', 220
  UNION ALL SELECT 'openai', 'OpenAI', 'O', 'AI research', 'Global', '["Research","Engineering","Operations"]', 'Find a warmer path into OpenAI through verified employees.', 230
  UNION ALL SELECT 'coinbase', 'Coinbase', 'C', 'Crypto and financial services', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into Coinbase through verified employees.', 240
  UNION ALL SELECT 'sofi', 'SoFi', 'S', 'Financial services', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into SoFi through verified employees.', 250
  UNION ALL SELECT 'gemini', 'Gemini', 'G', 'Crypto and financial services', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into Gemini through verified employees.', 260
  UNION ALL SELECT 'stripe', 'Stripe', 'S', 'Financial infrastructure', 'Global', '["Engineering","Product","Operations"]', 'Find a warmer path into Stripe through verified employees.', 270
) v
WHERE NOT EXISTS (SELECT 1 FROM `companies` c WHERE c.slug = v.slug);

INSERT INTO `companyDomains` (`companyId`, `domain`, `isPrimary`)
SELECT c.id, v.domain, true FROM (
  SELECT 'pinterest' AS slug, 'pinterest.com' AS domain
  UNION ALL SELECT 'kpmg', 'kpmg.com'
  UNION ALL SELECT 'accenture', 'accenture.com'
  UNION ALL SELECT 'capgemini', 'capgemini.com'
  UNION ALL SELECT 'infosys', 'infosys.com'
  UNION ALL SELECT 'cognizant', 'cognizant.com'
  UNION ALL SELECT 'kraken', 'kraken.com'
  UNION ALL SELECT 'mongodb', 'mongodb.com'
  UNION ALL SELECT 'korn-ferry', 'kornferry.com'
  UNION ALL SELECT 'snowflake', 'snowflake.com'
  UNION ALL SELECT 'blackrock', 'blackrock.com'
  UNION ALL SELECT 'hashicorp', 'hashicorp.com'
  UNION ALL SELECT 'discord', 'discord.com'
  UNION ALL SELECT '1password', '1password.com'
  UNION ALL SELECT 'varonis', 'varonis.com'
  UNION ALL SELECT 'lenovo', 'lenovo.com'
  UNION ALL SELECT 'upstart', 'upstart.com'
  UNION ALL SELECT 'openai', 'openai.com'
  UNION ALL SELECT 'coinbase', 'coinbase.com'
  UNION ALL SELECT 'sofi', 'sofi.com'
  UNION ALL SELECT 'gemini', 'gemini.com'
  UNION ALL SELECT 'stripe', 'stripe.com'
) v
INNER JOIN `companies` c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM `companyDomains` d WHERE d.domain = v.domain);
