# BANDED-schema-migration: apply banded storage before readiness code

## Goal and authority

Supply the migration-first prerequisite already required by `BANDED-schema` and `docs/BRIEF.md`. This is a decomposition of D-366/D-367/D-370 under D-200/D-223, following `REL-review-email-retry-schema` / PR #1341; it changes no product, price, sale or release rule. Growth loop L3: preserve reliable billing when a seeker sends their next referral request.

PR #1371 contains migration 0123 together with schema-dependent startup validation. Its existing packet requires a migration-only release and production verification first. On main `958ec17dc` inspected November 20, 2026, no deploy migration 0123 exists. The parent remains draft; green historical CI does not establish production migration acceptance.

## Task and scope

- ID: `BANDED-schema-migration`; branch: `agent/queue/banded-schema-migration`; lane: `banded-schema-migration`; Tier 1; epic: `BANDED-release`.
- Targets: `@drizzle/deploy/0123_banded_plans.sql`, focused real-MySQL verification `@e2e/banded-migration.e2e.ts`, this packet's Status section and eventual registry status.
- SQL source: PR #1371 source `4d3bae008d33adf61b98a9fcff8906424dacc1aa`, retained unchanged in claimed head `c983aaa13655c16e99f30f78fa41ee1495ba29f1`.
- SHA-256: `0e81be7080d2fc8087cf278edb3858b5dc5b8846e95eb6819ee3eb2a1e9a28d2`.
- No schema model, readiness, runtime reader, checkout, grant, spending order, provider, workflow, secret, dependency or sales-switch edit.

The SQL appends three banded plan ids after every historical wallet/intent ENUM value, retaining defaults and ordinals. It creates empty per-level balances, separate TEST/LIVE founding counters and constrained memberships. It initializes six zero-valued counter rows; replay must never reset counts. It converts no existing money or account, creates no grant and sells nothing. Existing binaries use their original columns and values.

## Build and verification

1. Follow BUILD_CONTINUITY and claim this row normally. Fetch main again; verify 0123 is unallocated and the source checksum matches. Never rename or modify an already-applied migration or bypass a checksum mismatch.
2. Copy only the exact SQL, not the parent's runtime/schema commits. Add a local-only MySQL test using the existing CI service that applies the actual migration from independently pinned historical ENUMs, verifies preserved ordinals/defaults and unchanged existing data, new constraints and TEST/LIVE separation, then replays without resetting state. Existing parent database tests remain intact.
3. Run migration lint, focused migration/deploy tests, `pnpm check` and `pnpm build`. Required CI must prove real-MySQL application and zero files on replay. Extra tables/ENUM values relative to the unchanged model are expected; missing old-model schema, apply failures or checksum mismatches are not.
4. D-370: all required CI must be green; no independent review or verdict marker is required. Land through a protected PR with merge-commit auto-merge. Keep this row `todo` until production acceptance is recorded.

## Production acceptance and recovery

The ordinary Deploy API workflow on green main is the executor. Its release gate precedes `migrate-db`; the runner records filename/checksum in `schemaDeployMigrations` only after the SQL succeeds. No direct database connection, branch deployment, secret or workflow change is required.

Record the merged SHA, main CI and Deploy API run. Inspect the production migration job for `apply 0123_banded_plans.sql` and successful migration-gate output, or a matching-checksum skip. Verify the canonical exact-release/readiness result under the existing deploy classifier; distinguish an unchanged runtime from a newly deployed image. Include a read-only homepage and signed-out authentication smoke check without sending email or making payments.

If the migration fails, the workflow stops before dependent runtime. Report the exact leg and evidence; investigate before retry. Keep these unused tables and appended ENUM values during recovery; never drop them or shrink an ENUM. A partial application is forward-retried only through the guarded runner once its failure is understood.

Only after acceptance mark this row done. The parent holder then merges current main, retains the same SQL/checksum and runs fresh required CI before its readiness/schema code lands. This prerequisite does not complete `BANDED-schema` or activate plans.

## Status

Registration only — GPT-6.1 Sol · a70b, November 20, 2026. Official picker assigned LAND `BANDED-schema` via takeover `c983aaa13`. Parent #1371 / `4d3bae008` repair CI `44754296121` passed compiler, all test shards, build and six real-MySQL cases; its production migration prerequisite remains unverified. Read BRIEF, AGENTS, PRD, BUILD_CONTINUITY, COLLABORATION, current packet, payments runbook, D-360–D-370, parent PR comments and #1341 precedent. Main was refreshed before the bounded docs registration. The new row sits immediately before its parent; only that parent gains a dependency. No migration or runtime is included in the registration PR.
