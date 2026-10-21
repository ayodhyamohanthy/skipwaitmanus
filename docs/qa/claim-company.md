# Claim-company local slice (D-107)

Flags off: COMPANY_CLAIM_ENABLED + VITE_COMPANY_CLAIM. Depends on company response signal branch (#373).

Entry: /for-companies navigation -> /company/claim -> work-email link -> explicit confirmation -> /company/dashboard/:slug -> /explore/:slug. Unknown companies: /suggest-company. Sign-in uses existing work-email path, preserving returnTo including token fragment.

Privacy: mailbox proof is not company ownership. Aggregate-only grants never change account roles or profiles. Every number hidden until 3 verified referrers AND 3 answered asks this calendar month. No seeker identities, resumes, contacts, messages or per-referrer stats in the dashboard response. Verification tokens hashed, bound to user, 10-minute lifetime, one use, POST confirm; fragment avoids HTTP logs. Send uses user/domain/global limits.

Local captures in design/goal-ui/captures/claim-company use fictional Quillmint and intercepted API fixtures. They verify layout, not real mail/DB/auth integration. Both 1280 and 390 shown/insufficient states captured.

Remaining before ready:
- Reviewer security/design pass; privacy grep and cross-side regression.
- Migration on isolated DB, transaction concurrency and replay under real MySQL.
- Existing sign-in returnTo preserves token fragment end to end.
- Actual email link delivery and explicit same-user confirmation; never send live test mail without approved recipient/content.
- Global/group rate limits, account suspension, renamed/removed company domain behavior.
- Deployed public signal shares the same feature rollout; never claim a public signal is visible while its separate flag is off.
- Lifecycle cleanup of expired challenges and access revocation policy before launch.

Rollback: disable both claim flags. Existing seeker/referrer APIs are untouched.
