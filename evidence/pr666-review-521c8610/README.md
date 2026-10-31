# PR #666 review evidence — composed run at 886ccfce

Raw output from the independent review of PR #666 (`PRICING-banded-oct25`),
produced 2026-10-31 and published here unmodified. Nothing was re-run to
publish this directory; these are the original run artifacts.

## Tree under test

| What | Commit |
|---|---|
| Candidate (PR #666 head) | `521c86101c4ec799929ffaf221b75e497eabadf5` |
| Main at composition time | `363dd910e4aa5c13295df6895effe5fa0984bf14` (PR #903 merge, 2026-10-31 13:03 +0530) |
| Composed merge | `886ccfce49755f333a51f2738e79182e477252f7` — parents `521c8610` + `363dd910` (this branch's parent) |

`363dd910` is a main merge whose first parent is
`3e296819f28d4842c075cfa5aac61c0515eadac6` (PR #908), so the routing commit
named in the review handoff is an ancestor of the composed base.

After the run, main advanced to `f09b72dc` (PR #906, 13:12 +0530). The delta
`363dd910..f09b72dc` is three docs files only: `docs/DECISIONS.md`,
`docs/plans/REL-production-watch.md`, `docs/plans/assignments.json`.

## Commands and results

Worktree: `/tmp/qoder-composed-666`.

| # | Command | Exit | Result (from the log) | Artifact |
|---|---|---|---|---|
| 1 | `git worktree add -b tmp/composed-666 /tmp/qoder-composed-666 521c86101c4ec799929ffaf221b75e497eabadf5` | 0 | worktree at the candidate head | — |
| 2 | `pnpm install --frozen-lockfile` | 0 | lockfile up to date; 1106 packages | `gate-install.log` |
| 3 | `git merge --no-commit --no-ff origin/main` (HEAD `521c8610`, origin/main `363dd910`), then commit | 0 | merge commit `886ccfce`; no conflicts; `ci.yml` resolves to main | commit object |
| 4 | `pnpm check` | 0 | `tsc --noEmit`; no diagnostics | `gate-check.log` |
| 5 | `node scripts/design-token-audit.mjs` | 0 | `OK — no legacy or off-brand hexes in the client surface.` | `gate-design-tokens.log` |
| 6 | `bash scripts/lint-deploy-migrations.sh` | 0 | no output | `gate-deploy-migrations.log` |
| 7 | `node scripts/check-deploy-triggers.mjs` | 0 | `workflow path filters cover every build input` | `gate-deploy-triggers.log` |
| 8 | `pnpm vitest run` (full suite) | 1 | Test Files 3 failed / 575 passed / 5 skipped (583); Tests 3 failed / 5451 passed / 18 skipped (5472); Duration 335.92 s | `composed-vitest.log` |
| 9 | `pnpm vitest run client/src/pages/plansGoal.test.tsx server/b2bMonetization.test.ts scripts/classifyCiChange.test.ts` | 1 | Test Files 1 failed / 2 passed (3); Tests 1 failed / 110 passed (111); Duration 22.28 s | `isolated-rerun.log` |

Exit codes were captured by the run wrapper at execution time
(`INSTALL_EXIT=0`, `CHECK_EXIT=0`, `TOKENS_EXIT=0`, `MIGRATIONS_EXIT=0`,
`TRIGGERS_EXIT=0`, `VITEST_EXIT=1`, `RERUN_EXIT=1`); both vitest logs end with
their exit marker. `pnpm build` was not run on the composed tree, so no build
log is included.

## Failures in the full run (step 8)

1. `scripts/classifyCiChange.test.ts` > H1 marker-branch test — `Error: Test
   timed out in 20000ms.` (`scripts/classifyCiChange.test.ts:655`). Passed in
   the isolated replay.
2. `server/b2bMonetization.test.ts` > talent discovery — `AssertionError:
   expected 401 to be 200` (`server/b2bMonetization.test.ts:188`). Passed in
   the isolated replay.
3. `client/src/pages/plansGoal.test.tsx` > "Goal /billing purchase affordance"
   — `TestingLibraryElementError: Unable to find role="link" and name "Get
   more referral requests"`; the rendered primary link is `href="/plans"` with
   label "See plans and prices" (`client/src/pages/plansGoal.test.tsx:216`).
   Failed identically in the isolated replay.

## Isolated replay (step 9)

The same three files, same worktree, no source change: only failure 3
reproduced (1 failed / 110 passed). Failures 1 and 2 passed, separating the two
host-load failures from the deterministic composed-tree failure.

## File hashes (SHA-256)

```
39811d694c34b0d2a0585fc9fc5f1091ceda20bbbd62f27042a65526c8325787  composed-vitest.log
8b91299ee5f3fd245a0ab6a59d815e94755dbfcdbec154d3e231243b4d431f24  isolated-rerun.log
ddb885f73e92750e2ea3dc4c6ff4062480cc7ff542bf673c51ba048fca9b4a9f  gate-install.log
1e585aae7ba723ad853e97a50cd18a541ce0109e4269a108c041b8bff888200a  gate-check.log
a4a52568866670a7dfe8cddeba935d11c3c204fad6a99d52fc43bc3f6b2f1073  gate-design-tokens.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  gate-deploy-migrations.log
7d07fd46ea1ae6a422a0e43ca3ddf588ebdb404b6439318d46e8c2eca455374d  gate-deploy-triggers.log
```

## Notes

- Publication scan of these files matched no key/token patterns (`sk-`,
  `ghp_`, `github_pat_`, `AKIA`, `BEGIN PRIVATE KEY`) and no email addresses.
- The review verdict and its findings are recorded on PR #666 and on the queue
  marker branch `agent/review/banded-plans-oct25` (reviewed head
  `521c86101c4ec799929ffaf221b75e497eabadf5`).
- This branch is an evidence artifact only: it changes no product code and is
  not a task branch.
