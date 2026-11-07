# Packet PICKER-gate-red-review-route: a Tier 1 head whose only red is the review gate gets its review handed

> The review gate refuses a Tier 1 head until an independent pass exists; the picker only hands a review to a head that is not red. So a head red *for no other reason than the missing review* can never be given one. This row repairs that reachability in the picker's stage decision. It changes no product behaviour, no gate rule, no required check and no CI requirement.

| Field | Value |
|---|---|
| Row | `PICKER-gate-red-review-route` (Tier 2, lane `picker`) |
| Branch | `agent/queue/picker-gate-red-review-route` |
| Registered by | D-286 (2026-11-05), docs-only |
| Decisions | D-151 (independent review by a model that neither built nor fixed), D-166 (PROCESS-review-gate), D-212 (GATE-tier-floor), D-200 (any capable session, no lane waits), D-254, D-273, D-279, D-282, D-285 (the parked rows this clears), D-286 |

## Cause (measured on `e7c70797`, 2026-11-05, not inherited from the register)

- `scripts/nextTaskCore.mjs:573` `tier1(v)`: at `:576` every `v.ci === "red"` path returns a `gate`, a `fix` or `green` (`:586` "Pull request … has red CI"). The REVIEW hand-out lives below that guard (`:589-595`) and is reachable only when CI is not red.
- `scripts/scope-check.mjs` runs `review-gate.mjs` inside the required `typecheck` job, so an unreviewed Tier 1 head is red by definition (`:633` is the same fall-through for non-Tier-1 rows).
- `scripts/review-gate.mjs:126` names the cure — "the reviewer re-records it on the current head (`--verdict pass`) … and nothing is waived" — and `scripts/next-task.mjs:325` accepts a verdict only from the session holding the review lock at stage `in-review`, a stage only the REVIEW hand-out creates. Circular: the red needs the review, the review needs a green head.
- Two live instances on 2026-11-05: PR #952 head `76969eb7` run `41986076200` — `typecheck` fails at the gate line alone ("review-gate: FIX-device-signin at 76969eb7: Tier 1: this head has no independent passing review … The review of FIX-device-signin stands at \"Fixed\", not a pass."), while `unit + component + route tests`, `production build`, `e2e journeys` and `Workers Builds` are green; and PR #986 head `dad31bcf` run `41982060943` — `tsc --noEmit` passed and the only `##[error]` is the gate line for `D-048-p3-admin-money`.
- A ruling about this class cannot land from its own architect lock either: `findGateRow` (`scripts/review-gate.mjs:42-43`) maps `agent/architect/<slug>` and `agent/review/<slug>` back to the Tier 1 row, so the gate fires on the ruling that describes it. Measured today with the live task list: `agent/architect/fix-device-signin` → `FIX-device-signin (tier 1)`; a `docs/*` branch → no row, gate skipped. D-273's own ruling landed that way, as `docs/d273-fix-device-signin-owner` (PR #953, all five required checks pass).

## Change (one behaviour)

In `tier1(v)`: when a Tier 1 pull request's CI is red **and the red is confined to the review gate itself**, hand `review` — the only stage that can clear it — instead of falling through to `green`. Every other red keeps today's behaviour exactly.

Hard constraints:

- The gate is not touched. `review-gate.mjs` still requires an independent `Verdict pass` naming the exact head, from a model that neither built nor fixed the work, before CI can go green; landing still requires green required CI on that head. Nothing is waived, downgraded, reordered or skipped.
- A session that built or fixed the head is still barred (`did(v, ["builders", "fixers"])` at `:590` stays in force), and D-151 review independence is unchanged.
- The classifier reads only data the picker already fetches, plus at most one extra read of the failed run's jobs (`GET /actions/runs/{run_id}/jobs`, same host and token as the existing CI fetch). It is fail-closed: unknown CI state, an unreadable or missing job list, more than one failed step, or a failed `Typecheck`, `Design tokens`, `Deploy trigger coverage` or `Scope check` step all keep the current `green` (make-green) hand-out. A review is handed only on a positive identification of the gate's own failure.
- If the gate's failure needs to be identifiable by step, the smallest shape is to call the review gate as its own named step inside the existing `typecheck` job in `.github/workflows/ci.yml` — the same script, the same exit code, the same enforcement. This row must not add, rename or remove a **required status check**: the required-check list is branch-protection state and belongs to the owner's settings, not to this packet. Prove any `ci.yml` change on a live pull request cut from the reviewed head, never from `main`.
- No `server/`, `client/`, `shared/`, `drizzle/`, `docs/plans/assignments.json` (beyond this row's own registration) or runtime change; no `.env.example` key.

## Files it changes

`scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs`, `scripts/review-gate.mjs`, `scripts/nextTaskGateRedReview.test.ts`, `.github/workflows/ci.yml`, and — admitted by D-291 (2026-11-07) for exactly one wiring hunk — `scripts/next-task.mjs`.

**This row declares no `owns` in `docs/plans/assignments.json`, and that is deliberate.** Measured on 2026-11-05 against the live list: `validateAssignments` rejects it with four errors — `PICKER-fullstack-lights`, `PICKER-qa-stage`, `PICKER-landed-marker-continuity` and `PICKER-landing-wait-fallthrough` each already own one or more of these paths and none of them waits for this row ("own overlapping paths and neither waits for the other"). Adding `dependsOn` edges to satisfy the validator would park this cure behind four unstarted rows, one of which (`PICKER-fullstack-lights`) already waits on `FIX-device-signin` — the very row this clears — so the queue would carry a functional cycle. The row was therefore registered without `owns`, which `scripts/scope-check.mjs` reports as `skipped: "task … declares no owns"` and the build proceeds. Conventions for the implementer:

- Stay inside the six files above (the sixth, `scripts/next-task.mjs`, for the one D-291 hunk only). A hunk outside this set stops and reports through the picker (`--report blocked`) rather than widening silently (D-200).
- `scripts/next-task.mjs` (D-291): one wiring hunk only, in `state()`'s `prCi` loop — when a pull request's newest completed run on its tip is red, read that run's jobs (`GET /actions/runs/{run_id}/jobs` through the existing `github()` helper) and set `ci.gateOnly = gateOnlyRedFromJobs(jobs)`. Fail closed: any fetch or parse error, a missing run id or a run not on the tip leaves `gateOnly` false. No new required check, no branch-protection change, no other hunk in this file (carrying the run id out of `ciStateFromRuns` stays in `scripts/nextTaskCore.mjs`). `PICKER-fullstack-lights`, `PICKER-heartbeat-slot-safety` and `PICKER-landed-marker-continuity` also name this file; the `picker` lane serialises them. Its test goes in `scripts/nextTaskGateRedReview.test.ts`, driving `scripts/next-task.mjs` through the mocked-fetch spawn harness `scripts/nextTask.test.ts` already uses: gate-only red tip run → REVIEW; a failed jobs read → MAKE GREEN; a red run on an older sha → MAKE GREEN; red-first against `243b5e02`.
- Serialisation comes from the `picker` lane, not from `owns`: `laneBusy` releases a lane only when both rows declare disjoint `owns` (`scripts/nextTaskCore.mjs:549-551`), so with no `owns` here a second `picker`-lane build cannot start alongside it. Record any new overlap the moment it appears.

## Accept

- Red-first, in a new `scripts/nextTaskGateRedReview.test.ts` that fails against today's core: (a) a Tier 1 head red whose job data shows only the review-gate step failed → `{ kind: "review" }`; (b) the same head with any other step failed → still `green`; (c) unknown CI or an unreadable job list → still `green`; (d) a claimant whose model built or fixed the head → still skipped; (e) a green head's existing REVIEW hand-out unchanged.
- `scripts/nextTask.test.ts` stays green as written, including the `:47-62` first-pick pin, and `validateAssignments` still returns `[]` against the live list and register.
- `pnpm check`; `LANG=en_US.UTF-8 pnpm vitest run` for `scripts/`; `pnpm build` when `ci.yml` changed. `node scripts/design-token-audit.mjs` and `node scripts/check-deploy-triggers.mjs` unchanged and green.
- Live proof on the pull request, not a claim: the `typecheck` job log shows the gate step by name, and `node scripts/next-task.mjs --claim "<session>"` prints a REVIEW hand-out for a gate-only-red Tier 1 row where today it prints MAKE GREEN. Paste the printed assignment and the run id in the PR.
- This row does not land any parked row: after it, each of `FIX-device-signin` (#952), `D-048-p3-inbox` (#815), `REL-client-capture` (#851), `REL-webhook-auth-alarm` (#850), `D-086.count`, `D-174-job-sources-more`, `D-048-p3-employer-talent` (#979) and `D-048-p3-admin-money` (#986) still needs its own independent pass on its exact head, then its ordinary landing on green required CI.

## Status

- `PICKER-gate-red-review-route`: unblocked by D-291 (2026-11-07, Hark · 9508) — **clears to BUILD the `scripts/next-task.mjs` wiring hunk (and its test) only.** PR #1008 (branch `agent/queue/picker-gate-red-review-route`, head `243b5e02`, CI run `42314917150` green) carries the classifier, the `tier1(v)` route, the `ci.yml` gate step and their tests, but nothing sets `ci.gateOnly` in a live run, so the cure is inert. **A LAND of #1008 before the wiring commit is on that branch and required CI is green on that exact head lands an inert cure and is forbidden.** After that it lands as an ordinary Tier 2 pull request; no parked row lands from it. (Registered by D-286, 2026-11-05.)
- Progress (2026-11-07, Hark · 25a6): wiring commit `4a8eb5e2` by Hark · 25a6 (D-291 hunk in `state()`'s `prCi` loop; `ciStateFromRuns` carries `runId` in `scripts/nextTaskCore.mjs`), spawn-harness tests `f2858ce6`; awaiting required CI green on the exact head and a fresh lander.
