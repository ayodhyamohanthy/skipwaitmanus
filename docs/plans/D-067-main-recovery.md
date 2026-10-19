# D-067 notification recovery follow-up, Oct 19 2026

Local isolated claim only, not a shared reservation or permission to publish. Branch `agent/kat/d067-main-recovery-oct19`, base `bc655963ded2a007980056c96e5c4a155afc7622`. Original D-067 remains shipped via PR #318 / 08d193a0; D-048 phase 2 remains shipped. No takeover of P0-allocated-ask-stuck, D-069, pinned work, or payment-method lanes.

## Plan before source edits

Port only the 20 backend paths listed in the reconciliation handoff from frozen 58b20d4762abc793e2c942298d42ebf143f6f8c3. Preserve current-main db.ts outside billing subscription/gift recovery and the added enqueue import. Preserve all current goal UI and current P0 allocation repair. Add the retry job after the nine existing jobs. Export contracts remain those of the reviewed outbox enqueue/worker and schema verifier. No formula, credit, grant, entitlement, pricing, or gift 409 contract change; only the approved explanatory message changes.

Targets are @drizzle/deploy/0097_billing_review_outbox.sql (PROVISIONAL LOCAL ONLY), @drizzle/schema.ts, @scripts/test-billing-review-partial-revokes.mjs, @scripts/verify-billing-review-schema.mjs, @server/_core/index.ts, @server/billingReviewOutbox.mysql.test.ts, @server/billingReviewOutbox.test.ts, @server/billingReviewOutbox.ts, @server/chargebeeGiftRoutes.test.ts, @server/chargebeeGiftSafety.test.ts, @server/chargebeeRoutes.ts, @server/chargebeeUnmatched.test.ts, @server/d067.alertRecovery.test.ts, @server/db.giftFulfillment.test.ts, @server/db.subscriptionActivation.test.ts, @server/db.ts, @server/scheduledJobRegistry.ts, @server/scheduledJobsContract.test.ts, @server/schemaReconcile.ts, @shared/scheduledJobs.ts. Documentation targets are this packet and additive amendments to @AGENTS.md and @docs/KIT_V4_BUILD_PLAN.md. Carry historical recovery/cutover/review packets as historical reference, never overwrite shipped status.

## Coordination and migration hard stop

All remote head refs fetched before work. 0096 is claimed by Qoder company demand and Workbuddy payment-method gate, and the main plan claims pinned work. 0097 belongs to Qoder thank-you wall PR #314. No central allocation has been made for this follow-up. Explicit caller prohibition on remote mutations prevents posting the required issue/PR coordination or publishing a central claim. Work proceeds only as an isolated local port under COLLABORATION section 2 fallback. No SQL publication, migration renumbering, claim of owner agreement, or live applied-state check is authorized. The unchanged provisional SQL digest must remain d14c261e8f2d55621b6f73a3e8aa1c7de0561b82567a7dcc1e9e78802c1bcbe0. Before any publication, a coordinator must reconcile owners, record an unused allocation centrally, prove this SQL has never applied, and rename only the file and references.

## Safety and verification

Approved accepted-content retention is seven days, then payload/envelope are atomically nulled. Permanent opaque identity, disposition, acceptance/provider receipt/conflict digest remain; pending/unknown stay until reconciled. Preserve reviewed strict metadata visibility, partial_revokes=0 and CURRENT_ROLE=NONE rules. No grants or server setting changes.

Run typecheck, focused recovery and scheduler tests, diff check, and runtime build before a local commit. Do not run the full gate now. Fresh independent review and exact integrated full gate follow. Production release additionally needs approved verifier credentials, backup/PITR and successful isolated restore proof, controlled ingress/tick pause and sender drain, boundary reconciliation, reviewed migration and structural verification, exact-release readiness and signed-in checks. Nothing is live by this packet.

## Local integration checkpoint

Fresh main advanced from b60eda03 to bc655963 with the P0 allocated-ask repair; its db.ts changes in held/unclaimed assignment, withdraw, expiry and claim are deliberately excluded from the recovery extraction and preserved byte-for-byte. Only the enqueue import and subscription/gift recovery hunks are carried into db.ts. All other 19 allowed backend files are exact tree-delta ports. Current DESIGN, tokens and all client files are untouched. The three historical recovery/cutover/review packets carry prominent historical/supersession notices; original shipped packets and decision history remain untouched.

Typecheck passed. Focused 13-file run passed 189 tests across 12 files; the one MySQL integration test skipped because no isolated MYSQL_TEST_URL was supplied. This is not new actual-MySQL proof. Logs /tmp/d067-main-port-check.log and /tmp/d067-main-port-focused.log. Full gate and independent review are deliberately deferred to the next frozen-candidate step. Migration number allocation remains BLOCKED, not reserved.

Runtime build passed (/tmp/d067-main-port-build.log). Diff check passed. Byte comparison confirms all db.ts content before subscription activation matches current main except the enqueue import; remaining db.ts delta contains only the six reviewed subscription/gift hunks. Other ported files remain exact 58b20d bytes. No full gate, SQL apply, provider call, push or remote mutation performed.
