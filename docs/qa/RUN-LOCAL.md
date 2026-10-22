# QA preview - local fallback run

If the hosted preview (skipwait-qa.ayodhya-711.workers.dev) is down, run the
same build locally against the same scratch database (fictional Quillmint
fixtures only - never production data).

1. Get the code: `git clone https://github.com/ayodhyamohanthy/skipwaitmanus && cd skipwaitmanus && git checkout agent/instinct/qa-preview-share`
2. `cp .env.qa-local.example .env.qa-local` and paste the password from the
   vault entry **"skipwait-qa scratch DB (local QA)"** (username
   `skipwait_qa_local`) into `DATABASE_URL`. Never share or commit this file.
3. `bash scripts/qa-local-run.sh`
4. Open http://localhost:3100 and run the same cross-side pass as the hosted
   preview (docs/qa/preview-share-flags.md has the fixture map).

Expected notes:
- `/api/health` returns 200 with `schemaReconcileState:"failed"` - expected:
  the scratch DB was initialized with drizzle-kit push, not the migration
  ledger. Pages and APIs work; this flag is bookkeeping, not a blocker.
- Sign-in uses the dev-auth path (NODE_ENV=test): any name/email signs in.
  Do NOT use the referrer OTP intent for a neutral account - it auto-enrolls
  the account as a referrer.
- Billing is inert: test dummies, live disabled. Checkout screens error if
  opened; that is expected on this build.
- If the preflight says the database is unreachable, the Azure firewall is
  blocking your network - stop and report; do not retry in a loop.
