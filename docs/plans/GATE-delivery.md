# Packet GATE: nothing broken reaches `main` (D-212)

> Read [`docs/BRIEF.md`](../BRIEF.md), [`ENTERPRISE-PIPELINE.md`](ENTERPRISE-PIPELINE.md) and [`PROCESS-gates.md`](PROCESS-gates.md) first. Written by Claude Code as CEO (D-085, D-212) on Oct 26 2026. D-166 already enforces one door to `main` (`PROCESS-queue-gate`, live) and an independent Tier 1 pass on the exact head (`PROCESS-review-gate`); this packet adds the tester, QA and status-board roles on top. Several tasks share this packet (D-134): the picker hands out one at a time; do only the task it prints, and write your status line in the Status section at the end. Line numbers drift: find each function by name first. The register wins any conflict.

| Field | Value |
|---|---|
| Verified against | `main` `927dfaca`, register through D-206, on 2026-10-26; every fact below was re-checked by an independent read-only review that day |
| Decisions | D-212 (this packet), D-200, D-205, D-166, D-151, D-134, D-082 |

## Rules for every task here
1. **A gate is a machine check.** It reads git, the PR or a marker. It never trusts a sentence in a PR body, except the one this packet names (the "Ported assertions" table).
2. **Fast.** Each new check finishes in under a minute, except the e2e job, which runs in parallel with the others and takes under 10 minutes. A docs-only PR passes each check at once. Never put a workflow `paths:` filter on a check that may become required: a filtered required check stays pending forever.
3. **Fail closed on a definite breach, open on a broken tool**, as `scripts/scope-check.mjs` does. A check that cannot run warns and passes; a check that finds a breach fails.
4. **Required checks need the owner's word** (D-212 (6)). Each task lands its check as a CI step or job; once it has been green on `main` for 3 days, any session asks the owner to add it to ruleset 25433342.
5. **Speed first** (D-200 (4)). Tier 2 and 3 land on green required CI with no separate review. Tier 1 keeps one independent review by a model that neither built nor fixed the work (D-151). Nothing in this packet adds a second pre-landing approval.
6. **Landing.** Red-first tests; the gate on your commit merged with `origin/main`; CI green on the exact head.
   - Land with GitHub's merge-commit button (`gh pr merge <number> --merge`; never `--admin`, `--squash` or `--rebase`, D-134 (6), D-200), even though the picker's printed step still says `git push origin <sha>:main` until BRANCH-HYGIENE-2 rewrites it.
   - In the landing pull request, set this row's `status` to `done` in `docs/plans/assignments.json`: the merge button deletes the branch, and the picker sees only the newest 100 closed pull requests.
   - After the live check, delete your review lock and heartbeat (D-205 rule 3).
7. **Nothing waits for one session** (D-200 (2)). Where a step says "report", push your branch and `--report blocked`; any other session may amend this packet, widen a row's `owns` or correct its tier.

## GATE-test-integrity: tests can be added, not quietly removed (lane `ci-checks`, Tier 2)
**Why.** #431 removed 107 `expect(` lines from `client/src/pages/ask.test.tsx` and added 49 (`git diff d3da2497^1 d3da2497`). #426 deleted the assertions that pinned the `/queue` attestation. Both PRs went green and shipped live regressions (`LIVE-OCT22-regressions.md`). No check counts assertions.

**What.** `scripts/test-integrity.mjs` (I/O) and `scripts/testIntegrityCore.mjs` (pure). It runs from `scripts/scope-check.mjs` next to `runQueueGate()`, so the required `typecheck` job runs it with no workflow edit (D-166 (2)), and only for a pull request: it reads `GITHUB_EVENT_PATH`, and with no `pull_request` in the event it passes at once. It fetches `origin/main` itself, as `scripts/scope-check.mjs` does, diffs the PR head against its merge base, and fails when:
1. a `*.test.ts` or `*.test.tsx` file is deleted or renamed away, unless the task's `owns` names it (the scope check's retirement rule);
2. a changed test file adds `.only(`;
3. a changed test file adds `.skip(`, `.todo(`, `it.skip`, `test.skip`, `describe.skip` or `xit(`;
4. a changed test file ends with fewer assertion lines than it started with (lines matching `expect(` or `assert`), unless the PR body has a table under the heading `Ported assertions` with a row that names the file and says where each removed assertion now lives (D-136 (2)(b));
5. a **pinned** test file loses any assertion line at all, table or not, unless a commit on the branch carries `test-integrity: <file> — D-<n>`, naming the decision that changed the rule. The pinned files are one exported list in `scripts/testIntegrityCore.mjs`:
   - `client/src/pages/loginRule.test.tsx`;
   - `client/src/pages/signIn.test.tsx`;
   - every `server/*.test.ts` whose name contains `creditLedger`, `dailyMoneyCheck`, `payment`, `refund` or `chargebee`.

**The PR body.** The script reads it from the event file at `GITHUB_EVENT_PATH` (`pull_request.body`). A re-run replays the original event, so a table added after a red run takes effect with the next push; an empty commit is fine. Never interpolate the body into a shell line. Add the `Ported assertions` heading to `.github/pull_request_template.md`, with one sentence on when to fill it and the note about pushing again.

**Tests** (red first, `scripts/testIntegrity.test.ts`, on diff-text fixtures):
- Each of rules 1-5 fails on its case and passes on its control.
- A PR that only adds tests passes.
- A moved assertion with a table row passes rule 4 but not rule 5.
- A docs-only diff passes at once.
- A push to `main` (no `pull_request` in the event) passes at once.

**Owned paths.** `scripts/test-integrity.mjs`, `scripts/testIntegrityCore.mjs`, `scripts/testIntegrity.test.ts` (new), `scripts/scope-check.mjs (switch only)`, `.github/pull_request_template.md` (one heading).

**Done:**
- Tests pass, and CI is green with the check running on this very PR.
- Landed.

## GATE-e2e-journeys: the core journeys run in a real browser on every PR (lane `e2e`, Tier 2, after CI-architect-real-checks, which owns `.github/workflows/ci.yml`)
**Why.**
- **Unit tests did not see them.** CI runs Vitest only, and both Oct 22 regressions crossed pages and sign-in.
- **Nothing runs Playwright.** Playwright 1.62.1 is already a devDependency (`package.json`), and its test runner ships inside it (`playwright/test`). Five scripts use it (`scripts/kit-screens/capture.mjs`, `scripts/live-flow-audit.mjs`, `design/goal-ui/tools/render.mjs`, `design/goal-ui/tools/capture-live.mjs`, `design/goal-ui/pick/src/gate.mjs`), and no workflow runs any of them.
- **No migration check before production.** The first time a deploy migration runs against MySQL is `migrate-db` in the production deploy.

**What.**
1. **A real database.** There is no in-memory store at runtime: `getDb()` in `server/db.ts` returns null without `DATABASE_URL`, its functions then throw "Database unavailable", and `/api/dev-auth/login` answers 503. The job runs a `mysql:8.0` service container, free on GitHub Actions. It builds the schema the way production has it:
   - `pnpm exec drizzle-kit migrate` for `drizzle/*.sql`;
   - then `scripts/apply-deploy-migrations.sh` with `DB_HOST=127.0.0.1`, `DB_USER=root`, `DB_NAME=skipwait` and `MYSQL_PWD` set to the service password, run **twice**. The second run must apply nothing, which proves runner and ledger idempotence (already-recorded migrations are skipped without error); this replaces the separate migration-apply row.
   - If the migrations do not apply from an empty database, use `pnpm exec drizzle-kit push`, say so in the PR, and leave `GATE-migration-apply` open.
2. **The server.**
   - Run `pnpm build`, then start `node dist/index.js` with:
     - `NODE_ENV=test` (under `NODE_ENV=production` with no WorkOS keys, `workosConfigured()` throws at boot);
     - `DATABASE_URL` pointing at the service;
     - no WorkOS keys, so the dev sign-in plane `registerDevAuthRoutes` is on;
     - test values for `JWT_SECRET`, and `VITE_APP_ID=skipwait`.
   - Seed with `scripts/seed-test-accounts.ts`, which creates a seeker, a verified referrer and an admin, and with the app's own API. Never write rows by hand.
   - Journeys sign in by POSTing to `/api/dev-auth/login` or with the seeded sessions.
3. **The specs.** `e2e/playwright.config.ts` with `testMatch: "*.e2e.ts"` (Vitest's include list is explicit, so it never collects them), one `e2e/<journey>.e2e.ts` per journey, and `scripts/e2e-server.mjs` for steps 1 and 2. Import `{ test, expect }` from `playwright/test`, never from `@playwright/test`, which is not a dependency.
4. **Journeys.** Each also fails on any page error or any 5xx response during the run.
   - **A personal link survives sign-in.** Open a referrer's personal link signed out, write the request, press Send, sign in on the dev plane, and assert the request's POST carries `fastTrackCode` (P0-ask-link-signin).
   - **The attestation is shown before Accept.** As a verified referrer on `/queue`, select a request. The line "By accepting, you confirm you'll refer only through {company}'s official process." is visible, Accept posts `ethicsConfirmed: true`, and Pass never does. P1-queue-attestation is live (`client/src/pages/MyCompanyInbox.tsx`), so this journey runs from the first PR.
   - **The cost is shown before every request.** The compose screen shows the cost line before Send.
   - **Withdraw returns the referral.** Send a request and withdraw it before pickup. The balance, read as the screen labels it ("referrals", D-180), goes back up by the cost the compose screen quoted.
   - **Referrers sign in with a work email only.** `/sign-in` with "Give a referral" offers the work-email code and no social or personal-email option (the login rule, D-030).
   - **Plans read the server catalog.** `/plans` shows the prices `/api/plans/catalog` returns.
5. **CI.** A job `e2e journeys` in `.github/workflows/ci.yml` runs on `pull_request` and on `push` to `main`.
   - It runs `pnpm exec playwright install --with-deps chromium`, with the browser cached.
   - Its first step exits green when the diff touches only `docs/**` or `*.md` (rule 2; no `paths:` filter). The diff is read with `git diff --no-renames --name-only "$BASE_SHA...$HEAD_SHA"` (D-239 (6)): rename detection is on by default, so a plain `--name-only` lists only the new path when a runtime file is renamed into `docs/`, and the journeys would skip a runtime change.
   - On failure it uploads the Playwright trace and screenshots as an artifact.
6. **`package.json`:** one script line, `"e2e": "playwright test -c e2e/playwright.config.ts"`. No new dependency.

**Tests.** The journeys are the tests. Prove each catches its bug: in the PR, link a CI run where the personal-link journey fails against a throwaway branch that reverts the P0 fix (never pushed to `main`), next to the green run.

**Owned paths.** `e2e/`, `scripts/e2e-server.mjs`, `.github/workflows/ci.yml` (the new job only), `scripts/ciMarkerSkip.test.ts` (the two exact-count assertions and the per-job blocking-step assertions, added by D-239), `package.json` (one script line). The `AGENTS.md` "Validation commands" text goes at the end of your done line here (`— map: ...`); any session folds it in.

**Done:**
- Six journeys green on `main`, with the red run linked.
- The deploy migrations applied twice.
- The job under 10 minutes.

## GATE-tier-floor: the tier is computed from the paths, not only declared (lane `process`, Tier 2, after PROCESS-review-gate)
**Why.** `PROCESS-review-gate` (D-166) asks for an independent pass when a row is declared Tier 1, but the tier is written by hand. A money or sign-in change can sit in a row declared Tier 2. #415 (refund keys), #437 (password sign-in for reviewer accounts) and #439 (migration 0101) are Tier 1 by `docs/DELEGATION.md` §3, and each merged 5 to 13 minutes after opening, with no review.

**What.**
1. **`scripts/tierClassifyCore.mjs`** (pure) maps changed paths to a tier, in one exported constant with a comment per entry, so any session can amend it. Test files alone never raise the tier.
   - **Tier 1:**
     - Database migrations: `drizzle/**`.
     - Money and payments: `server/creditLedger.ts`, `server/payments.ts`, `server/paymentWebhooks.ts`, `server/chargebee*.ts`, `server/paymentRefund*.ts`, `server/cardValidation.ts`, `server/dailyMoneyCheck.ts`, `server/coverageDelivery.ts`, `server/heldAsk.ts`.
     - Sign-in, sessions and identity: `server/_core/workosAuth.ts`, `server/_core/sdk.ts`, `server/_core/otpLogin.ts`, `server/_core/seekerEmailCode.ts`, `server/_core/context.ts`, `server/_core/reviewerLogin.ts`, `server/_core/devAuth.ts`, `server/_core/sessionRenewal.ts`, `server/passwordResetRoutes.ts`, `server/workosWebhooks.ts`, `server/workEmailOtp.ts`.
     - Privacy: `server/referrerDocumentAccess.ts`, `server/referrerAskView.ts`, `shared/referrerAskView.ts`, `server/blockedPairs.ts`, `server/privateReferralRoutes.ts`.
     - Secrets: `src/worker.ts`, which forwards every secret.
     - Shared money rules: `shared/creditLedger.ts`, `shared/planCatalog.ts`, `shared/planFamily.ts`, `shared/moneyCopy.ts`, `shared/referrerPurchases.ts`.
     - Client sign-in and money surfaces: `client/src/components/*SignIn*.tsx`, `client/src/pages/*SignIn*.tsx`, `client/src/pages/Ask.tsx`, `client/src/pages/MyCompanyInbox.tsx`, `client/src/pages/Plans*.tsx`, `client/src/components/plans/**`.
     - `server/db.ts`, when any added or removed line, or the name of the function a hunk sits in, matches `/credit|spend|refund|ledger|payment|wallet|grant|chargebee|tokenBalances|tokenTransactions|coverage|withdraw|referrerReviewEmailLinks|blocked/i`. A name-only rule misses `createCompanyReferralRequest` and `deliverWaitingAskTx`, which spend through `spendCreditsTx` (defined in `server/creditLedger.ts`).
   - **Tier 2:** everything else under `server/`, `shared/`, `client/src/`, `functions/` and `.github/workflows/`.
   - **Tier 3:** docs and packets alone.
2. **`scripts/review-gate.mjs`** uses the higher of the row's declared tier and the computed tier. Its failure message says which paths made the change Tier 1: "This change touches <paths>, which are Tier 1 (D-212). It needs an independent pass on its head; correct the row's tier in docs/plans/assignments.json (any session, D-200 (2))."

**Tests** (red first):
- The classifier on each listed path.
- #437's file list classifies as Tier 1.
- A `server/db.ts` diff that changes a `spendCreditsTx(` call inside `createCompanyReferralRequest` is Tier 1, and one in an unrelated function is Tier 2.
- A tests-only diff and a docs-only diff (Tier 3).
- The review gate fails a declared Tier 2 row whose diff is Tier 1 by path, and passes it once an independent pass on the head exists.

**Owned paths.** `scripts/tierClassifyCore.mjs`, `scripts/tierClassify.test.ts` (new), `scripts/review-gate.mjs`, `scripts/reviewGate.test.ts`.

**Done:**
- Tests pass and CI is green.
- Landed.
- One real PR showing the message.

## PICKER-fullstack-lights: the board shows the lights, and a red live release holds every landing but its fix (lane `picker`, Tier 2, after REL-release-verify, REL-watchdog, PROCESS-review-gate, PICKER-review-wording, PICKER-architect-landing, PICKER-decision-sync, BRANCH-HYGIENE-2, PICKER-avoid-unblock and PICKER-avoid-land, which edit the same files — every one of these is a **serialization** edge forced by `owns` overlap (PICKER-owns-scope, D-223 (1)), not an output need; PICKER-decision-sync landed (`86559ba7`) so its edge is inert, BRANCH-HYGIENE-2 is held for the owner (D-232), and the edge clears by narrowing `owns` to a declared anchor (D-200 (2)) rather than by preference)
**Why.** The picker reads only `main`'s CI (`scripts/next-task.mjs`). A failed deploy, an unverified release, an outage or an overdue job never shows on the board, so agents keep landing features on top of a broken production. `PROCESS-scorecard` reports weekly; this is the live view.

**What.**
1. **`--status` prints**, for the live release, lights 1 to 7 of `ENTERPRISE-PIPELINE.md` §4:
   - `main` CI;
   - the newest Deploy API and Deploy Web runs on `main`;
   - the API and web SHAs live (`/api/health` and the `git-commit` meta);
   - `release/verified` on the web SHA;
   - light 6: open issues titled `SkipWait DOWN` (REL-watchdog), plus `/api/health/jobs` (`ok`) once REL-heartbeats is live;
   - light 7: open issues labelled `incident`.
2. **A red light holds landings only.** Any red among lights 4 to 7 on the live SHA withholds every `land` hand-out except fix-main and the rows that fix that incident. Builds, reviews, fixes and packets continue (D-109, D-200). The fix is handed out first, as fix-main is today, and its steps tell the agent to revert the landed commit first when that release is code-only and the commit caused it.
3. **An unreadable light** prints `unknown` and never holds anything by itself.

**Tests** (red first):
- Each light's red, green and unknown state from fixture data.
- A red light 5 withholds `land` but still hands out a build.
- An unknown light holds nothing.

**Owned paths.** `scripts/next-task.mjs`, `scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs`, `scripts/nextTask.test.ts`. The `AGENTS.md` rule 6 and "Agent work queue" text goes at the end of your done line here; any session folds it in.

**Done:**
- Tests pass and CI is green.
- Landed.
- A `--status` print in the PR.

## PICKER-qa-stage: someone who did not build it uses the change like a user (lane `picker`, Tier 2, after GATE-e2e-journeys, GATE-tier-floor, D-048-F-harness and PICKER-fullstack-lights)
**Why.** Nobody checks a UI change at 1280 and 390, through its loading, empty and error states, against its approved comp, except the builder itself (AGENTS.md rule 8).

**What.** The QA steps are written once, in `docs/QA-CHECKLIST.md` (new):
- check out the head;
- run `pnpm e2e`;
- capture every changed screen at 1280 and 390 with the goal harness (`node scripts/kit-screens/capture.mjs --goal <ids> --viewport both`, fixtures only, never production data);
- walk the loading, empty, error and offline states, keyboard use and 390 overflow;
- compare with the approved comp in `design/goal-ui/` and the money lines with `shared/moneyCopy.ts`;
- post the captures and findings as one PR comment.

They are used two ways, and neither adds a second approval (D-200 (4)):
1. **A Tier 1 change** (the computed tier, GATE-tier-floor) that touches `client/src/pages/**` or `client/src/components/**`. The one independent review runs the QA steps. `scripts/nextTaskText.mjs`'s review step prints them, and the reviewer records the result in the same `Verdict` marker, so `scripts/review-gate.mjs` needs no separate QA marker.
2. **A Tier 2 or 3 change** that touches those paths lands on green CI. A new kind `qa` is handed out after landing, within 24 hours, against the landed commit, never to a model that built or fixed the work (D-151).
   - The QA session pushes `QA <id>: pass — <who>` or `QA <id>: findings — <who>` on `agent/review/<slug>`, with the body `reviewed <sha>` (the format `PROCESS-review-gate` uses).
   - `scripts/next-task.mjs` gets a `--qa pass|findings` flag that pushes the marker, and reads each landed PR's changed files to decide whether it touched those paths.
   - Findings become fix rows that any session queues.

**Tests** (red first, `scripts/nextTask.test.ts`):
- A landed Tier 2 UI PR gets a `qa` stage; a server-only PR does not, and neither does a Tier 1 PR (its review covers it).
- The builder's and fixer's models never get it.
- A QA pass on an older commit does not count.
- The Tier 1 review step prints the QA steps.

**Owned paths.** `scripts/next-task.mjs` (the `--qa` flag, the `qa` claim and the PR file read), `scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs`, `scripts/nextTask.test.ts`, `docs/QA-CHECKLIST.md` (new). A one-line link from `docs/DELEGATION.md` §6 is added by the next registry pull request.

**Done:**
- Tests pass and CI is green.
- Landed.
- The first real QA marker on a landed UI PR.

## GATE-migration-apply (architect, Tier 2): only if the e2e job cannot apply the migrations from empty
GATE-e2e-journeys applies the deploy migrations twice to MySQL. This row stays open only if that PR finds the migrations cannot apply from an empty database. In that case, any agent writes the packet from that PR's finding (a baseline snapshot of the production schema, D-100); otherwise the row is closed as done by GATE-e2e-journeys.

**That finding held (D-239).** On `main` the journal step always falls back to `drizzle-kit push`; see CI run 41260983242 and its `0017_careful_ricochet.sql` warning. This row's packet is now [`GATE-migration-apply.md`](GATE-migration-apply.md), written 2026-11-01. It uses the base revision's `schema.ts` instead of a production dump, so it needs no owner item or production access. The reasons are in that packet's §3 and §4. GATE-e2e-journeys' done line below says the job builds the schema "from empty". In fact only its fallback `push` does; it is left unedited as that row's record.

## Status
One line per task, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live (D-134).

GATE-test-integrity: done — e425fac9 (PR #846)
GATE-tier-floor: done — 0899a26a (PR #862; built by DeepSeek V4.1 Flash 1017 · s38fcc2f0 at 2cbe6f33, gate/PR/land finished by the Cline · b579 takeover). Gate proof: `pnpm check` 0, `scripts/` 28 files/925 tests, full `pnpm vitest run` 5316 passed with 6 load-flakes in `scripts/classifyCiChange.test.ts`, `server/chargebeeRoutes.cardValidation.test.ts` and `client/src/pages/startGoal.test.tsx` that each pass alone (70/70), token audit, migration lint, deploy triggers and `pnpm build` all 0, `scope-check` inside the row's owns; the new message reproduced locally on a scratch Tier 2 tree that touches `server/dailyMoneyCheck.ts` — "Tier 1: this change touches `server/dailyMoneyCheck.ts`, which are Tier 1 (D-212)…" — the first real Tier 2 row that touches a Tier 1 path will show it in CI (none exists today, so that instance is unverified)

GATE-e2e-journeys: done — 629a2167 — built by Hark · 2979, landed by Qoder · 3415 — six core journeys in a real browser against a real MySQL on every pull request and every push to main (personal link survives sign-in, queue attestation before Accept, cost before Send, withdraw returns the referral, work-email-only referrer sign-in, plans read the server catalog), `scripts/e2e-server.mjs` builds the schema from empty and applies the deploy migrations twice, and the `e2e journeys` job in `.github/workflows/ci.yml` runs green on the PR (red run against the throwaway branch 41023432494 fails only the personal-link journey); the #748 pin names the e2e job and pins each required job's own blocking commands (D-239), and its docs-only diff reads `--no-renames`. — map: Validation commands gain `pnpm e2e` (the six journeys in `e2e/*.e2e.ts`, served by `scripts/e2e-server.mjs`; CI job `e2e journeys`).
