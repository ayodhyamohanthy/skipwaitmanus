# Independent Tier 1 docs-only review: PR #775 (POSTMERGE-oct22-review)

- **Reviewed head:** `0f44302377c996049648ca4021132ba6bfde41c0`. No commits after it on the branch (`git log <reviewed>..origin/agent/queue/postmerge-oct22-review ^origin/main` is empty).
- **Against main:** `a4b022a5`. The PR's recorded base is `e931ed79` and it is 47 commits behind.
- **Builder:** WorkBuddy AI · 8c8a (commits `7804c212`, `00628cfb`, `0f443023`, plus claim marker `27f24673`). The reviewer is a Claude session that did not build or fix this row or `POSTMERGE-oct22-fixes` (D-151).
- **Recommended verdict: findings (two low-severity doc-accuracy items, docs-only fixes).** No money, code, flag or migration risk.

## 1. Scope
- Diff against main: `docs/plans/POSTMERGE-oct22-findings.md` (row `owns`) and `docs/plans/PROCESS-gates.md` (the row's `packet`).
- `scripts/scope-check.mjs:35` always allows the task's packet. Running `node scripts/scope-check.mjs POSTMERGE-oct22-review` in a clean worktree at the reviewed head printed "1 owned path(s), every change inside them", exit 0. **Pass.**

## 2. Claims checked against main `a4b022a5`
| #775 claim | Source | Result |
|---|---|---|
| P1 #482 fixed by `821399d4`; delivery charges the stored row or flat 1 credit | `821399d4` diff: `deliveryCost = storedCost ? storedCost.creditCost : FLAT_ASK_COST` (`server/db.ts`, `deliverWaitingAskTx`); `FLAT_ASK_COST = 1` | Correct |
| P1 test at `server/db.askCostStored.test.ts:366` | line 366: "a waiting ask created with the flag off is delivered at 1 credit after the flag turns on" | Correct |
| P2 #478 fixed by `09891b3b`, test `plans.kit.test.tsx:90` | line 90: "renders the live catalog's per-credit range for USD and INR, never the fallback" | Correct |
| P2 #534 fixed by `91e0b6c8` via `firstPackClaim()` | `shared/planCatalog.ts:172` defines it; used at `client/src/pages/Pricing.tsx:9-10`, `shared/landingContent.ts:17-18`; asserted at `client/src/pages/policyPages.test.tsx:130-131` | Correct |
| P2 #506 fixed by `01928e67` + `5ff7ef2c`; sample takes `agedOutCutoff` | `server/dailyMoneyCheck.ts:469` `listStaleCheckouts(staleCutoff, 3, agedOutCutoff)`; test comment at `server/dailyMoneyCheck.test.ts:569` | Correct |
| All five fix commits on main | `git merge-base --is-ancestor` for each against `a4b022a5` | Correct |
| Row's deliverable landed as #619 | #619 merged 2026-10-24T09:18:56Z as `ad57edb4` | Correct (see F2 on how it merged) |
| `POSTMERGE-oct22-fixes` closed all four | `assignments.json` status `done`; its packet Status: "done — 7a41a1b0 (pass review by Qoder · bbc5 on that exact head)" | Correct as recorded |
| "each with a regression test that fails without the fix" | commit bodies: `821399d4` "Red first ... spent 2 before the fix"; `01928e67` "Red first"; `09891b3b` is a test-only change; `91e0b6c8` says "The rendered wording is unchanged" | **Overstated: F1** |
| Picker keeps returning the row because a claim marker recreated the branch (`PICKER-landed-marker-continuity`) | see §4 | **Partly wrong: F2** |

## 3. Builder's green-CI claim
- Check runs on head `0f443023` (GitHub API, PR #775): `typecheck` success, `unit + component + route tests` success (10:30:45–10:36:55Z), `production build` success, all in CI run `40672692569` (`event: pull_request`, `head_sha: 0f443023…`, conclusion success). `Workers Builds: skipwaitmanus` also succeeded, though it isn't a gate (AGENTS rule 5).
- The run tested the PR merged with base `e931ed79`, and all five fix commits are ancestors of `e931ed79`. So the full unit suite that passed includes the four regression tests. **Verified.**
- The builder's "four files, 57 tests" local count against `ee7386f6` isn't reproduced here (no `node_modules` in this session) and remains the builder's claim. The CI result above stands on its own.
- The PR is `behind` main by 47. Under the Oct 23 merge-policy amendment, a conflict-free docs-only PR needs required CI on the commit that lands, not a fresh full gate. Landing still needs that CI on the up-to-date commit.

## 4. Picker-bug claim, checked against picker source
- How "landed" is computed: `scripts/next-task.mjs:111` sets `merged` only when the branch **tip** is an ancestor of `origin/main`. `scripts/next-task.mjs:225-230` builds `mergedHeads` from only the newest 100 closed PRs sorted by `updated`. `scripts/nextTaskCore.mjs:349` sets `landed = info.merged || mergedHeads.get(work)?.has(info.tipSha)`.
- What actually happened:
  1. **#619 was squash-merged.** `ad57edb4` has one parent (`e2f34457`), and #619's head `f9f381e1` isn't in main's history. That broke the ancestry signal before any recreation, and it also conflicts with D-134 (6) ("never squash or rebase-merge"). That conflict is historical and outside #775's scope.
  2. **The branch was later recreated** from main (`27f24673`, parent `ee7386f6`), so its tip can never equal `f9f381e1`. The `mergedHeads` signal fails too, whether or not #619 is inside the 100-PR window.
  3. **The branch now carries substantive commits** (`00628cfb`, `0f443023`). `PICKER-landed-marker-continuity` S2 covers recreation with *only* empty markers and says a substantive post-merge commit "remains unfinished". So that row, as written, would correctly not mark this branch landed. The relevant clause in that packet is its squash case ("Squash history needs verified merged-PR evidence").
  4. **Why the row is the current pick:** the picker shows `UNBLOCK POSTMERGE-oct22-review` because of OpenAI · c54e's Oct 24 `blocked` reports (`0c4dd467`, `6f65ea21`), not because of the `todo` status alone.

## 5. Findings (verdict: findings)
- **F1 (low, docs accuracy). `docs/plans/POSTMERGE-oct22-findings.md`, new "Follow-up status" paragraph:** "each with a regression test that fails without the fix" overstates two of the four. Only P1 (`821399d4`) and P2 #506 (`01928e67`) record red-first in source. P2 #478 was a missing test, so the test *is* the fix. P2 #534 kept the rendered wording unchanged, so its test pins the catalog source rather than failing on old code. **Fix:** say P1 and P2 #506 are red-first per their commits, and that the P2 #478 and #534 tests pin the catalog-derived values. No test to add first; this is a wording correction.
- **F2 (low, docs accuracy). `docs/plans/PROCESS-gates.md`, the new "Registry note" line (and the PR body):** it blames the invisible landing on marker-only recreation and points to `PICKER-landed-marker-continuity`. Per §4, the root cause is #619's squash merge, then recreation from main. The branch is no longer marker-only, so that row's S2 doesn't apply; its squash clause does. The note also implies the `todo` status is why the picker returns the row, but the current pick comes from the standing Oct 24 `blocked` report. **Fix:** restate it as "#619 was squash-merged (`ad57edb4`), so the tip-ancestry check (`next-task.mjs:111`) can't see it, and the branch was later recreated from main. The squash case is covered by `PICKER-landed-marker-continuity`'s merged-PR-evidence clause. The row is currently surfaced by the Oct 24 blocked report." Keep the "flipping status is not this session's act" sentence.
- **Not findings:** the original finding text is kept as the record, which is correct. The Status line naming `00628cfb` rather than the status commit itself follows the usual pattern.

## 6. Steps excluded under D-225 (reasoning-only session)
These steps aren't taken here and are left to a session allowed to do operations:
- `node scripts/next-task.mjs --verdict findings --task POSTMERGE-oct22-review --as "<reviewer>"`. That pushes a marker to the review lock, and the owner limited this session to pushing this doc only. The lock currently shows `Fix claim` by OpenAI · c54e (`b8ed1d96`) on Oct 24, and recording a verdict needs the lock in the `in-review` stage, held by the reviewer.
- Fixing F1 and F2: the builder or a fixer, not the reviewer (DELEGATION §6).
- Merging main into the branch, landing #775, setting the row `done`, and any clearing `--report`. These are implementation or operations steps.
