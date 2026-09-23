-- Clerk roster import (founder roster, Sep 23): 18 real users. The 6 test/junk
-- rows and the founder's own 3 addresses are intentionally not here.
-- Each row is email-keyed with canonicalPersonId NULL, so the person's first
-- verified sign-in (email OTP or WorkOS) claims it through resolveLoginIdentity.
-- Idempotent: openId is unique, and rows are skipped when the email already
-- exists (prechecked Sep 24: none of the 18 exist in prod).
SET NAMES utf8mb4;
INSERT INTO users (openId, name, email, loginMethod)
SELECT v.openId, v.name, v.email, v.loginMethod FROM (
  SELECT NULL AS openId, NULL AS name, NULL AS email, NULL AS loginMethod FROM DUAL WHERE FALSE
  UNION ALL SELECT 'clerkimport_konovalov.nk@gmail.com', 'Nikolay Konovalov', 'konovalov.nk@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_deepu4402020@gmail.com', 'Deepesh Yadav', 'deepu4402020@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_business.santhoshgowda@gmail.com', 'Santhosh Gowda', 'business.santhoshgowda@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_pravallikamahanthy39@gmail.com', 'Pravallika Mahanthy', 'pravallikamahanthy39@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_tarajagan2@gmail.com', 'ravi m', 'tarajagan2@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_prithwish777777@gmail.com', 'Prithwish Laha', 'prithwish777777@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_ghoshkausani@gmail.com', 'Kausani Ghosh', 'ghoshkausani@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_being.sushil9@gmail.com', 'Sushil Kumar', 'being.sushil9@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_raghunandan.darbarroy.mohanty@gmail.com', 'Raghunandan Darbarroy Mohanty', 'raghunandan.darbarroy.mohanty@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_imantobb@gmail.com', 'Imanto Uchiha', 'imantobb@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_himabindumohanty@gmail.com', 'HIMABINDU MOHANTY', 'himabindumohanty@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_chneeharika141@gmail.com', 'Neeharika Ch', 'chneeharika141@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_hashmiadil161@gmail.com', 'Adil Hashmi', 'hashmiadil161@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_kksakthiprasad@gmail.com', 'Sakthi Prasad', 'kksakthiprasad@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_lukasz.czapiewski2@gmail.com', 'Łukasz Czapiewski', 'lukasz.czapiewski2@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_shriyogjambekar2001@gmail.com', 'Shree Jambekar', 'shriyogjambekar2001@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_sahil2313@gmail.com', 'Sahil Garg', 'sahil2313@gmail.com', 'clerk_import'
  UNION ALL SELECT 'clerkimport_abneha04@gmail.com', 'Neha B', 'abneha04@gmail.com', 'clerk_import'
) v
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(TRIM(u.email)) = v.email)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.openId = v.openId);
SELECT COUNT(*) AS clerk_import_rows FROM users WHERE loginMethod = 'clerk_import';
