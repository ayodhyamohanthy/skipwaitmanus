# REL-review-email-retry-schema: deploy the alert columns before retry code

## Goal and authority

Make the production schema ready for the already-approved `REL-review-email-retry` repair before schema-dependent code reaches `main`. This is a prerequisite of D-350 and the parent packet, decomposed under D-200/D-223; it changes no product rule or deployment gate. Growth loop L4: employees receive recoverable review notices.

On `main` `933c454a` (2026-11-18), `Deploy API` applies migrations only from green `main`, before the API image. PR #874 at `0c4f79e3` contains both migration 0122 and its dependent runtime code. Its `Fixed` marker `34eb2a53` binds to that head; production migration acceptance is still unverified. A migration-only PR supplies the missing order without direct SQL, a branch deployment or a workflow change.

## Task and scope

- ID: `REL-review-email-retry-schema`; branch: `agent/queue/rel-review-email-retry-schema`; lane: `notifications-schema`; Tier 1; epic: `D-212`.
- Depends on `D-174-job-catalog`, the parent's existing prerequisite.
- Implementation target: `@drizzle/deploy/0122_review_delivery_owner_alerts.sql` only, plus this packet's Status section and this row's eventual registry status.
- Source: the exact file in PR #874 head `0c4f79e372536055fd9d70b6897a0b562c2ebc83`.
- SHA-256: `ff2f5ed03c0e9f5bd4117812eb7c7ec0551281ba161a012a434542f3824a14f3`.
- No `drizzle/schema.ts`, readiness, worker, scheduled-job, email, API, workflow, configuration or dependency edit. No notification is sent by this task.

The SQL adds four nullable columns (`ownerAlertStatus`, `ownerAlertLeaseOwner`, `ownerAlertLeaseExpiresAt`, `ownerAlertSentAt`) and `referral_review_owner_alert_idx` on `referralReviewDeliveries`, with information_schema guards. It updates no delivery row and backfills no historical alert. Existing binaries do not select the new columns.

## Build and verification

1. Complete BUILD_CONTINUITY and claim this row normally. Recheck that 0122 is absent on current main and no newer carrier changed its bytes or purpose. Do not rename or overwrite an applied migration. If a production ledger reports another checksum, stop this task and report the mismatch.
2. Copy the exact source SQL; compare its SHA-256 with the value above. Do not cherry-pick the parent's schema or runtime commits.
3. Run migration lint, `pnpm check`, focused migration/deploy/release-gate tests and `pnpm build`. Required PR CI includes real MySQL application from the base schema and a second pass applying zero files. The migration-only head intentionally has extra nullable columns/index relative to its unchanged Drizzle model: the gate's explicit extra-column/index warnings are expected; missing columns, apply failures, fallback paths or a nonzero second pass are not acceptance. Report the actual CI summary.
4. Obtain an independent Tier 1 review of this migration-only PR under D-352. The parent's marker is not a substitute for this PR's review. Review verifies the checksum, additive/nullable shape, no data writes/backfill, index, old-binary compatibility and the release ordering.
5. Land only through the protected PR path with current-main integration and required exact-head CI green. Use merge commit/auto-merge, no direct SQL or release-gate bypass. Keep the schema row `todo` until its production acceptance below is recorded; merging the file alone is not completion.

## Production acceptance and recovery

The ordinary `Deploy API` workflow on this migration-only main commit is the authorized executor (`docs/DEPLOY.md`, Database migrations). Its green exact-main release gate runs first; `migrate-db` applies the pending SQL and records filename/checksum in `schemaDeployMigrations` before the API image job starts. No workflow, secret or repository setting changes are needed.

Record the main SHA, main CI URL and Deploy API run URL. Inspect the successful `migrate-db` log for `apply 0122_review_delivery_owner_alerts.sql` and the successful gate result (or an already-applied skip verified by the script's matching-checksum check). The runner records the checksum only after SQL succeeds; a failed ledger write fails the job. Verify the same run's API release/readiness and unchanged existing flows through the canonical exact-release checks. Public proof contains no database target, credentials or customer data.

If migration execution fails, the existing workflow must stop before the dependent image. Report the exact failing leg; do not retry around a checksum mismatch or hand-edit the database. The guards permit forward retry after the actual failure is understood. Rollback keeps these unused nullable columns/index; never drop them. Later parent code starts durable alert obligations; this prerequisite creates none.

After those results pass, mark only this row done with the evidence. Then the parent holder merges current main, retains the exact SQL bytes, verifies the head-bound Fixed/CI state, and resumes runtime landing. A subsequent runtime deploy sees the same migration checksum and skips it. The parent's first live `review-delivery-retry` run remains its own acceptance, never claimed by this schema row.

## Status

REL-review-email-retry-schema: review — agent/queue/rel-review-email-retry-schema — 58e4f313 — GPT-6 Sol · b494 — 2026-11-19 — draft PR #1341. Main 6e856444d, claim 460fb7af6; read current instructions/BRIEF/PRD/BUILD_CONTINUITY/packet and register through D-366; no scope change. Exact source 0c4f79e3 SQL copied; packet SHA-256 ff2f5ed03c0e9f5bd4117812eb7c7ec0551281ba161a012a434542f3824a14f3 matches. Missing-file acceptance failed before copy, passes after. Focused 4 files/172 tests, pnpm check/build, migration lint, token audit, deploy-trigger coverage, scope and diff checks pass. Full local suite running; CI 44580244934 pending, including real-MySQL apply-twice/expected extra-schema warning proof. No local mysql/docker CLI; no database statement executed. Independent Tier 1 review, green exact-head CI, protected landing, production migrate-db/checksum evidence and canonical release verification still owed; keep row todo. Parent #874 remains draft at 0c4f79e3/Fixed34eb2a53; no retry runtime or historical alert backfill included.
