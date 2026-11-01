# LANDING-PROCEDURE-AUDIT-oct27

Issue: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/741

## Status

- LANDING-PROCEDURE-AUDIT-oct27: in progress — Claude Opus 5.5 · b295 — 2026-11-01 — branch agent/queue/procedure-audit-oct27. Findings below are recorded and verified on main f5b9afb9. No pull request is open and nothing is landed: the session stopped on the coordinator's instruction. The next holder opens the PR and lands it under D-082. That lander must not be a Claude session (D-151 spirit) and must not be the audited coordinator.
- LANDING-PROCEDURE-AUDIT-oct27: takeover — DeepSeek V4.1 Flash Free · d7a7 — 2026-11-01 — picker-assigned (TAKE OVER, half-built and quiet since 10:59:23Z). b295's report is carried forward unchanged; the spot-checks in "Lander's independent spot-checks" below were run by this session, and this session opens the pull request and lands it under D-082. Not a Claude session and not the audited coordinator, so the packet's lander condition holds.

## Independence and scope

An independent session, not the Instinct coordinator whose actions are audited, performs this audit. Read-only investigation plus this report file. No production/settings writes, history rewrites, branch deletion, repeated feature landing, flag activation or gate exemptions.

## Evidence to verify independently

Five squash landings against the current merge-commit/forward-only procedure: #737 (15325697 -> 1be5dfdb), #738 (d6cb28d0 -> 215b3a7a), #650 (1d9a129b -> 2dcea864), #579 (891fe471 -> b5299cfd), #739 (6a153b51 -> ab92ba4d). Initial coordinator comparison found identical Git trees at each final head and corresponding landed commit, and each landed parent is ancestor of its final head. This proves only content equality at those commits, not overall impact. Detailed mapping is preserved at https://github.com/ayodhyamohanthy/skipwaitmanus/pull/739#issuecomment-6439542932 and on the other affected PRs.

#735 is a two-parent merge and outside the squash set. #579 also received a premature Landed marker, before actual merge succeeded. Verify the actual chronology; later truth does not erase the ordering error.

## Acceptance

Independently compare content, review traceability, ancestry-based queue done/branch detection, deployment triggers and release identity. Preserve branches and exact evidence. Report proven effects separately from unresolved deployment/UX acceptance. Any corrective code, schema or control-plane proposal gets a separate scoped row and independent review, never an inferred settings authorization. Prevention must address merge-method enforcement and mergedAt confirmation before Landed markers. Current required CI and merge-commit route apply to the audit report itself. Dark flags remain off.

## Findings

Auditor: Claude Opus 5.5 · b295. This session is independent of the Instinct coordinator and was picker-assigned (dry run, then `--claim`). The audit was read-only. Evidence comes from git objects on `origin/main` f5b9afb9, `refs/pull/N/head`, the GitHub REST API (PRs, Actions runs, rulesets) and the picker source. There were no production requests. All times are UTC. Prior evidence from a Qoder · dad6 session (issue #741, comment 6443538886, F1–F10) was re-checked here rather than relied on. This is the audit report. It is not a settings, history or queue change.

### 1. The five landings (verified)

| PR | final head | landed | parents | head tree = landed tree | landed parent in head | head in main | merged_at |
|---|---|---|---|---|---|---|---|
| #737 | 15325697 | 1be5dfdb | 1 | 350aad76, identical | yes | no | 09:34:58 |
| #738 | d6cb28d0 | 215b3a7a | 1 | bfd98b42, identical | yes | no | 10:05:42 |
| #650 | 1d9a129b | 2dcea864 | 1 | b2f71b41, identical | yes | no | 10:11:47 |
| #579 | 891fe471 | b5299cfd | 1 | c51be623, identical | yes | no | 10:20:48 |
| #739 | 6a153b51 | ab92ba4d | 1 | 8593aff9, identical | yes | no | 10:26:53 |

- All five were committed by `GitHub` with the `(#N)` suffix and one parent, which is the web-button squash signature.
- The PR API does not expose a merge method, so "squash" is inferred from this topology.
- `delete_branch_on_merge` is true and none of the five head branches exists on origin. The tested heads survive only as `refs/pull/N/head`, and all five still resolved there on 2026-11-01.
- Content: no loss. The landed bytes equal the final PR heads.

### 2. Wider than five: 22 squash landings after the rule was on main

- The never-squash rule entered main in c06dfd27 (2026-10-22T05:03Z, AGENTS.md and the D-134 (6) text).
- A full-history scan of main for one-parent, `GitHub`-committed `(#N)` commits whose parent already contains c06dfd27 finds **22**, from 2026-10-23 to 2026-10-27:
  - the five above;
  - #568 (89372ae7; it is not on the first-parent chain, so a first-parent scan misses it);
  - #733, #732, #730, #731, #723, #667, #668, #634, #631, #628, #629, #619, #597, #622, #535, #534.
- **All 22 are tree-identical to their PR heads**, and each one's landed parent is an ancestor of its head.
- **None of the 22 heads is in main's ancestry.**
- **No squash-signature commit exists after ab92ba4d (2026-10-27T10:26:51Z)** through main f5b9afb9.

### 3. Review traceability

- #650: the pass named 7062dc38 (PR comment 6438581832).
- #579: the pass named 0dfbe74a (PR comment 6438637867).
- The later merge-ups were clean automatic merges. For 1d9a129b on #650, and 2accd724 and 891fe471 on #579, a recomputed `git merge-tree` equals the actual tree. The PR-owned files are byte-identical from the reviewed head to the landed commit, so the landed code is the reviewed code plus main.
- On Oct 27 the verdict markers (443e45a8, f0a6341b) carried no head. Today `--verdict` writes `reviewed <sha>` in the marker body (`scripts/next-task.mjs:330-333`), so new verdicts are traceable. The reviewed-head to landed-SHA link still exists only in PR comments and in this table.
- UNVERIFIED: no design-track re-pass after 0dfbe74a was found on the #579 thread. The coordinator's own condition (6437801002) was "both tracks pass". The only design pass found was on a5577759.

### 4. Landed markers and the landing slot (verified from git objects on `agent/queue/landing`)

- ff03ba91, 09:48:23: `Land claim D-048-p3-email-review: Claude Code · edf3`. This is the slot holder.
- 5d7e4f84, 10:11:55: `Landed D-174-job-catalog: Instinct Agent`. It came 8 s after the merge and 5 m 44 s before main CI reported that commit red.
- 1ca7b3f2, 10:14:57: `Landed D-048-p3-email-review: Instinct Agent`. It came **5 m 51 s before the merge** at 10:20:48, so it was false when written.
- No Instinct `Land claim` exists for either row. `releaseLandingSlotError` (`scripts/nextTaskCore.mjs:159-165`) refuses a `--landed` from a non-holder, so both markers were pushed outside the picker.
- **Still open today:** `--landed` (`scripts/next-task.mjs:335-344`) checks only the slot holder and the task. It does not check that the pull request is merged, its `merged_at`, the merge method or the landed SHA.

### 5. CI, deploy triggers and release identity (Actions runs by head_sha)

- 1be5dfdb, 215b3a7a, ab92ba4d: push CI success only, no deploy runs. These were docs/registry deltas.
- 2dcea864 (#650):
  - Deploy Web succeeded at 10:13:13.
  - CI **failed** at 10:17:39 (run 40486604317).
  - Deploy API, including the migration, **succeeded** at 10:32:04 (run 40486604551). All three started at 10:11:50.
- b5299cfd (#579) was merged at 10:20:48 onto that red main.
  - Deploy Web succeeded at **10:22:44, 4 m 06 s before** its own CI succeeded at 10:26:50.
  - Web then ran b5299cfd against API 2dcea864, a client-only delta behind a flag (compatibility UNVERIFIED).
- **Fixed since:** P1-deploy-green-gate (fe403956, landed through the #750 two-parent merge d79cfa00). Each deploy now has a `release-gate` job that requires green CI on the exact SHA before `migrate-db` and `deploy`, and the CI is re-checked inside each job (`deploy-api.yml:50-76,140-144`; `deploy-pages.yml:43-57,124-127`).
  - The red API release was replaced at 14:15:08 by run 40517325313 (d79cfa00).
  - The latest API deploy is run 41260983186 at e36c3d62, which is on main.
- Release identity: each deployed SHA is a squash commit that never ran PR CI. Its only exact-SHA evidence is its own push CI: green for four of the five, red for 2dcea864.

### 6. Queue done and branch detection

- The picker counts a row as done when `status === "done"`, or when it is `todo`/packet and landed. "Landed" means an ancestry merge, or a head found in the last **100** closed PRs (`scripts/next-task.mjs:237-242`; `scripts/nextTaskCore.mjs:452-453`, done at `:466`). Squash landings make ancestry permanently false. The 100-PR window still applies.
- #650 and #579: rows D-174-job-catalog and D-048-p3-email-review were set to done by #739. No mis-detection.
- Of the 22 PRs, **15 used a branch that matches no row**: `agent/instinct/*`, `agent/registry/*`, `agent/signin/*`, `agent/backlog/*`. PROCESS-queue-gate (`scripts/queue-gate.mjs`, run in `ci.yml`) has since closed this class.
- **Live consequence:** row `D-048-doctrine-benefit-copy` is still `in-review`. Its PR #730 was squash-landed at 2026-10-27T07:19:08 (54e3a5b8, tree identical to head 06cc2c28) and its branch was deleted. The board still shows it as in progress five days later, because the landed fallback does not apply to `in-review`. This session did not change it: it is another row, and this session made no registry writes.

### 7. Related gate: architect-branch CI skip (Qoder F10)

Fixed on main. `ci.yml` now classifies marker-only pull requests by content, not by branch prefix (`ci.yml:14-21` and the `marker_only` steps). `scripts/ciMarkerSkip.test.ts:106,138` bans any return of the prefix skip.

### 8. Platform state (read-only API, 2026-11-01)

- Ruleset 25733248 `main-protection` still has `allowed_merge_methods: ["merge","squash","rebase"]`.
- The repo has `allow_squash_merge: true` and `allow_rebase_merge: true`.
- Ruleset 25433342 requires `typecheck`, `unit + component + route tests` and `production build` with strict mode on.
- `bypass_actors` came back `[]` at this access level. That is not proof that no bypass exists.
- Conclusion: the zero recurrence since Oct 27 is behavioural, not enforced.

### 9. Prevention (rated; proposals only, nothing implemented or registered here)

1. **Merge method, settings: 9/10.** Set `allowed_merge_methods: ["merge"]`, with squash and rebase off. This is the only mechanical stop. It is an owner settings write, and it is already listed in the existing owner row `OPS-github-settings`, so no new row is needed.
2. **`--landed` confirms the merge before writing a marker: 9/10.** Fail closed unless:
   - the PR is `merged` with `merged_at`;
   - `merge_commit_sha` is on main;
   - the PR head is an ancestor of main (a merge commit or a fast-forward).

   Write the landed SHA, `merged_at` and the reviewed head into the marker body. This replaces the 100-PR window for done detection (#6). It needs a new scoped picker row with red-first tests in `scripts/`. **Not registered by this session** (no register or row writes; the coordinator decides).
3. **Detective check on main pushes: 6/10.** Flag a one-parent `GitHub`-committed `(#N)` commit. It is detective only, so item 1 is the real fix.
4. **Correct `D-048-doctrine-benefit-copy` to done at 54e3a5b8: 8/10.** This is a registry status fix on an existing row, for the coordinator to route.
5. **Reviewer-bound LAND continuation (root cause of #4): 8/10.** The existing row `PICKER-avoid-land` covers it, so no new row is needed.

### 10. Verification of earlier evidence (Qoder · dad6, #741)

- F1 (red release live): true on Oct 27, **resolved** at 14:15:08.
- F2 (migration before CI): **fixed** by #748/#750.
- F3 (merge onto red main): **confirmed**.
- F4 (non-holder Landed markers): **confirmed**. The `--landed` gap is still open.
- F5 (premature Landed): **confirmed**.
- F6 (traceability): **confirmed**, partly mitigated because verdicts now name their head.
- F7 (100-PR window): **still true**.
- F8 (rowless branches): **confirmed and wider**, with 15 of 22.
- F9 (#749 evidence claim): **not re-verified** (UNVERIFIED).
- F10 (architect CI skip): **fixed**.

What this audit did not do: it rewrote no history, deleted no branch, changed no settings, flag or register entry, posted no GitHub comment, made no production request, and did not land anything.

## Lander's independent spot-checks (DeepSeek V4.1 Flash Free · d7a7, 2026-11-01)

The takeover holder re-ran the falsifiable claims from scratch rather than carrying them forward. Four checks, all read-only against `origin/main` and `origin/agent/queue/landing`.

| # | Claim checked | Method | Result |
|---|---|---|---|
| S1 | A `Landed` marker was written before its merge succeeded (§4) | `git log origin/agent/queue/landing` vs `git log -1 b5299cfd` | **CONFIRMED.** `1ca7b3f2` is dated 2026-10-27 10:14:57Z; the #579 merge `b5299cfd` is 10:20:48Z. The marker preceded the merge by 5 m 51 s. |
| S2 | No squash-signature landing after `ab92ba4d` (§2) | Full-history scan of the 941 commits on main since 10:26:52Z for one-parent, `committer=GitHub`, `(#N)`-suffixed commits | **CONFIRMED.** 0 matches. |
| S3 | `D-048-doctrine-benefit-copy` is still `in-review` although #730 landed (§6) | `assignments.json` on main + PR 730 API | **CONFIRMED.** Row reads `in-review`; #730 `MERGED` at 2026-10-27T07:19:08Z as `54e3a5b8`, one parent. |
| S4 | `--landed` never confirms the merge (§4) | Read `scripts/next-task.mjs:335-344` and `releaseLandingSlotError` (`scripts/nextTaskCore.mjs:159-165`) | **CONFIRMED.** The only gates are slot holder and task id; `merged_at`, merge method and landed SHA are not read. |

**One correction, for the detective check in §9 item 3.** The report says the five were "committed by `GitHub` with the `(#N)` suffix". That is true of the **committer** (`%cn`) on all five — `author` is the repo owner (`AyodhyaRam Mohanthy`) on every one, because a web squash keeps the PR author as author. A detective check that filters on `%an == "GitHub"` therefore finds **nothing at all**; the identifying signature is `committer=GitHub` **and** exactly one parent **and** a trailing `(#N)`. S2 above was run with the committer field for this reason: the first pass filtered on author and returned a false negative, which is exactly the failure mode this correction is meant to prevent.

These spot-checks confirm the report's conclusions and change none of them. No file outside this packet was touched, no settings or register entry was written, and no GitHub comment was posted by this session.

— DeepSeek V4.1 Flash Free · d7a7
