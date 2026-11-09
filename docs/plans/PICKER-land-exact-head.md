# Packet PICKER-land-exact-head: a LAND hand only on green CI for the pull request's current tip

> The picker hands LAND for a Tier 2 pull request whenever the newest completed CI run on its branch is green, without checking that the run is on the branch's current tip. A green run on an older sha, or no run at all among the newest 100, still reads as landable. PR #994 is the live case: its tip `7aeaf8fb` has no CI workflow run, and the picker reads it green from run `42094576051` on `58e065cb`. This row makes every LAND hand require a green required-checks run whose `head_sha` equals the branch's current tip. Anything else gets no LAND. It changes no gate, no required check, no branch protection, no `ci.yml` and no product behaviour.

| Field | Value |
|---|---|
| Row | `PICKER-land-exact-head` (Tier 2, lane `picker`) |
| Branch | `agent/queue/picker-land-exact-head` |
| Registered by | D-293 (2026-11-07), docs-only, on the architect lock `agent/architect/picker-land-exact-head` |
| Amended by | D-298 (2026-11-08), docs-only unblock ruling on the same lock: §6 admits five picker suites for fixture-data-only edits, §8 adds case (l), and the `ciOnTip` green-without-a-sha carve-out on PR #1028 is deleted. R1-R5 are unchanged. |
| Decisions | D-082 (green CI on the exact commit before it reaches `main`), D-085 (one picker, every read known or unknown), D-109 (one CI read per pull request batch; an unreadable read is skipped, not a stop), D-286 (the review route), D-291 (the exact-tip comparison on the gate-only path), D-200 (any session registers rows and records rulings), D-032 (better approach with evidence; the owner decides), D-074 (packets), D-298 (the fixture-data-only admission and the deleted carve-out) |
| Synced to | D-298 |

## 1. Goal

`node scripts/next-task.mjs` never prints `LAND <task>` (or `CONTINUE: LAND <task>`) unless the CI run it relies on is green and its `head_sha` is the task branch's current tip on origin. A pull request whose tip has no completed green run is never offered for landing. The green-CI ruleset still refuses such a merge (D-082), but today the picker sends a session to try. It writes a `Takeover` marker on the work branch and a `Land claim` on the landing slot, holds the slot for `LAND_IDLE_MS`, and the session then has to work out by hand why it cannot land. That is what happened on #994 (§3).

## 2. Binding rules (quoted)

- D-082 (3): "GitHub CI is green on that exact commit before it reaches `main`". (4): "land that same commit (merge the pull request, or fast-forward `main` to it); if `main` moved meanwhile, merge again and wait for green again".
- D-291 (2): the gate-only read "fails closed: any fetch or parse error, a missing run id or a run not on the branch tip leaves `gateOnly` false (today's MAKE GREEN)". This row applies the same exact-tip rule to the LAND decision.
- D-085: "every GitHub read is known or unknown; an unknown one stops the picker instead of looking like 'nothing there'" (the comment at `scripts/next-task.mjs:263`). Today an unknown CI read on a Tier 2 pull request hands LAND (§4).
- AGENTS.md rule 5 / D-082 (6): never weaken, skip or delete a test, and never bypass protection.

## 3. Evidence (measured 2026-11-07, Sat 10:55-11:10 AM IST (UTC+05:30); quoted verbatim)

**PR #994** (`D-048-p3-admin-approvals`, branch `agent/queue/d048-p3-admin-approvals`). `GET /repos/ayodhyamohanthy/skipwaitmanus/pulls/994`:

```
"state": "open", "draft": true,
"head": "agent/queue/d048-p3-admin-approvals",
"sha": "7aeaf8fbfe8c2c7226d9a64de07244ba302147f8"
```

**No CI workflow run on the tip.** `GET /actions/runs?head_sha=7aeaf8fbfe8c2c7226d9a64de07244ba302147f8`:

```
{ "total_count": 0, "runs": [] }
```

`GET /commits/7aeaf8fb…/check-runs` has one check run, `{"name":"Workers Builds: skipwaitmanus","status":"completed","conclusion":"success"}`, which is not a gate (D-082). `GET /commits/7aeaf8fb…/status` is `{"state":"pending","total_count":0}`.

**The run the picker reads.** `GET /actions/runs/42094576051`:

```
"id": 42094576051, "name": "CI", "status": "completed", "conclusion": "success",
"head_sha": "58e065cb3451ec6c50ea72c730ed1fc9b88836bd",
"head_branch": "agent/queue/d048-p3-admin-approvals", "event": "pull_request",
"created_at": Fri 2026-11-06 1:00 AM IST (UTC+05:30)
```

**What the picker computes.** This was replayed read-only: the same call `state()` makes (`GET /actions/workflows/ci.yml/runs?per_page=100`), filtered by `head_branch` as at `scripts/next-task.mjs:289`, then passed through the real `ciStateFromRuns` from `scripts/nextTaskCore.mjs`:

```
runs on branch in window: [{"id":42094576051,"sha":"58e065cb","status":"completed","conclusion":"success"},{"id":42091264806,"sha":"ddabbd40","status":"completed","conclusion":"success"},{"id":42090441833,"sha":"89f65576","status":"completed","conclusion":"cancelled"},{"id":42085009541,"sha":"5aedded6","status":"completed","conclusion":"success"}]
ciStateFromRuns: {"state":"green","sha":"58e065cb3451ec6c50ea72c730ed1fc9b88836bd","url":"https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/42094576051","runId":42094576051,"at":1793907675000}
```

The window ran from Fri 2026-11-06 12:00 AM to Sat 2026-11-07 10:25 AM IST. Run `42094576051` is near its oldest edge. When it ages out, the same row reads `{ state: "unknown" }`, and the Tier 2 path still hands LAND (§4).

**Why the tip has no run.** The four commits after `58e065cb` are empty picker markers (`git show --name-only` lists 0 files for each), and none has a CI workflow run (`total_count: 0` for `36ff22c3`, `c8247422`, `cda0e624` and `7aeaf8fb`):

```
7aeaf8fb Sat 2026-11-07 7:13 AM IST  Takeover D-048-p3-admin-approvals: Dev (Skydive) · afc1
cda0e624 Sat 2026-11-07 3:35 AM IST  Takeover D-048-p3-admin-approvals: DeepSeek V4.1 Flash Free · 1d98
c8247422 Fri 2026-11-06 7:14 PM IST  Takeover D-048-p3-admin-approvals: Qoder · 6498
36ff22c3 Fri 2026-11-06 7:20 AM IST  Claim D-048-p3-admin-approvals: Hark · 5de4
58e065cb Fri 2026-11-06 1:00 AM IST  D-048-p3-admin-approvals: full-scroll payment record capture; link the tier amendment #995
```

This packet does not establish why GitHub started no run for those pushes, and it does not depend on that. The defect is that the picker treats an older sha's run as the tip's. `cda0e624` and `7aeaf8fb` are the `Takeover` markers that LAND hands themselves wrote, so the defect also feeds itself: every LAND hand moves the tip further from the last run.

**Board line** (read-only `node scripts/next-task.mjs --status` on `main` `8e1be413`, 2026-11-07 ~11:07 AM IST; `--status` only fetches and never pushes, `scripts/next-task.mjs:397-403`):

```
137. D-048-p3-admin-approvals — W6 /admin/approvals and /admin/approvals/:kind/:id (re-tier to 1 if identity or money decisions found) · CDO · Tier 2 · GREEN · pr-green · unblocking: Dev (Skydive) · a4da · Dev (Skydive) · afc1 · quiet 3h · https://github.com/ayodhyamohanthy/skipwaitmanus/pull/994 · behind main 116 · report: review — DeepSeek V4.1 Flash Free · 1d98: …
```

The row is Tier 2 on `main` (`docs/plans/assignments.json`: `"tier": 2`, `"status": "todo"`; the re-tier to 1 is on unlanded #995), so the Tier 2 LAND path applies.

**The LAND hand, as recorded on #994.** Comment `6697418224` (Sat 2026-11-07 3:58 AM IST, https://github.com/ayodhyamohanthy/skipwaitmanus/pull/994#issuecomment-6697418224):

> The picker handed `LAND D-048-p3-admin-approvals` at 22:05Z and wrote two empty markers before the hold could be read:
> - `cda0e624` — `Takeover D-048-p3-admin-approvals: DeepSeek V4.1 Flash Free · 1d98` on this branch (tree `c7ee8f4d`, identical to `c8247422`; no CI/review content changed). …
> - `5f42cef5` — `Land claim D-048-p3-admin-approvals: DeepSeek V4.1 Flash Free · 1d98` on `agent/queue/landing`.

**Coordinator landing-lane comment.** Comment `6702703550` (Sat 2026-11-07 10:46 AM IST, https://github.com/ayodhyamohanthy/skipwaitmanus/pull/994#issuecomment-6702703550):

> Landing-lane hold (Instinct coordinator comment, 2026-11-07 ~10:45 IST - process note, not an owner instruction):
>
> The picker's current LAND hand for this row is based on CI run 42094576051 on sha `58e065cb`, which is NOT the current head. Current head `7aeaf8fb` has no CI workflow run (only Workers Builds). The PR is still draft, mergeable_state dirty, and the body above opens "DO NOT LAND: Tier 1 hold".
>
> Before any mark-ready or landing, this row still needs: … (2) green required CI on the EXACT head; …

The measurements above match the coordinator's description.

## 4. Current behaviour (`main` `8e1be413`, file:line)

- **The exact-tip comparison exists only on the gate-only path.** `scripts/next-task.mjs:294-305` (D-291): for a red head, `:301` reads `tipSha = tryGit("rev-parse", "--verify", "-q", originRef(head))`, and `:302` `if (!Number.isSafeInteger(ci.runId) || !tipSha || ci.sha !== tipSha) continue;` leaves `gateOnly` false. The core repeats the check at `scripts/nextTaskCore.mjs:607`: `gateOnlyRed: ci.state === "red" && ci.gateOnly === true && typeof ci.sha === "string" && Boolean(info?.tipSha) && ci.sha === info.tipSha`. A green state gets no such comparison anywhere.
- **The CI state is the branch's newest completed run, whatever its sha.** `scripts/next-task.mjs:285-293` reads the newest 100 `ci.yml` runs once and sets `prCi.set(head, ciStateFromRuns(runs.filter(r => r.head_branch === head)))` (`:289`). It filters by branch name only, never by `head_sha`. `scripts/nextTaskCore.mjs:288-299` `ciStateFromRuns` picks `done = runs.find(r => r.status === "completed" && r.conclusion !== "cancelled" && r.conclusion !== "skipped")` (`:291`), and returns `state: "green"` when it is not red (`:295`), with `sha: done.head_sha` (`:298`). It never compares that sha with anything.
- **The view drops the sha.** `scripts/nextTaskCore.mjs:584` `const ci = pr ? prCi.get(work) ?? { state: "unknown" } : { state: "unknown" };`, and `:600` exposes only `ci: ci.state` to the hand-out logic. `info.tipSha` (the origin tip from `loadBranches`, `scripts/next-task.mjs:122`) sits in the same view but is never compared with `ci.sha` except at `:607`.
- **The Tier 2 LAND hand.** `scripts/nextTaskCore.mjs:770-786` (in `actionFor`): `v.ci === "error"` skips (`:771`), red hands MAKE GREEN (`:774-776`), running skips (`:782`). Then `:783-786` `if (v.pr) { … return { kind: "land", task: v.task, work: v.work, pr: v.pr, tier1: false, from: v.owner }; }`. Every other state reaches LAND: `"green"` on any sha, and also `"unknown"` (no completed run on the branch among the newest 100). This is where the cited run is chosen and acted on without a tip check.
- **The other LAND paths share the cause**, because they read the same `v.ci`: the Tier 1 hand at `:744-747` (passed review, `v.ci` not red or running), the packet hand at `:797-801` (`v.ci === "green"` on the architect lock), the own-work `continue` at `:915` (`of: v.ci === "red" ? "green" : "land"`) and `:906`, and the packet lander's continue at `:918`. The board's `pr-green` (`:1115`, `:1118`, `:1129`) reads the same value, which is why #994 shows `GREEN · pr-green` (§3).

## 5. Rulings (decided under D-200, recorded as D-293, changeable)

**R1. LAND requires green CI on the exact tip.** A CI state is "landable" only when `state === "green"`, `sha` is a string, the view's `info.tipSha` is known, and `sha === info.tipSha`. This is the same comparison as `:607`. It is put in one place: a pure exported helper in `scripts/nextTaskCore.mjs` (for example `ciOnTip(ci, tipSha)`), applied where the view reads `ci` (`:584`). That helper returns the state unchanged for `red`, `running`, `running-after-red` and `error`. It returns a new state `"no-tip-ci"` (carrying `sha`, `runId` and `tipSha` for the message) when the state is `green` on another sha, when it is `unknown` with an open pull request, or when the tip is unreadable. Because every LAND path (Tier 2, Tier 1, packet, `continue`) and the board read `v.ci`, one change covers them all. No path can land on `"no-tip-ci"`.

**R2. Fail-closed hand for `"no-tip-ci"` (Tier 2): MAKE GREEN when the branch is quiet, otherwise wait.** In `actionFor`, after the red and running checks and before `:783`:
- Work branch quiet for `IDLE_MS` (2 h, the same `idle` test as `:773`): hand the existing `green` kind (MAKE GREEN), with `why` = "CI has not run on the tip `<tip8>` of `<pr>` (the newest completed run `<runId>` is on `<sha8>`, or none was found): bring the branch up to date with `main` with a two-parent merge, never a rebase, and push it so required CI runs on that exact head; do not land on an older run (D-082, D-293)". `nextTaskText.mjs:272-273` already prints `pick.why` for a fresh MAKE GREEN, so no text file changes.
- Work branch not quiet: `skip(v, "waiting for CI on the tip <tip8> of <pr>")`. Nobody is handed anything, and the holder's next push starts CI.

*Why MAKE GREEN, not a bare skip or a new hand kind.* A skip alone would park #994 for good. Its tip got no run from four marker pushes, and nothing in the picker would ever start one. MAKE GREEN already means "get required CI green on this exact head" (D-082). It already carries the 2-hour idle rule, `--avoid` semantics (`AVOID_HOLDS` includes `green`, `:634`), the claim marker and the printed steps. A new kind would need new text, claim and avoid wiring. *Why not "sync" as its own hand:* MAKE GREEN's printed steps (`scripts/nextTaskText.mjs:86`) already say "merge the latest origin/main, re-run the full gate, push, and wait until every check on that exact commit is green", and #994 is `behind main 116` and `DIRTY`. The `why` line must say that the MAKE GREEN `Takeover` marker is an empty commit, which (as measured on #994) does not get a CI run by itself, so a real sync push is required.

**R3. `"no-tip-ci"` on the other paths: no LAND, no new routing.**
- Tier 1 (`tier1(v)`): `"no-tip-ci"` is handled like `running`: `skip(v, "waiting for CI on the tip <tip8> of <pr>")`, and the review and fix stages are not affected. A passed review on the tip still needs green CI on that tip before LAND, and the review gate already voids a pass on any non-merge commit.
- Packet pull requests (`:797`): `"no-tip-ci"` is not `"green"`, so the packet LAND is not offered. The packet stage falls through as it does today for a non-green packet pull request.
- Own work `continue` (`:915`): `of` is `"land"` only when `v.ci === "green"` (now tip-verified), `"green"` when red, and `"build"` otherwise. The holder keeps building and pushes, which starts CI.
- Board: `"no-tip-ci"` is not in the `pr-*` maps, so it falls to `pr-open` (`:1118` `?? "pr-open"`) and never shows GREEN. No `nextTaskText.mjs` change.
- Red stays as it is today, whichever sha the red run is on: a red head holds its lane and hands MAKE GREEN as before. This row only gates LAND, so it never turns a red into a green or a wait.

**R4. Find the tip's run when it has aged out of the window (`scripts/next-task.mjs`, one hunk).** R1 alone would wrongly deny LAND to a pull request whose green tip run is older than the newest 100 runs. So in `state()`, after the batch at `:289`, for each open task head whose `ciStateFromRuns` sha is not its origin tip (read with the same `tryGit("rev-parse", "--verify", "-q", originRef(head))` as `:301`), make one read: `GET /actions/workflows/ci.yml/runs?head_sha=<tip>&per_page=10`, with the same `github()` helper, host and token. Replace that head's entry with `ciStateFromRuns(<those runs>)`. It fails closed: any fetch or parse error, an empty answer or an unreadable tip leaves the batch value, and R1 then makes it `"no-tip-ci"`, so there is no LAND. The error is logged as the existing reads are (`console.error("next-task: …")`). This adds at most one read per open task pull request whose newest run is not on its tip (D-109's budget: on today's board that is a handful, not one per row). No other hunk in `scripts/next-task.mjs`.

**R5. Bounds.** There is no new, renamed or removed required status check, no branch-protection or ruleset change, and no `.github/workflows/ci.yml` change. `ciStateFromRuns`'s own contract and `mainCi` (`:266`, main's push runs) are unchanged. `scripts/review-gate.mjs`, `scripts/scope-check.mjs` and `scripts/queue-gate.mjs` are not touched. The landing procedure (`landSteps`), the landing slot, D-151 independence and D-190 are unchanged. Nothing is waived, downgraded or skipped.

## 6. Files (amended by D-298, 2026-11-08)

In scope:
- `scripts/nextTaskCore.mjs`: the R1 helper and its use at `:584`, the R2 branch in `actionFor` before `:783`, the R3 Tier 1 skip in `tier1(v)`, and the `continue` `of` at `:915`. R1 means what it says: a green state whose `sha` is not a string is `"no-tip-ci"`, never green. The `// Unit-test fixtures passing bare { state: "green" } without sha stay green.` carve-out at `:320-321` on PR #1028's head `ce23492f` is deleted (D-298 (2)): it is a production fail-open on a run payload with no `head_sha`, and it contradicts R1.
- `scripts/next-task.mjs`: the single R4 hunk in `state()` after `:289`.
- `scripts/nextTaskLandExactHead.test.ts` (new): §8.
- **Fixture data only (D-298 (5)):** `scripts/nextTask.test.ts`, `scripts/nextTaskArchitectLanding.test.ts`, `scripts/nextTaskAvoidLand.test.ts`, `scripts/nextTaskHeartbeatSlot.test.ts`, `scripts/nextTaskLandingWaitFallthrough.test.ts`. Allowed: a `sha` on a green `prCi` entry equal to that branch's `tipSha`; a `tipSha` on a branch fixture that has none; an explicit `prCi` where a Tier 1 landing fixture omitted one; and, in the heartbeat harness's injected fetch, a completed successful `ci.yml` run whose `head_sha` is the disposable origin's real branch tip instead of `workflow_runs: []`. Forbidden: deleting, renaming, skipping, todo-ing or focusing a test; removing or loosening an assertion; changing any expected value, any `it`/`describe` title or any `PINNED_TESTS` entry; defaulting an omitted `prCi` to green (omitted must keep meaning `unknown`); and any edit that is not the CI/tip data the fixture always meant. Measured: with the carve-out deleted these five suites fail 37 cases, and with these data-only amendments all 287 cases in the ten `scripts/nextTask*.test.ts` files pass, `testIntegrityViolations` returns `[]`, and the 7 assertion lines touched in `nextTask.test.ts` keep their expectations byte-identical (D-298 (3)).

Always allowed: `docs/plans/assignments.json` (this row's status at landing) and this packet's `## Status`.

Out of scope, and not edited: `scripts/nextTaskText.mjs`, `scripts/review-gate.mjs`, `scripts/scope-check.mjs`, `scripts/queue-gate.mjs`, `.github/workflows/ci.yml`, `scripts/nextTaskGateRedReview.test.ts` and `scripts/nextTaskLandedMarkerContinuity.test.ts` (both pass under strict R1 as written, measured), every other existing picker suite, and anything under `server/`, `client/`, `shared/` or `drizzle/`. If a needed hunk falls outside this set, stop and `--report blocked` with the measured reason instead of widening (the D-291 precedent).

**No `owns` field (measured, not chosen).** `scripts/nextTaskCore.mjs` is already owned by the unstarted rows `PICKER-fullstack-lights`, `PICKER-qa-stage` and `PICKER-landing-wait-fallthrough` (and `scripts/next-task.mjs` by the first two); `scripts/nextTask.test.ts` by the first two, and `scripts/nextTaskLandingWaitFallthrough.test.ts` by the third (D-298 (6)). `validateAssignments` rejects two rows owning a path when neither waits on the other, and `dependsOn` edges to those rows would park this fix behind unstarted work. So, like `PICKER-gate-red-review-route` (D-286 (4)), the build serializes on the `picker` lane, and the files it may change are the ones named here.

## 7. Dependencies

`dependsOn: []`. The fix stands alone. It reuses the D-291 exact-tip pattern already on `main` (#1008 merged at `8e1be413`); `PICKER-gate-red-review-route` is landed, so naming it adds nothing. It does not depend on `REVIEW-GATE-fetch-parity` (D-292, PR #1013), which is a different defect (§10).

## 8. Red-first acceptance tests (`scripts/nextTaskLandExactHead.test.ts`)

Core cases drive `pickNextTask` and `statusBoard` with fixtures in the style of the existing picker suites: a Tier 2 open task with an open pull request, its branch in `branches` with a known `tipSha`, and a `prCi` entry. Wiring cases drive `scripts/next-task.mjs` through the mocked-fetch spawn harness that `scripts/nextTask.test.ts`, `scripts/nextTaskHeartbeatSlot.test.ts` and `scripts/nextTaskGateRedReview.test.ts` already use. Each case marked *red today* must fail against `main` `8e1be413`.

- (a) **Green run on a stale sha → no LAND.** `prCi` `{ state: "green", sha: S_old, runId }`, `tipSha: S_tip`, branch quiet → the pick is `kind: "green"`, its `why` names `S_tip`'s short sha and the run id, and the pick is not `"land"`. *Red today* (LAND).
- (b) **Green run on the tip → LAND.** The same, with `sha === tipSha` → `kind: "land"`, `tier1: false` (unchanged; this pins that the fix does not over-block).
- (c) **No run on the tip → no LAND.** `prCi` `{ state: "unknown" }` with an open pull request, quiet → `kind: "green"` (or the R2 skip when not quiet), never `"land"`. *Red today* (LAND).
- (d) **Tip-read failure → no LAND.** Green `prCi` whose sha matches nothing, with the branch view carrying no `tipSha` → not `"land"`. *Red today.*
- (e) **Stale and not quiet → wait.** As in (a), with a push inside `IDLE_MS` → a skip whose reason contains "waiting for CI on the tip", no hand. *Red today.*
- (f) **Tier 1, passed review, stale CI → no LAND.** The review lock reads `passed` and is quiet, and CI is green on `S_old` → not `"land"`. *Red today.*
- (g) **Packet pull request, green on a stale lock tip → no packet LAND.** *Red today.*
- (h) **Red on a stale sha → MAKE GREEN, as today** (unchanged).
- (i) **Board.** The row in (a) is not `pr-green` and not coloured green. *Red today.*
- (j) **Own-work continue.** The holder of the row in (a) gets `continue` with `of: "build"`, not `"land"`. *Red today.*
- (k) **Wiring, tip run outside the batch.** The batch holds only a green run on `S_old`, and the `head_sha=<tip>` read answers a green completed run on the tip → LAND. That read answers `[]` → no LAND (*red today*). That read answers HTTP 500 → no LAND, with a `next-task:` error on stderr (*red today*). Each of these issues at most one `head_sha` read per head.

- (l) **Green with no sha string → `"no-tip-ci"` (D-298 (2), (5)).** `ciOnTip({ state: "green" }, S_tip)` and `ciOnTip({ state: "green", sha: undefined }, S_tip)` both return `state: "no-tip-ci"`, and a `pickNextTask` board whose open Tier 2 pull request carries that state is not handed `"land"` (quiet → `kind: "green"`, busy → the R2 wait skip). This pins the deleted carve-out: a completed non-red run whose payload has no `head_sha` must never read as landable. *Red on PR #1028's head `ce23492f`*, where `:320-321` returns it green; `ciOnTip` does not exist on `main` `8e1be413`, so this case is not part of the *red today* set.

Existing suites stay green: `scripts/nextTaskGateRedReview.test.ts` and `scripts/nextTaskLandedMarkerContinuity.test.ts` as written (measured under strict R1), and `scripts/nextTask.test.ts`, `scripts/nextTaskAvoidLand.test.ts`, `scripts/nextTaskArchitectLanding.test.ts`, `scripts/nextTaskHeartbeatSlot.test.ts` and `scripts/nextTaskLandingWaitFallthrough.test.ts` with the fixture-data-only amendments §6 admits (D-298). Every assertion and every expected value in all seven stays as it is.

## 9. Definition of done

- §8 red-first: the test commit without the fix fails every case marked *red today*, and with the fix all pass.
- `pnpm check`, `LANG=en_US.UTF-8 pnpm vitest run scripts/`, `validateAssignments` → `[]` and `node scripts/decision-id-check.mjs` exit 0. Green required CI on the exact head (D-082).
- **Live proof, pasted in the pull request.** On the built head, run a read-only `node scripts/next-task.mjs --status` and a preview without `--claim` (`node scripts/next-task.mjs --as "<session>" --avoid …`, nothing pushed). If #994's tip still has no CI run, its board line no longer reads `GREEN · pr-green`, and no preview prints `LAND D-048-p3-admin-approvals`: it prints MAKE GREEN with the R2 `why`, or the wait skip. Quote the line, and the `GET /actions/runs?head_sha=<#994 tip>` answer taken at the same time. If #994 has meanwhile been synced and CI has run on its tip, say so and take the proof on any other open task pull request whose newest run is not on its tip. As the contrast, show a pull request green on its exact tip still reading `pr-green`. No `--claim` is needed for the proof, and the proof writes no marker.
- Not done: this row lands nothing else. #994 keeps every precondition in the coordinator's comment `6702703550`.

## 10. Out of scope

- The review-gate fetch-parity defect (the named CI step "Review gate (independent Tier 1 pass)" fails open without `origin/main`) is `REVIEW-GATE-fetch-parity`, D-292, PR #1013. It is not touched here.
- Why GitHub started no CI run for #994's marker pushes is not investigated here. This row only stops the picker from treating that absence as green.
- #994's own state (draft, DIRTY, the Tier 1 re-tier on #995, the D-287 unblock on #1001) is not changed.

## 11. Stop and ask

- If R1-R4 cannot be met inside the files §6 admits, stop and `--report blocked` with the measured reason.
- If one of the five admitted suites cannot be made green without changing an expected value, removing or loosening an assertion, or editing a title, stop and `--report blocked` naming that case (D-298 (5)): it would mean R1 changes behaviour the suite deliberately pins, and the owner decides (D-032). Do not edit the expectation to fit the fix.
- If the live proof still shows a LAND hand for a pull request whose tip has no green run, stop. Do not widen the hand-out logic further.

## Status

- `PICKER-land-exact-head`: blocked — Antigravity · 2651 — 2026-11-08 — R1-R4 cannot be met within the 3 files of §6: nextTaskHeartbeatSlot.test.ts lines 76, 131-174 mocks workflow_runs: [] and asserts Land claim on agent/queue/landing ("as today"), which D-293 R1/R3 stops; and nextTask.test.ts lines 428, 479, 1488 omit prCi for Tier 1 passed landings. Updating those mocks requires widening scope beyond §6 (the D-291 precedent). Branch agent/queue/picker-land-exact-head carries full R1-R4 implementation and 13/13 passing tests in nextTaskLandExactHead.test.ts.
- `PICKER-land-exact-head`: packet drafted by Hark · ebcc on `agent/architect/picker-land-exact-head` (registered by D-293, 2026-11-07). Draft pull request only: no build and no LAND, and it is not ready for review until the coordinator confirms normal registration and build routing.
- `PICKER-land-exact-head`: built by `Antigravity · 2651` on `agent/queue/picker-land-exact-head`, PR #1028 (draft), head `ce23492f`; reported blocked at `b06fcabb` because §6's three files could not carry R1 (CI run `42403183658`, job `128495186939`, seven failing cases).
- `PICKER-land-exact-head`: block cleared by D-298 (2026-11-08), ruled by `Qoder · 9113` under D-200 on `agent/architect/picker-land-exact-head`. §6 now admits five picker suites for fixture-data-only edits, §8 adds case (l), and the `ciOnTip` carve-out at `scripts/nextTaskCore.mjs:320-321` on `ce23492f` is deleted. Measured on a disposable worktree at `ce23492f`: the deletion alone fails 37 picker cases; with the data-only amendments all 287 cases in the ten `scripts/nextTask*.test.ts` files pass and `testIntegrityViolations` returns `[]`. The row stays `todo`, Tier 2, lane `picker`, `dependsOn: []`, no `owns`; `syncedTo` is `D-298`. The holder continues on the same branch and PR #1028, which lands only on green required CI on its exact tip (D-082). No code is edited by the ruling.


- `PICKER-land-exact-head`: resumed by Instinct · 09c7 through ordinary MAKE GREEN takeover e7e851c4 on 2026-11-08 02:20 IST. Read current main 702e4f48, D-293/D-298 and packet; prior ce23492f failure remains. Applying only registered fixture-data changes and strict R1 missing-sha rejection, preserving every assertion. Separate review and exact-head CI remain owed; no landing claim.

- `PICKER-land-exact-head`: done - code head `d5065f04`, Instinct · 09c7, 2026-11-08. D-298 strict missing-sha rejection and fixture-data-only amendments: red-first `fed2111e` (1 failed/13 passed), strict deletion (37 failed/251 passed), final ten picker suites 288/288 and full scripts 1243/1243. Integrity and registry validation return []; exact-head CI run 42413169158 passed all four required checks. Separate final-version advisory review by Hark · 32ab: PR #1028 comment 6713120252. Read-only live proof: #994 tip0707ed27 has no CI run and reads pr-open/MAKE GREEN, never LAND; exact-green #1018 stays GREEN. This status-only finalization preserves the reviewed production code; protected landing and postmerge checks still must complete before the operational closeout.
