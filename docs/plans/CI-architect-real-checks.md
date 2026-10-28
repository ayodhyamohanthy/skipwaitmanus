# CI-architect-real-checks

## State and scope boundary

Tier 1, lane `ci-gate`, status todo from the handoff registry PR onward. Build only on the task branch `agent/queue/ci-architect-real-checks`, whose pull request runs all three required jobs. Never use an `agent/architect/*` branch for this row or its registry PRs: required jobs skip there until this lands. Incident #748 and audit #741 stay open. This row changes no deploy workflow, production system, database, setting or ruleset. It does not lift the API deployment hold, and neither deploy workflow's path filter matches its owned files.

Objective: real required checks before landing. Splitting the work does not permit skipped checks.

## Proven defect and evidence

- PR #752 (`agent/architect/d100-security-audit`, head `36842c00567de8327077e9b6c0d22f7159646b98`, five docs/registry files): run 40506287399 concluded `skipped`, with all three required jobs `skipped`. It merged at 2026-10-27T12:48:12Z as `02eb6c95c0c18d2cb80bd9911c8ec845fe7e43cc`. Main CI 40506662910 succeeded afterwards; that is post-merge evidence, not a test of the PR.
- The defect recurred after this packet reached main (`9746ec9a2b28e24e114d4c965a8c07ff9f59f537`, #753, 2026-10-27T14:59:44Z). PR #764 (`agent/architect/d048-dark-mode`, head `17d46aeed719265ad3916abaf4d0f5f7e47c233c`, three docs/registry files including D-224) had run 40564131171 `skipped`. It merged at 2026-10-27T18:54:20Z as `f5a23dedcb968ade151030e74c8c82d54213e4f8`.
- Cause: the job-level `if:` from LAUNCH-marker-ci-skip (`06e20175e5782fc9706e22a8e8a165a3118956c5`, #658) skips `agent/architect/*` along with the true marker refs. The picker's architect steps (`scripts/nextTaskText.mjs:108-114`) open packet PRs on that same prefix. Ruleset 25433342 requires `typecheck`, `unit + component + route tests` and `production build` (strict), and GitHub counts a skipped required job as passed.
- The fast path also keeps true markers working: run with full steps, the typecheck job's queue gate fails PR #455 (`agent/reports/log`) and the landing slot with "no queue row" on an empty diff.
- Window baseline, measured 2026-10-28T07:55Z: 36 of the newest 100 CI runs were skipped marker-prefix PR runs (34 from PR #455, 2 architect). Skipped jobs still create runs, so make no window or minutes claim without re-measuring.
- Evidence is kept in audit #741 comment 6442763129. No history rewrite and no incident closure.

## Ownership (resolved by handoff)

Holder's acknowledgment for PRICING-banded-oct25: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/666#issuecomment-6464335154. `.github/workflows/ci.yml` moved from that row to this one. Owns: `.github/workflows/ci.yml`, `scripts/ciMarkerSkip.test.ts`, `scripts/classifyCiChange.mjs`, `scripts/classifyCiChange.test.ts` and this packet. No `dependsOn`: not on pricing, and not on P1 (P1-deploy-green-gate owns the deploy workflows, `rollback.yml` and its gate files, all disjoint).

Carry #666's only ci.yml delta byte for byte: the typecheck step lines from `c9572fcfdc9cceb55d55c5d55edf4675d1eaa382`. That commit also edits `client/src/pages/PlansV2.tsx`, so copy the hunk and never cherry-pick the commit.

```yaml
      - name: Typecheck
        # tsc needs more than the default old-space on this tree; OOM exits 1
        # with no diagnostics (verified: 8GB local run passes with zero errors).
        run: NODE_OPTIONS=--max-old-space-size=6144 pnpm check
```

Main's ci.yml (blob `2e6a964d`) plus exactly this hunk is blob `14ea8a25`, which is #666's tip. Add nothing between `- name: Typecheck` and the next step: an `if:` there conflicts with #666 under `git merge-file`, while job-level `if:` edits and new steps elsewhere merge cleanly. After this row lands, #666 merges main, and its ci.yml diff must be empty.

Other ci.yml writers stay outside this row. PR #523 (D-132-v2-checkout, no `owns`) adds an `outbox-mysql` job and must register ci.yml before any ci.yml change of its lands. The main `cancel-in-progress` liveness item from #748 registers as its own row with `dependsOn` this one.

## Acceptance (fail closed)

- Decide from the complete diff between SHAs pinned by the event (base, head and merge ref). Never decide from a branch name, title, commit message, label or any other PR-authored output. Only exactly zero changed files may take the marker fast path. Every other case runs the full required steps, including unknown, failed, missing, truncated or malformed reads.
- No required job `needs:` a classifier job, and no aggregate success may hide a skipped required job. A skip or fast path on a non-empty diff must turn a required job red through its own independent check.
- Keep the three required job names, the path `.github/workflows/ci.yml` (`CI_WORKFLOW` in `scripts/require-green-release.mjs`), the triggers, push-to-main and dispatch behaviour, and the P1 release-gate inputs. Weaken no test. Rewrite the obsolete prefix pins in `scripts/ciMarkerSkip.test.ts` red-first to the new contract.
- Proof: red-first unit tests, plus real linked throwaway draft PRs that are never merged. An architect-branch docs/registry PR runs all three jobs, and an invalid `assignments.json` there fails the tests job. A runtime change on a marker prefix runs all three jobs. A genuinely empty marker PR takes only the fast path. YAML or source pins alone are not proof.
- Independent Tier 1 review by a model that neither built nor fixed it (D-151), exact-head required CI success, and a merge commit, never a squash.

Implementation must independently prove the acceptance contract; this registration does not prescribe an untested workflow expression.

## Test matrix (input -> required outcome)

- A, pinned diff. A1 head tree equals base tree -> fast path. A2 any one changed file on any prefix -> full. A3 base moved, or a re-run of the same run -> same verdict from the same pinned SHAs. A4 a new head -> its own run decides, and the old verdict never carries. A5 change then revert, net empty -> fast path. A6 rename-only, mode-only, symlink, submodule, binary or delete-only -> full. A7 more than 300 or 3000 files -> full.
- B, empty markers. B1 a marker pushed to `agent/reports/log` (#455) -> fast path, never red. B2 review, heartbeat, landing and architect-claim markers with no file change -> fast path. B3 an empty diff on a non-marker branch -> the pinned choice (fast path or full), never red. B4 re-measure the newest-100 window and report the numbers, with no promise.
- C, substantive docs/registry. C1 #752's shape on an architect branch -> all three jobs run and pass. C2 #764's shape -> same. C3 invalid `assignments.json` on an architect branch -> tests job fails. C4 docs-only on each marker prefix -> full.
- D, disguised runtime. D1 a `server/`, `client/` or `shared/` change under each marker prefix -> full, and a planted failing test fails. D2 a change to ci.yml, the classifier or its test, `package.json`, the lockfile or tsconfig -> full, and the fast path is unreachable. D3 "docs-only", "marker" or "[skip ci]" in a title, message, label or branch -> ignored; a `[skip ci]` head leaves the required checks missing, so merge stays blocked. D4 a runtime file renamed into `docs/` -> full, with both paths counted.
- E, missing, truncated or failed data. E1 a shallow checkout or a failed fetch of a pinned SHA -> full. E2 a missing, null or malformed SHA or event payload -> full. E3 a changed-file count that is missing, null, the string "0", negative or NaN -> full. E4 an API 403, 404, 422 or 5xx, a rate limit, a timeout, non-JSON, a missing page or a capped list -> full, never empty. E5 a non-zero exit, crash or garbage from git or the classifier -> full or red. E6 classifier output absent, or anything but the exact success token -> full. E7 a push to main, a dispatch on main or another ref, re-run attempt N, or re-running failed jobs -> never the fast path.
- F, failed CI dependencies. F1 a required job with `needs:` on a classifier -> rejected by a YAML structure test. F2 a classifier step that fails inside a required job -> full steps or red, never success without real steps. F3 a checkout, pnpm, node or install failure -> red, never skipped. F4 a cancelled run -> not mergeable, and the P1 gate still refuses it. F5 a job-level expression error -> a real run shows it does not conclude `skipped`.
- G, preservation. G1 job names unchanged (`REQUIRED_JOBS`). G2 the heap line byte-identical, and `git merge-file` of #666's ci.yml against the candidate is clean and yields the candidate. G3 no condition names main or push, and a push to main runs all three jobs. G4 triggers and concurrency unchanged. G5 `scripts/requireGreenRelease.test.ts` and `node scripts/check-deploy-triggers.mjs` green.

Out of scope: deploy workflows, rollback, production, DB, protection or ruleset settings, picker files (`scripts/nextTask*.mjs`), spending, branch or history deletion, and feature activation. Registration is not implementation, review, landing or incident acceptance.
