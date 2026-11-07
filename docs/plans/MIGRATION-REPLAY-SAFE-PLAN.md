# Migration replay hygiene - isolated safe plan (DRAFT, no production changes)

Oct 23, 2026. Coordinator: landing-transport agent. Todo: todo-01M5MSZBEZWWFQMDEYKWRR966B.
Scope rule: **no production DDL, no ledger/history edits, no deploy changes.** Repo-side replay hygiene only; every production-side question stays parked pending owner authorization.

## Evidence base (sanitized infra read, 2026-10-23 ~22:19 IST)

- Production `__drizzle_migrations`: 30 rows, tags 0000-0029, all applied 2026-08-30 (18:08-18:41 UTC).
- Repo journal: 40 entries, tags 0000-0042 (numbering skips 0035, 0039, 0040). Gap = **10 entries** (0030-0034, 0036-0038, 0041, 0042), not 13.
- The ledger hash column stores the migration **tag text**, not a hex digest, so no historical SQL hash comparison is possible from it. Original-applied file content is UNVERIFIED; never claim otherwise.
- Production physical state (94 tables) already contains objects from the missing 10 (employerAccounts, profileUnlocks, partnerModules, billingReviewOutbox, documentBlobs, resumeUploadSessions, users.suspended, profiles.accountType 'employer'). Which path created each object (deploy `scripts/apply-deploy-migrations.sh` 0030-0108 leg, boot `schemaReconcile`, or `apply-missing-columns.mjs`) is NOT proven. No deploy-ledger table exists under checked names.

## Confirmed replay defects (source-level, reproduced locally)

1. **0017_careful_ricochet.sql** drops index `privacy_request_user_kind_active_unique` twice (ALTER TABLE ... DROP INDEX, then DROP INDEX ... ON). Second statement errors 1091 on any clean replay. Prod ledger row 18 marks it applied 2026-08-30 18:11:31Z; original-apply tolerance unverified.
2. **0037_b2b_monetization.sql** uses plain `CREATE TABLE` (no IF NOT EXISTS) for employerAccounts/profileUnlocks/siblings. Boot `schemaReconcile.ts` creates ~40 tables including those, so any boot-before-replay path collides at 0037 (error 1050). Its `profiles.accountType` widening is MODIFY-only; production's enum already includes 'employer'.
3. drizzle-orm 0.45.2 (`mysql-core/dialect.js:39-55`) selects only the latest `__drizzle_migrations` row by created_at; applied entries are never re-hashed or re-applied at runtime. Editing already-applied files therefore cannot affect production.

## Safe plan

1. **Replay hygiene (repo only, this program):** make 0017 idempotent (single drop, or guard the second) and 0037 replay-safe (`CREATE TABLE IF NOT EXISTS` for the boot-reconcile overlap), with a header note in each file citing this plan. Caveat recorded: historical-file edits are invisible to production (applied rows never re-hash) and change only fresh replays; any environment that pinned old file bytes is unaffected at runtime.
2. **Verification:** local clean replay from empty schema (0000-0042 green) AND from a snapshot equivalent to the 0029 cutoff (0030-0042 green), artifacts saved. QA executes; coordinator reviews. No production access needed.
3. **Parked (NOT authorized, needs owner decision):** any production ledger alignment for the 10-entry gap, any historical-apply attribution dig, any deploy-path changes. Recommendation when asked: leave the prod ledger as-is and let the deploy script's existing 0030-0108 leg stay the path of record; a backfill is a history edit with no runtime benefit.

## Explicit non-goals

No prod DDL. No `__drizzle_migrations` inserts/updates/deletes. No claim about which historical file bytes production applied. No flag or deploy changes.
