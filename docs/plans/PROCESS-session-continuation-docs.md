# PROCESS-session-continuation-docs

## Decision and product goal

D-235 records the owner request that active sessions continue to the next eligible task instead of requiring repeated build prompts. This reduces handoff delay in the job-referral product without weakening ownership or review. It does not install automation or prove an unattended runner works.

## Bounded scope

This is one bounded amendment on the existing #833 carrier, prepared from current `main` `04b6f4d1`. No new carrier, no new decision ID, no policy or gate weakening.

**Docs scope (this amendment).** `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `START_HERE.md`, `SkipWait-START-HERE.md`, `docs/BRIEF.md`, `docs/BUILD_CONTINUITY.md`, `docs/DELEGATION.md`, `docs/plans/D-048-auth.md`, `docs/DECISIONS.md`, this packet, and the `docs/plans/assignments.json` registration. Change only forced session-ending wording and current preflight/continuation guidance. Preserve D-225 roles, D-151 independent review, required CI, frozen choices, native usage caps, free-only limits and all account, API, money, release and retention holds.

**Runtime scope (named here, not written here).** The printed-text follow-through rides this row, not `PICKER-architect-landing`:

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
- Run the eight focused native suites: briefContract, registerShape, queueGate, goalUiCoverage, nextTask, nextTaskReviewWording, d048Split, register520Packets. Also run `validateAssignments`, `node scripts/decision-id-check.mjs`, `scripts/queue-gate.mjs` and `scripts/scope-check.mjs --branch`, and report the scope check as skipped, never as passing.
- Validate assignments and the owned diff explicitly. A missing-main-row warning is not a pass: this candidate is not done until protected merge.
- Independent reviewer checks the exact delta, the source decision, the `blockedOwn` distinction and overlap with the picker-file owners; do not import unmerged policy. Required exact-head CI and the normal protected landing procedure remain. No self-review or self-merge.

## Status and read receipt

Prepared from `origin/main` `04b6f4d1` on 2026-11-08, superseding the earlier `99f8a1f2` draft body. Read current AGENTS, decisions, BUILD_CONTINUITY, assignments, picker source and the carrier's four conflict paths (`AGENTS.md`, `docs/BRIEF.md`, `docs/DECISIONS.md`, `docs/plans/assignments.json`). D-233, D-234 and D-235 are absent from `main` while D-236 is present, so D-235 is a genuine gap and this is the carrier's existing ID, not a new number. This packet is not a claim marker, review verdict, merge or runner readiness statement.

Sequence: this docs-only amendment lands first through normal independent review, required CI and protected merge. No runtime commit is made before that merge. Registration status is `in-review` and is not a completion claim; unattended-controller acceptance remains distinct.
