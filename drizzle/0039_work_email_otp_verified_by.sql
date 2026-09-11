-- 0039: bind a consumed work-email OTP code to the account that consumed it.
--
-- `workEmailOtpCodes.consumedAt` alone only proves that *somebody* received the
-- address. Enrollment (POST /api/company-referrals/verify-work-email) treated
-- that as proof for whichever account was calling, so any signed-in account that
-- knew a colleague's work email could enroll as a verified employee of that
-- company inside the 10-minute receipt window — and read its private referral
-- inbox, including applicants' resumes.
--
-- Existing rows keep verifiedByUserId = NULL, which never matches a caller, so
-- pre-migration receipts stop being transferable. That is the intended
-- fail-closed behaviour; the referrer OTP login flow self-enrolls its profile
-- and does not depend on the receipt.
ALTER TABLE `workEmailOtpCodes` ADD COLUMN `verifiedByUserId` int NULL;
--> statement-breakpoint
CREATE INDEX `work_email_otp_verified_by_idx` ON `workEmailOtpCodes` (`email`, `verifiedByUserId`);
