# PROCESS-session-continuation-docs

## Decision and product goal

D-235 records the owner request that active sessions continue to the next eligible task instead of requiring repeated build prompts. This reduces handoff delay in the job-referral product without weakening ownership or review. It does not install automation or prove an unattended runner works.

## Bounded scope

This is one bounded amendment on the existing #833 carrier, prepared from current `main` `04b6f4d1`. No new carrier, no new decision ID, no duplicate task row, no policy or gate weakening.

### Two stages, one row, one decision ID

The row `PROCESS-session-continuation-docs` carries both stages. Only stage 1 is written here.

**Stage 1 — docs-only scope registration (this PR #833, branch `agent/queue/process-session-continuation-docs`).** The docs listed below plus this packet and the `assignments.json` registration. No runtime source change.

**Stage 2 — bounded runtime follow-through (branch `agent/queue/process-session-continuation-runtime`, pre-registered in this amendment, NOT created).** Created only after stage 1 has independent final-head review, required green CI and a protected merge, and only then assigned by the normal picker. No runtime branch and no runtime pull request exist at the time of this amendment.

**Why the runtime branch is distinct.** The picker would otherwise never hand out the runtime work. Replayed against current `main` with green main and no open docs pull request:

| row state | picker result |
|---|---|
| same row `in-review` on the merged docs branch | `none` — "being landed by its reviewer" |
| same row `todo` on that same merged branch | `none` — "done" |
| same row `todo` with the distinct pre-registered runtime branch absent | **`build`** for `PROCESS-session-continuation-docs` |

So changing `in-review` to `todo` on the closed docs carrier would not solve it. The distinct branch is the mechanism, and the replay above is measured, not assumed.

**What enforces the stage order.** `scripts/next-task.mjs` reads the row list from `origin/main` (`LIST_REF = process.env.NEXT_TASK_LIST_REF || "origin/main"`, line 45). Until stage 1 merges, `main` has no such row, so no session can be handed the runtime build at all. The merge is the gate, not a promise.

**Docs scope (stage 1).** `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `START_HERE.md`, `SkipWait-START-HERE.md`, `docs/BRIEF.md`, `docs/BUILD_CONTINUITY.md`, `docs/DELEGATION.md`, `docs/plans/D-048-auth.md`, `docs/DECISIONS.md`, this packet, and the `docs/plans/assignments.json` registration. Change only forced session-ending wording and current preflight/continuation guidance. Preserve D-225 roles, D-151 independent review, required CI, frozen choices, native usage caps, free-only limits and all account, API, money, release and retention holds.

**Runtime scope (stage 2, named here, not written here).** The printed-text follow-through rides this row, not `PICKER-architect-landing`:

- `scripts/nextTaskCore.mjs` — the narrow avoid-first-of-two-owned-continuations hunk only.
- `scripts/nextTaskAvoidLand.test.ts` — four tests (control, avoid-first-continues-second, avoid-both-falls-through, blockedOwn guard).
- `scripts/nextTaskText.mjs` — printed stop copy only.
- `scripts/nextTaskReviewWording.test.ts` — two printed-text pins, preserving the D-184/D-151 assertions.

Out of scope and unchanged: `heldBy`, heartbeat, the stale-CI race, and `next-task` behavior. The stop copy does not require a `next-task` change.

**Stale owner corrected.** The earlier draft pointed printed-text ownership at `PICKER-architect-landing`. That row is `done` on current `main` (`syncedTo: D-237`) and never carried the follow-through, so waiting on it is stale. This amendment replaces that reference; it does not create a reverse dependency edge.

## Runtime correction this row carries

Measured on `main` `04b6f4d1`, a session holding two owned LAND continuations that asks to avoid the first is handed fresh work instead of the second. `ownWork()` returns `found[0]`, the `--avoid` branch nulls it, and the normal pass falls through to a new build.

The narrow fix takes the first owned continuation that is not avoided, and keeps the `blockedOwn` fallback exactly as it is today:

```js
const owned = claimant ? ownWorkList(view, claimant) : null;
let mine = owned?.found.find(pick => !(pick.kind === "continue" && pick.task && avoid.has(pick.task.id)))
  ?? (owned?.found.length ? null : owned?.blockedOwn ?? null);
```

The `blockedOwn` distinction is deliberate and must survive review. The wider form `?? owned?.blockedOwn ?? null` is **not** equivalent: it turns an avoided continuation plus an own blocked task into a `wait` on that own block, where current `main` hands out eligible fresh work. The narrow form falls back to `blockedOwn` only when nothing else is owned.

Evidence already reproduced against current `main` by the preparing session and independently by the coordinator: red-first `1 failed | 19 passed` on the unpatched core; `313 passed` across the 12 picker suites on the narrow patch; and a mutation check where the wider form fails the `blockedOwn` guard while the narrow form passes. That evidence is candidate evidence, not a final-head pass or a shipped result.

## Serialization and ownership

- **No `owns` on this row, by design.** Two non-`done` rows may not own overlapping paths without a dependency edge, and a reverse `dependsOn` on `PICKER-fullstack-lights`, `PICKER-qa-stage` or `PICKER-landing-wait-fallthrough` would stall this row under D-134. This follows the D-293/D-286 precedent: no owns, shared lane, explicit scope in the packet and note.
- **Serialized on the `picker` lane.** All three unfinished picker-file owners share that lane. None carries a branch on `origin` at preparation time, so nothing is taken over and no waiver is claimed.
- **`scope-check` caveat, recorded.** With no `owns`, `scripts/scope-check.mjs` returns `skipped` ("task … declares no owns"), not a pass. Scope enforcement for this row is a manual allowlist diff against the docs and runtime paths named above, plus independent review. A skipped scope check must never be reported as a passing one.

## Acceptance and handoff

- Keep D-074 (2) and D-085 (10) as historical decisions, explicitly amending only their forced-end clauses.
- After an actual bounded handoff push owned work, report the actual outcome, repeat the BUILD_CONTINUITY preflight and choose the next role-permitted eligible task. Real STOP, WAIT, missing approval, native caps and no eligible work remain honest pauses, not loops or completion claims.
- **Before this amendment is published**, confirm `agent/queue/process-session-continuation-runtime` exists in no ref, locally or on `origin`, and that no other row already uses its slug. A pre-registered branch that already exists would make the picker read work that is not there.
- Run the eight focused native suites: briefContract, registerShape, queueGate, goalUiCoverage, nextTask, nextTaskReviewWording, d048Split, register520Packets. Also run `validateAssignments` with the full dependency graph, `node scripts/decision-id-check.mjs`, `scripts/queue-gate.mjs` and `scripts/scope-check.mjs --branch`, and report the scope check as skipped, never as passing.
- **Include a lifecycle replay of this exact revised row**, not an assumed later fix: with green main, the docs branch merged and no open docs pull request, the pre-registered row must make `pickNextTask` return `build` for `PROCESS-session-continuation-docs`, while the same row `in-review` on the merged branch returns `none` ("being landed by its reviewer") and `todo` on that same merged branch returns `none` ("done").
- Validate assignments and the owned diff explicitly. A missing-main-row warning is not a pass: this candidate is not done until protected merge.
- Independent reviewer checks the exact delta, the source decision, the two-stage lifecycle, the `blockedOwn` distinction and overlap with the picker-file owners; do not import unmerged policy. Required exact-head CI and the normal protected landing procedure remain. No self-review or self-merge.

## Status and read receipt

Prepared from `origin/main` `04b6f4d1` on 2026-11-08, superseding the earlier `99f8a1f2` draft body and the `fd7fbaf4` single-stage revision. Read current AGENTS, decisions, BUILD_CONTINUITY, assignments, picker source and the carrier's four conflict paths (`AGENTS.md`, `docs/BRIEF.md`, `docs/DECISIONS.md`, `docs/plans/assignments.json`). D-233, D-234 and D-235 are absent from `main` while D-236 is present, so D-235 is a genuine gap and this is the carrier's existing ID, not a new number. This packet is not a claim marker, review verdict, merge or runner readiness statement.

Sequence: stage 1 (this docs-only amendment) lands first through independent final-head review, required CI and protected merge. Only then does the normal picker assign stage 2 on the pre-registered runtime branch, and only that stage may touch runtime source. No runtime commit, branch creation or pull request exists before the stage 1 merge. Row status is `todo` because the row's work is not finished; it is not a completion claim, and unattended-controller acceptance remains distinct.

Re-sync to D-303 (2026-11-08, docs only; no code, no behaviour, no scope change). The two decisions newer than this packet's previous `syncedTo` D-301 were checked one by one:

- **D-302 — unaffected.** It rules on the `D-048-p3-for-companies` block and defers a `scripts/nextTask.test.ts` repair to the rows that own that file. It touches none of this packet's scope, runtime paths, serialization or ordering, so nothing here changes.
- **D-303 — directly affects this packet, and is recorded rather than performed here.** It clears this row's block on a root cause that is bookkeeping syntax, not a code defect: `scripts/review-gate.mjs` (`statusSectionLines`) treats only lines under a heading that is exactly `## Status` as landing bookkeeping, while this packet's heading is `## Status and read receipt`, so the landing status commit `ea54b5de` read as an unreviewed change after the reviewed head `10105fb3`. D-303 scopes the cure to the task branch `agent/queue/process-session-continuation-runtime`: rename this heading to `## Status` there, retaining the landing lines. It also requires the fresh independent Tier 1 pass on the final head to be recorded by a session of a model other than Antigravity (which participated in the F1 fix) or Qoder (which built the work), after which that session lands the pull request through the normal protected merge. This re-sync records that requirement; it does not rename the heading, because D-303 places the rename on the task branch, and it does not take or claim that pass.


D-305 file-cluster qualification (docs only): the unclaimed `PICKER-oracle-kind-repair` carrier uses lane `picker-oracle-test` and owns only `scripts/nextTask.test.ts`, which is absent from this row's runtime allowlist and current implementation diff. This row keeps its existing `picker` lane, id, branch, scope, claim and independent final-head review. The earlier shared-lane serialization remains for overlapping picker work; it does not require disjoint one-file work to wait for this row. Existing fullstack -> repair and QA transitive dependencies remain. D-223 forbids adding a dependency merely for an ordering preference, so no reverse dependency is added here. Recheck the actual open diffs at claim and landing, and stop if an overlap appears. This registration does not fix or approve runtime PR #1053 or its historical review.
