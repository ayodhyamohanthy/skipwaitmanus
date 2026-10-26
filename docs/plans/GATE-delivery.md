# Packet GATE: nothing broken reaches `main` (D-192)

> Read [`docs/BRIEF.md`](../BRIEF.md), [`ENTERPRISE-PIPELINE.md`](ENTERPRISE-PIPELINE.md) and [`PROCESS-gates.md`](PROCESS-gates.md) first. Written by Claude Code as CEO (D-085, D-192) on Oct 24 2026 against `main` `02a8a028`. D-166 already enforces one door to `main` (`PROCESS-queue-gate`) and an independent Tier 1 pass on the exact head (`PROCESS-review-gate`); this packet adds the tester, QA and status-board roles on top. Several tasks share this packet (D-134): the picker hands out one at a time; do only the task it prints, and write your status line in the Status section at the end. Line numbers drift: find each function by name first. The register wins any conflict.

## Rules for every task here
1. **A gate is a machine check.** It reads git, the PR or a marker. It never trusts a sentence in a PR body, except the one this packet names (the "Ported assertions" table).
2. **Fast.** Each new check finishes in under a minute, except the e2e job (under 8 minutes, in parallel with the others). A docs-only PR passes each check at once. Never put a workflow `paths:` filter on a check that may become required: a filtered required check stays pending forever.
3. **Fail closed on a definite breach, open on a broken tool**, as `scripts/scope-check.mjs` does: a check that cannot run warns and passes; a check that finds a breach fails.
4. **Required checks need the owner's word** (D-192 (6)). Each task lands its check as a CI step or job; the CEO asks the owner to add it to ruleset 25433342 once it has been green on `main` for 3 days.
5. Red-first tests; the gate on your commit merged with `origin/main`; CI green on the exact head; land through the merge-commit button (`main-protection` requires a pull request; never squash or rebase; no admin bypass, D-200), which deletes the head branch; delete your marker branches after landing (D-205, D-192 (5)).

## GATE-test-integrity: tests can be added, not quietly removed (lane `ci-checks`, Tier 2)
**Why.** #431 removed 107 `expect(` lines from `client/src/pages/ask.test.tsx` and added 49 (`git diff d3da2497^1 d3da2497`); #426 deleted the test that pinned the `/queue` attestation. Both PRs went green and shipped live regressions (`LIVE-OCT22-regressions.md`). No check counts assertions.

**What.** `scripts/test-integrity.mjs` (I/O) and `scripts/testIntegrityCore.mjs` (pure), run as a new step "Test integrity" in the `typecheck` job of `.github/workflows/ci.yml`, on `pull_request` events only. It diffs the PR head against its merge base with `origin/main` and fails when:
1. a `*.test.ts` or `*.test.tsx` file is deleted or renamed away, unless the task's `owns` names it (the scope check's retirement rule);
2. a changed test file adds `.only(`;
3. a changed test file adds `.skip(`, `.todo(`, `it.skip`, `test.skip`, `describe.skip` or `xit(`;
4. a changed test file ends with fewer assertion lines than it started with (lines matching `expect(` or `assert`), unless the PR body has a table under the heading `Ported assertions` with a row naming that file and where each removed assertion now lives (D-136 (2)(b));
5. a **pinned** test file loses any assertion line at all, table or not, unless a commit on the branch carries `test-integrity: <file> — D-<n>` naming the decision that changed the rule. The pinned files are one exported list in `scripts/testIntegrityCore.mjs`: `client/src/pages/loginRule.test.tsx`, `client/src/pages/signIn.test.tsx`, and every `server/*.test.ts` whose name contains `creditLedger`, `dailyMoneyCheck`, `payment`, `refund` or `chargebee`.

The PR body reaches the script through the event file at `GITHUB_EVENT_PATH` (`pull_request.body`); never interpolate the body into a shell line. Add the `Ported assertions` heading to `.github/pull_request_template.md` with one sentence on when to fill it.

**Tests** (red first, `scripts/testIntegrity.test.ts`, on diff-text fixtures): each of rules 1-5 fails on its case and passes on its control; a PR that only adds tests passes; a moved assertion with a table row passes rule 4 but not rule 5; a docs-only diff passes at once.

**Owned paths.** `scripts/test-integrity.mjs`, `scripts/testIntegrityCore.mjs`, `scripts/testIntegrity.test.ts` (new), `.github/workflows/ci.yml` (one step), `.github/pull_request_template.md` (one heading). **Done:** tests, CI green with the new step running on this very PR, landed.

## GATE-e2e-journeys: the core journeys run in a real browser on every PR (lane `e2e`, Tier 2, after GATE-test-integrity, which also edits `ci.yml`)
**Why.** CI runs Vitest only. Both Oct 22 regressions crossed pages and sign-in, which unit tests did not see. Playwright 1.62.1 is already a devDependency (`package.json`); only `scripts/kit-screens/capture.mjs` and `scripts/live-flow-audit.mjs` use it, and no workflow runs either.

**What.**
1. `e2e/` (new): `e2e/playwright.config.ts` with `testMatch: "*.e2e.ts"` (Vitest's include list is explicit, so it never collects them), one `e2e/<journey>.e2e.ts` per journey, and `scripts/e2e-server.mjs`. CI runs `pnpm build`; the script then starts the server on a free port with no `DATABASE_URL` (the in-memory store), no WorkOS keys (the dev sign-in plane, `registerDevAuthRoutes`), and test values for `JWT_SECRET` and `VITE_APP_ID=skipwait`, and seeds the data the journeys need through the app's own seed or API, never by writing rows by hand. If the production build cannot run with the dev sign-in plane, run the dev server instead and say why in the PR.
2. **Journeys** (each also fails on any console error or any 5xx response during the run):
   - **A personal link survives sign-in.** Open a referrer's personal link signed out, write the request, press Send, sign in on the dev plane, and assert the request's POST carries `fastTrackCode` (P0-ask-link-signin).
   - **The attestation is shown before Accept.** As a verified referrer on `/queue`, select a request: the line "By accepting, you confirm you'll refer only through {company}'s official process." is visible, and Accept posts `ethicsConfirmed: true`; Pass never does (P1-queue-attestation). Mark this spec `test.fixme("P1-queue-attestation")` until that row lands, and switch it on in that row's PR or the one after.
   - **The cost is shown before every request.** The compose screen shows the cost line before Send.
   - **Withdraw returns the credit.** Send a request, withdraw it before pickup, and the balance goes back up by one.
   - **Referrers sign in with a work email only.** `/sign-in` with "Give a referral" offers the work-email code and no social or personal-email option (the login rule, D-030).
   - **Plans read the server catalog.** `/plans` shows the prices `/api/plans/catalog` returns.
3. A job `e2e journeys` in `.github/workflows/ci.yml` (`pnpm exec playwright install --with-deps chromium`, browser cached), on `pull_request` and on `push` to `main`. On failure it uploads the Playwright trace and screenshots as an artifact.
4. `package.json`: one script line `"e2e": "playwright test -c e2e/playwright.config.ts"`. No new dependency.

**Tests.** The journeys are the tests. Prove each catches its bug: in the PR, link a CI run where the personal-link journey fails against a throwaway branch that reverts the P0 fix (never pushed to `main`), next to the green run.

**Owned paths.** `e2e/`, `scripts/e2e-server.mjs`, `.github/workflows/ci.yml` (the new job only), `package.json` (one script line). The `AGENTS.md` "Validation commands" text goes at the end of your done line here (`— map: ...`); the CEO folds it in. **Done:** six journeys green on `main` (the attestation one after P1-queue-attestation), the red run linked, the job under 8 minutes.

## GATE-tier-floor: the tier is computed from the paths, not only declared (lane `process`, Tier 2, after PROCESS-review-gate)
**Why.** `PROCESS-review-gate` (D-166) asks for an independent pass when a row is declared Tier 1. The tier is written by hand, and a money or sign-in change can sit in a row declared Tier 2. #415 (refund keys), #437 (password sign-in for reviewer accounts) and #439 (migration 0101) are Tier 1 by `docs/DELEGATION.md` §3 and merged within 13 minutes with no review.

**What.**
1. `scripts/tierClassifyCore.mjs` (pure): maps changed paths to a tier. Tier 1: `drizzle/**`, `server/creditLedger.ts`, `server/payments.ts`, `server/paymentWebhooks.ts`, `server/chargebee*.ts`, `server/paymentRefund*.ts`, `server/cardValidation.ts`, `server/dailyMoneyCheck.ts`, `server/coverageDelivery.ts`, `server/heldAsk.ts`, `server/_core/workosAuth.ts`, `server/_core/sdk.ts`, `server/_core/otpLogin.ts`, `server/_core/seekerEmailCode.ts`, `server/_core/context.ts`, `server/workEmailOtp.ts`, `server/referrerDocumentAccess.ts`, `server/blockedPairs.ts`, `shared/creditLedger.ts`, `shared/planCatalog.ts`, `shared/planFamily.ts`, `shared/moneyCopy.ts`, `shared/referrerPurchases.ts`, and the client sign-in and money surfaces (`client/src/components/*SignIn*.tsx`, `client/src/pages/Ask.tsx`, `client/src/pages/MyCompanyInbox.tsx`, `client/src/pages/Plans*.tsx`, `client/src/components/plans/**`). `server/db.ts` counts as Tier 1 when the diff touches a function whose name contains `credit`, `spend`, `refund`, `ledger`, `payment`, `wallet` or `grant`. Test files alone never raise the tier. Everything else under `server/`, `shared/` and `client/src/` is Tier 2; docs and packets alone are Tier 3. One exported constant, one comment per entry, so the CEO can amend it.
2. `scripts/review-gate.mjs` uses the higher of the row's declared tier and the computed tier, and its failure message says which paths made the change Tier 1: "This change touches <paths>, which are Tier 1 (D-192). It needs an independent pass on its head; ask the CEO to correct the row's tier."

**Tests** (red first): the classifier on each listed path; a `server/db.ts` diff that touches `spendCreditsTx` (Tier 1) and one that does not (Tier 2); a tests-only diff; a docs-only diff (Tier 3); the review gate failing a declared Tier 2 row whose diff is Tier 1 by path, and passing it once an independent pass on the head exists.

**Owned paths.** `scripts/tierClassifyCore.mjs`, `scripts/tierClassify.test.ts` (new), `scripts/review-gate.mjs`, `scripts/reviewGate.test.ts`. **Done:** tests, CI green, landed, and one real PR showing the message.

## PICKER-qa-stage: a session that did not build it uses the change like a user (lane `process`, Tier 2, after GATE-e2e-journeys, GATE-tier-floor, D-048-F-harness, PROCESS-scorecard, PICKER-review-wording, PICKER-architect-landing and PICKER-fullstack-lights, which edit the same files)
**Why.** Nobody checks a UI change at 1280 and 390, through its loading, empty and error states, against its approved comp, except the builder itself (AGENTS.md rule 8). The picker has no QA stage.

**What.** A new pending kind `qa` in `scripts/nextTaskCore.mjs`, ranked with `review`, for a task whose open PR changes `client/src/pages/**` or `client/src/components/**`. It never goes to a model that built or fixed the work (D-151) and runs side by side with the review. The QA steps (`scripts/nextTaskText.mjs`): check out the PR head; run `pnpm e2e`; take captures at 1280 and 390 of every changed screen with the goal harness (`node scripts/kit-screens/capture.mjs --goal <ids> --viewport both`, fixtures only, never production data); walk the loading, empty, error and offline states, keyboard use and 390 overflow; compare with the approved comp in `design/goal-ui/` and the money lines with `shared/moneyCopy.ts`; post the captures and findings as one PR comment; push the marker `QA <id>: pass — <who>` or `QA <id>: findings — <who>` on `agent/review/<slug>`, with the body `reviewed <sha>` exactly as `PROCESS-review-gate` records verdicts. Findings become a `fix` like review findings. Speed first (D-200 (4)): `scripts/review-gate.mjs` requires a QA pass on the head only for a Tier 1 PR (the computed tier, GATE-tier-floor) that changes those paths. A Tier 2 or 3 UI PR lands on green CI; its QA stage is handed out after landing, within 24 hours, against the landed commit, and findings become fix rows the CEO queues.

**Tests** (red first, `scripts/nextTask.test.ts` and `scripts/reviewGate.test.ts`): a UI PR gets a `qa` stage and a server-only PR does not; the builder's and fixer's models never get it; a QA pass on an older head does not count; QA and review go to two different sessions at once; the review gate fails a Tier 1 UI PR with a review pass but no QA pass, and does not hold a Tier 2 UI PR; a landed Tier 2 UI PR gets its post-landing QA stage.

**Owned paths.** `scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs`, `scripts/nextTask.test.ts`, `scripts/review-gate.mjs`, `scripts/reviewGate.test.ts`, `docs/DELEGATION.md` (a QA checklist in §6). **Done:** tests, CI green, landed, and the first real QA marker on a UI PR.

## PICKER-fullstack-lights: the board shows all seven lights, and a red live release stops feature landings (lane `process`, Tier 2, after REL-release-verify, PROCESS-review-gate, PICKER-review-wording and PICKER-architect-landing, which edit the same files)
**Why.** The picker reads only `main`'s CI (`scripts/next-task.mjs`). A failed deploy, an unverified release, an open outage or an overdue job never turns the board red, so agents keep landing features on top of a broken production. `PROCESS-scorecard` reports weekly; this is the live view.

**What.** `--status` prints, for the live release, lights 1 to 7 of `ENTERPRISE-PIPELINE.md` §4: `main` CI; the newest Deploy API and Deploy Web runs on `main`; the API and web SHAs live (`/api/health`, the `git-commit` meta); `release/verified` on that SHA; open issues labelled `incident` or titled `API DOWN`; `/api/health/jobs` (`ok`, once REL-heartbeats is live). Any red among lights 4 to 7 makes `main` red for the picker exactly as red CI does today: only fix-main work is handed out, and its steps tell the agent to revert the landed commit first when that release is code-only and the commit caused it. A light the picker cannot read prints `unknown` and never turns `main` red by itself.

**Tests** (red first): each light's red, green and unknown state from fixture data; a red light 5 hands out only fix-main; an unknown light hands out normal work.

**Owned paths.** `scripts/next-task.mjs`, `scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs`, `scripts/nextTask.test.ts`. The `AGENTS.md` rule 6 and "Agent work queue" text goes at the end of your done line here; the CEO folds it in. **Done:** tests, CI green, landed, and a `--status` print in the PR.

## GATE-migration-apply (architect, Tier 2): a migration runs against MySQL before production
Today the first real run of a `drizzle/deploy/*.sql` file is `migrate-db` in the production deploy. Any agent writes the packet first (D-109): a CI job with a MySQL 8 service container that applies the deploy migrations to a database built from the current production schema, twice (the second run proves they are safe to repeat), and passes at once when `drizzle/**` did not change. The packet first establishes whether the migrations apply from an empty database or need a baseline snapshot (D-100 mentions a production schema baseline).

## Stop and ask
A cited function no longer matches; a check would block a PR that follows every rule; a task needs a file outside its owned paths, a dependency or a paid service; a test you were given fails for another reason. Push your branch, `--report blocked` with the evidence, and end the session.

## Status
One line per task, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live (D-134).
