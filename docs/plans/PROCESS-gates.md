# Packet PROCESS-gates: one door to main, a review gate that machines enforce, unique decision IDs, a weekly scorecard, and a post-merge review of what slipped through (D-166)

> Read `docs/BRIEF.md` first, then this packet. Each section is one queue row. They are picker-style scripts that run inside the existing required CI step (`scripts/scope-check.mjs`): no workflow edit, no product code, no money path, no flag.

| Field | Value |
|---|---|
| Decisions | D-166 (this packet's rulings), D-082, D-085, D-109, D-134, D-151, PICKER-owns-scope (`scripts/scope-check.mjs`), the Oct 23 merge-policy amendment |
| Rows | `PROCESS-queue-gate` (Tier 2), `PROCESS-review-gate` (Tier 2), `PROCESS-id-check` (Tier 3), `PROCESS-scorecard` (Tier 3), all in lane `process`; `POSTMERGE-oct22-review` (Tier 1, lane `audit`) |
| Verified against | `main` `dd849c48` (Oct 23, 20:01 IST); the numbers in §0 come from the GitHub API on Oct 23 |

## 0. Why (the numbers, Oct 19-23)
- 78 pull requests merged; 40 changed product code. Of 38 product-code merges checked, **23 matched no queue row**, including four with migrations and about twenty on money paths (credits, plans, checkout, money copy). Their only "review" was the Copilot bot reporting that it could not review because of a quota limit (#482, #501, #534 and the rest).
- Median time from opening to merge for product code: **18 minutes**.
- One unauthorized money change merged and was reverted (#471, #486). One accidental deletion merged and was restored (#534, #535).
- The governed path meanwhile stalls. On Oct 23: 50 board reports, 16 of them "blocked" (packet scope, review routing, ownership), 4 landings. Decision IDs collided twice and migration numbers three times (0108).
- `main`'s CI and both deploys were green on every run since Oct 19, and production is healthy. The problem is not quality of the green path; it is that a second, unreviewed path exists beside it.

The rule this packet enforces is already the rule (D-074, D-082, D-085, D-151). It fails because it lives in prose. A required CI step stops a merge; a paragraph does not.

## PROCESS-queue-gate: a PR merges only through a queue row
- **New** `scripts/queue-gate.mjs` (run as `node scripts/queue-gate.mjs`), modelled on `scripts/scope-check.mjs`. It reads `docs/plans/assignments.json` from `origin/main`, the PR head branch from `GITHUB_HEAD_REF` (else the current branch), the changed files from `git diff --name-only origin/main...HEAD`, and the PR labels from the JSON at `GITHUB_EVENT_PATH` (`pull_request.labels[].name`).
- **It passes when any one holds:**
  1. The branch equals some row's `branch`.
  2. The branch is `agent/architect/<slug>`, `agent/review/<slug>` or `agent/heartbeat/<slug>`, where `<slug>` is `slugOf(row.branch)` of some row (`slugOf` from `scripts/nextTaskCore.mjs`).
  3. The branch starts with `claude/` and every changed file is a document: under `docs/`, a root `*.md`, `.github/*.md`, `.github/copilot-instructions.md`, under `app/docs/`, or `docs/plans/assignments.json`. These are the CEO's decision PRs.
  4. The branch starts with `dependabot/`.
  5. The PR carries the label `owner-direct`. Only the owner adds it; the script prints a warning line naming the PR whenever it passes on this label.
- **Otherwise it exits 1** with: "This branch matches no queue row. Nothing merges to main outside the queue (D-166). Ask the CEO for a row in docs/plans/assignments.json, or work on the row's own branch."
- **It fails open**, with exit 0 and a warning, only on its own internal error (no git, no task list), exactly as `scope-check.mjs` does.
- **CI, with no workflow edit:** `scripts/scope-check.mjs` already runs as `node scripts/scope-check.mjs --branch` in the required `typecheck` job. Its `main()` calls the queue gate first, and a no-row branch now fails instead of passing open. Do not edit `.github/workflows/ci.yml`: `D-048-F-flags` owns it.
- **Tests first** (`scripts/queueGate.test.ts`, pure function `queueGateViolation({ tasks, branch, changed, labels })` exported for tests). Each of the five pass rules passes. An `agent/instinct/x` branch with no row fails. A `claude/` branch that also changes `server/db.ts` fails. A `dependabot/` branch passes. Unknown structure in the task list fails open. Every existing open row's branch passes (read the real `assignments.json`).
- **Owns:** `scripts/queue-gate.mjs`, `scripts/queueGate.test.ts`, `scripts/scope-check.mjs`, `scripts/scopeCheck.test.ts`, `docs/DELEGATION.md` (§7: one line). The `AGENTS.md` living-map line is added by the CEO's next docs PR, because `D-099-bonus-pages` owns `AGENTS.md`.

## PROCESS-review-gate: a Tier 1 row merges only after an independent pass on its exact head
- **`scripts/next-task.mjs --verdict pass|findings`** now records the head it reviewed. The marker body (second `-m`) is `reviewed <sha>`, where `<sha>` is the tip of the task's branch on origin at verdict time (`tip(task.branch)`). `markerSubject` is unchanged, so every existing reader keeps working. Add `parseMarker` support for the body only where the gate needs it.
- **New** `scripts/review-gate.mjs`. It finds the row exactly as the queue gate does (rules 1-2). For a Tier 2 or 3 row, or no row, it exits 0; the queue gate handles the no-row case. For a Tier 1 row it reads the row's review lock (`agent/review/<slug>`, `reviewLockOf`) and passes only when all of these hold:
  1. The newest stage marker is `Verdict … pass`, or a `Land claim` whose nearest earlier verdict is a pass.
  2. That verdict's `reviewed <sha>` is the PR head, or every commit in `<sha>..HEAD` that is not on `origin/main` is a merge commit (`git rev-list --no-merges <sha>..HEAD --not origin/main` is empty). A merge of `main` after the review keeps the pass; a new commit of the branch's own does not. Fix-forward (Oct 30, after #819 was blocked): the status commit the landing steps make after the review also keeps the pass — a commit that changes only `"status"` lines of `docs/plans/assignments.json` and lines inside the `## Status` section of a `docs/plans/*.md` packet (`isStatusOnlyChange`).
  3. The verdict's author's model (`modelOf`) is neither a builder's nor a fixer's model on that task (the same sets `did()` uses: claims and takeovers on the task branch, `Fix claim` and `Fixed` on the lock), per D-151.
- **Fail message:** "Tier 1: this head has no independent passing review (D-074, D-151). Run node scripts/next-task.mjs to get a review." A bot comment is never a review.
- **CI:** `scripts/scope-check.mjs`'s `main()` calls it right after the queue gate; no workflow edit.
- **Tests first** (`scripts/reviewGate.test.ts`, pure `reviewGateViolation(...)`):
  - pass on the exact head;
  - pass after a merge of `main` only;
  - fail after a non-merge commit;
  - fail when the reviewer's model also built or fixed the work;
  - fail with findings as the last verdict;
  - pass for Tier 2;
  - verdict markers written before this change (no body) fail for a Tier 1 row with a message telling the reviewer to re-record the verdict on the current head.
- **Owns:** `scripts/review-gate.mjs`, `scripts/reviewGate.test.ts`, `scripts/next-task.mjs`, `scripts/nextTaskCore.mjs` (switch only), `scripts/nextTask.test.ts`, `scripts/scope-check.mjs` (switch only), `docs/DELEGATION.md` (§6: one line).
- **Depends on:** `PROCESS-queue-gate` (the same `scope-check.mjs` hook and the same row lookup; reuse its exported function).

## PROCESS-id-check: a decision ID or migration number never lands twice
- **New** `scripts/decision-id-check.mjs`. It reads the IDs `| D-NNN |` at the start of table rows in `docs/DECISIONS.md` on the PR head and on `origin/main`. It fails when:
  - the head has an ID twice; or
  - an ID the PR adds already exists on `origin/main` with different text in its first 120 characters (a collision, not the same row merged twice); or
  - a new `drizzle/deploy/NNNN_*.sql` file uses a number `origin/main` already has. The migration lint checks uniqueness inside one tree, not against `main`.
- **Fail message** names the ID or number and the next free one on `main`.
- **CI:** called from `scripts/scope-check.mjs` after the review gate; no workflow edit. **Tests first:** duplicates, a collision, a clean addition, a migration collision.
- **Owns:** `scripts/decision-id-check.mjs`, `scripts/decisionIdCheck.test.ts`, `scripts/scope-check.mjs` (switch only).
- **Depends on:** `PROCESS-review-gate` (the same hook).

## PROCESS-scorecard: the weekly numbers every CEO session starts from
- **New** `scripts/scorecard.mjs`. It uses the same GitHub access as `scripts/next-task.mjs`; the proxy refuses `repositories/<id>` page links, so use one `per_page=100` call per state, sorted by `updated`, and say how many days the sample covers. It prints, for the last 7 days:
  - merged PRs by kind (product code, tests only, scripts, docs only), with the same path rules as §0;
  - product-code merges with no matching row, and Tier 1 merges whose head had no independent passing verdict;
  - median and longest open-to-merge time;
  - reverts;
  - board reports by status, and blocked reports per task;
  - the live API and web SHA (`/api/health`, `<meta name="git-commit">`) against `main`.
- **Output:** plain text, one line per number, no personal data (the repo is public).
- **Owns:** `scripts/scorecard.mjs`, `scripts/scorecard.test.ts` (the pure classifier), `docs/DELEGATION.md` (one line: the CEO review starts from `node scripts/scorecard.mjs`).
- **Depends on:** `PROCESS-id-check` (lane order only).

## POSTMERGE-oct22-review: review what reached main without review (Tier 1)
These merged with no independent review and touch live money paths or ran migrations in production. Review them as they are on `main` (the D-149 post-landing pattern):
- #465 API input checks (malformed JSON 400, checkout quantity and unknown keys);
- #478 per-credit range from live packs and the retired single credit on `/premium`;
- #534 and #535 pricing-pack copy and the restored `drizzle/0000_bouncy_victor_mancha.sql`;
- #506 and #517 money-check changes (aged-out checkouts, promo spends);
- #482 `askCosts` (migration 0106) and #490 `seekerLevels` (migration 0107), both applied in production;
- #479 admin access-denied sign-in;
- #510 the D-152 names on the flag-off pages.

The D-132 item merges (#487, #498, #501, #503) are covered by `D-132-audit`; do not review them twice.

- **Who:** a model other than Instinct (D-151).
- **Checklist per PR:**
  1. What a live user can now see or send, and whether it is right.
  2. Every money line comes from `shared/moneyCopy.ts` and matches `docs/PRICING.md` (D-146).
  3. Each migration is additive, idempotent, mirrored in `server/schemaReconcile.ts`, and its number is in plan §5.
  4. No test was weakened or deleted (compare the PR's test diff).
  5. No file was deleted by accident (the #534 class: list every deleted file).
- **Output:** a findings list on this row's pull request (`agent/queue/postmerge-oct22-review`, docs only: `docs/plans/POSTMERGE-oct22-findings.md`). Each finding becomes a fix row the CEO queues. No code change in this row.

## Definition of done (each row)
Red-first tests; the gate on the merged result; required CI green; the row's Status line here; `--report landed`. Each gate must pass on its own PR, which it does because that PR's branch is a row.

## Stop and ask
- An open row's branch fails the queue gate: its row is wrong. Report it; do not widen the rules.
- A Tier 1 PR that already passed review fails the review gate only because its verdict predates the `reviewed <sha>` body. That is expected: the reviewer re-records the verdict on the current head (`--verdict pass`), and nothing is waived.

## Operating notes (Oct 24; added by the instruction sync - not part of any row's build spec)

- **Availability is not a gate (D-195).** Claude Code's CEO seat is decision support; no queue step halts solely because one model or session is down. Read D-195 before treating "wait for the CEO session" as binding.
- **Review-identity preflight.** Branch protection requires an approval and one GitHub identity cannot approve its own submission, so a single-operator merge stays blocked until a second identity reviews. Check the review route BEFORE planning a merge, never after (surfaced Oct 24 during the post-merge review sequence).
- **Blocked-task recovery, Oct 24.** (a) PROVEN end to end: landing the row's real deliverable stops a blocked row from gating with no CEO session - the picker counts a todo row done once its branch lands; the report itself stays in the report log (POSTMERGE-oct22-review via #619, verified through the actual picker output). Other recovery shapes are untested. (b) ROOT CAUSE REPRODUCED, not a proven end-to-end recovery: TS2688/TS5101 in a fresh worktree means dependencies were never installed - run `pnpm install` before `pnpm check` (REGISTER-520). The full typecheck was never re-run to green in the investigation sandbox (resource cap), and the affected session's worktree install/rebase/green stay unverified.
- **Takeover path (D-195's first application, Oct 24).** With the CEO session down, the owner authorized a one-time bounded exception (owner like-reaction Oct 24, 14:28:21 IST to the explicit question phonemsg-01M5PJ2SJFC6SWWD7M56WANVPH naming the four PRs): #619, #628, #629 and #631, each at an exact head with an independent pass and green CI, landed under that exception. It expired when consumed - a reference for how a takeover is scoped, not a standing route.

## Status
- PROCESS-queue-gate: done — PR #603 head `f5e23174` (latest main `5747cc87` merged); full local gate and all 4 PR checks passed.
- PROCESS-review-gate: done — PR #836, gate head `d719cdaa` (latest main `6b6544dd` merged); full local gate and all 4 PR checks passed. Fix-forward (Hark · efac, 2026-10-30, D-082): #836 failed every Tier 1 landing, because the landing's own status commit came after the reviewed head (#819, head `653125b4` after `9f66f1ed`); the gate now lets that status-only commit through and still fails any other commit after the review.
- PROCESS-id-check: done — PR #839, gate head `585499be` (latest main `c645870c` merged); full local gate passed (check, tokens, migration lint, deploy triggers, vitest 563 files, build); PR checks green on the landing head.
- PROCESS-scorecard: done — PR #840, gate head `dba936e4` (latest main `3d13d88a` merged); full local gate passed (check, tokens, migration lint, deploy triggers, vitest 564 files / 5197 tests, build); PR checks green on the gate head.
- POSTMERGE-oct22-review: done — findings doc landed as #619, all four follow-ups fixed on `main` by `POSTMERGE-oct22-fixes`, dispositions recorded by #775 (`3928f002`); the OpenAI block cleared by D-228.
- Registry note (WorkBuddy AI · 8c8a, 2026-10-28): this row's deliverable landed as #619 and all four of its findings are fixed on `main` by `POSTMERGE-oct22-fixes`, so the row itself is complete and its `assignments.json` status is the only thing still saying `todo`. The picker keeps returning it because the branch was recreated by a claim marker after the merge, which hides the landing (the `PICKER-landed-marker-continuity` row). Flipping the row to `done` is the CEO's act; this session did not edit the registry.
- Closure (Deepseek-V4.1-Flash · 3196, 2026-10-28): the flip above is now recorded — D-228 moves this row to `done` in `assignments.json` and clears the standing block. The scope failure that produced the block was the row working as designed: it owns only the findings doc and permits no code change, so the fixes belonged to `POSTMERGE-oct22-fixes`, which delivered them.
