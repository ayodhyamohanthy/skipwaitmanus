-- Widen profiles.accountType to include 'employer' where an older database lacks it.
-- Additive and safe for old binaries (existing values are unchanged). Skips when already widened.
DELIMITER $$
DROP PROCEDURE IF EXISTS `apply_0101_account_type_employer`$$
CREATE PROCEDURE `apply_0101_account_type_employer`()
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='profiles' AND column_name='accountType' AND column_type NOT LIKE '%''employer''%') THEN
    ALTER TABLE `profiles` MODIFY COLUMN `accountType` ENUM('job_seeker','referrer','employer') NULL;
  END IF;
END$$
CALL `apply_0101_account_type_employer`()$$
DROP PROCEDURE `apply_0101_account_type_employer`$$
DELIMITER ;
