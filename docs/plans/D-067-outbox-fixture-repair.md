# D-067 outbox fixture repair proposal

## Status

In progress — Kat Outbox · 5863 — 2026-10-22 — branch `agent/kat/outbox-fixture-repair-oct22`. Registered by owner Ayu, coordinator unavailable, Oct 22 (registry PR #466). Owner-assigned exclusive claim `d989af1d`; picker selected unrelated ROW20-B, whose claim pushes failed, so owner continuation authority is recorded without impersonating the CEO. No registry edits by this session. Plan owns only the two fixture files and this packet. Replace stale migration references and require missing-parent code `ER_NO_REFERENCED_ROW_2`, errno 1452 and SQLSTATE 23000; no exports, runtime/schema or migration changes. Fresh actual-MySQL red baseline `84f4deb4` fails ENOENT at the obsolete path. Exact repaired candidate gates and independent review pending.

## Evidence and purpose

Migration PR #406 renamed the unchanged outbox SQL to `drizzle/deploy/0100_billing_review_outbox.sql`. Both `server/billingReviewOutbox.mysql.test.ts` and `scripts/test-billing-review-partial-revokes.mjs` still open the removed 0099 filename. The earlier isolated exact-main test failed ENOENT; diagnostic-only filename corrections exposed an FK assertion mismatch on MySQL 8.0.46 (`ER_NO_REFERENCED_ROW_2`, not `ER_NO_REFERENCED_ROW`). Diagnostic scratch passes are not candidate verification.

The repair restores executable safety evidence, not product behavior. Seekers retain reliable review recovery; referrers and companies see no behavior or access change. Growth loop L6 reliability support. This is not a production incident or permission to change money policy.

## Proposed ownership and implementation

After CEO registration and an eligible picker claim, the implementation owns exactly `server/billingReviewOutbox.mysql.test.ts`, `scripts/test-billing-review-partial-revokes.mjs`, and this packet's Status section. Any extra path needs an explicit scope amendment and ownership check first. No export, runtime contract, dependency, migration, schema or environment change is planned.

Replace the two obsolete fixture paths with the existing 0100 migration. Preserve SQL bytes and digest `d14c261e8f2d55621b6f73a3e8aa1c7de0561b82567a7dcc1e9e78802c1bcbe0`. Assert the orphan INSERT fails with MySQL's actual missing-parent semantics, preferably errno 1452 plus SQLSTATE 23000 and its documented `ER_NO_REFERENCED_ROW_2` code. If support for historical code 1216 is necessary, justify and test the corresponding explicit code/errno mapping separately. Never accept arbitrary rejection or an unrelated constraint error. Keep the real offending INSERT, empty parent, schema negative checks, verifier fail-closed assertions, worker races, rollback, retention and cleanup intact.

## Verification and acceptance

Capture red-before evidence on the fresh exact baseline using a new disposable MySQL instance on the fixture's fixed 127.0.0.1 port 34879 only after confirming it is unused. Never connect production URLs or reuse existing accounts. Use `D067_ISOLATED_MYSQL_URL` for the opt-in test. Then run the repaired exact candidate on a fresh disposable database and require the full actual MySQL integration test to pass, with no opt-in skip.

For partial revokes, start a separate fresh socket-only disposable server with partial_revokes enabled at startup, under `/tmp/d067-visibility-<unique>/mysql.sock`, and run `D067_PARTIAL_REVOKES_FIXTURE_SOCKET=<socket> node scripts/test-billing-review-partial-revokes.mjs`. Require admin sees the incoming FK, limited verifier cannot see it, previous guard accepts, current guard rejects, and the protected DELETE fails with ER_ROW_IS_REFERENCED_2. Never alter settings on an existing server. Stop only fixture-owned processes and retain red/green logs without secrets.

Run `pnpm check`, `pnpm build`, focused outbox/worker/verifier tests, `bash scripts/lint-deploy-migrations.sh`, and `git diff --check`; confirm migration content unchanged. Parent reviews the exact narrow candidate before any full gate or additional agents. After that, normal full integrated gate and independent draft-PR review remain required before main. Record exact candidate SHA and log paths in Status, clearly distinguishing isolated fixtures from production evidence.

## Exclusions and handoff

No runtime edit, production SQL, backup/restore operation, provider call, workflow dispatch, deployment, account/grant/settings change on existing servers, or main push. Production strict schema verification, backup/PITR and restore rehearsal, old-sender pause/drain, boundary reconciliation and signed-in checks remain separate operational gates. Public deployment success is not proof these gates passed.

CEO action requested: register a narrowly scoped normal-priority follow-up task and packet in assignments, select appropriate lane/tier/dependencies and branch, then let the picker allocate it. Until then implementation is blocked, not complete. No owner pricing or product decision is needed.
