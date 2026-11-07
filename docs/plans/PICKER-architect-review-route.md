# Packet PICKER-architect-review-route: a Tier 1 packet pull request whose only red is the review gate is handed its REVIEW

> A packet is written and opened as a pull request on its architect lock `agent/architect/<slug>` (D-190). The review gate deliberately maps that branch back to the row (`findGateRow`), so a Tier 1 row's packet pull request is red until an independent pass names its exact head (D-074 (3), D-151). But the picker's packet path hands only ARCHITECT (rewrite the packet) or, on green CI, LAND. It never hands REVIEW, and `next-task.mjs --verdict` names the task branch's tip, not the lock's. So a Tier 1 packet pull request can never lawfully go green, and D-190 (3) lets a packet land only "whose review passed". This row lets the picker's own REVIEW hand-out reach that case, with its normal claim, lock and verdict machinery, and nothing else.

| Field | Value |
|---|---|
| Row | `PICKER-architect-review-route` (Tier 2, lane `picker`) |
| Branch | `agent/queue/picker-architect-review-route` |
| Registered by | D-294 (2026-11-07), docs-only, on the architect lock `agent/architect/picker-architect-review-route` |
| Depends on | `REVIEW-GATE-fetch-parity` (D-292, PR #1013) |
| Decisions | D-074 (3) (independent Tier 1 review before `main`), D-151 (reviewer independence by model), D-190 (packet pull requests, never the writer, one at a time), D-286 and D-291 (the gate-only-red review route and its wiring), D-292 (the named gate step evaluates), D-202 (re-sync first), D-134 (no work while a dependency is open), D-200 (any session registers rows and records rulings), D-032 (better approach with evidence) |
| Synced to | D-294 |

## 1. Goal

When a row with `tier: 1` and `status: "architect"` has its packet open as a pull request from `agent/architect/<slug>`, and the newest completed CI run on that lock's exact tip is red only at the step "Review gate (independent Tier 1 pass)" (`ci.gateOnly`, D-291), `node scripts/next-task.mjs` hands a session that may review it a REVIEW of that pull request, on `agent/review/<slug>`, through the same claim, lock and `--verdict` flow every Tier 1 review uses. After the pass, a CI re-run on the same head goes green and the existing D-190 packet LAND (never the writer, one at a time through the landing slot) applies unchanged.

## 2. Binding rules (quoted from `docs/DECISIONS.md` on `main` `8e1be413`)

- **D-074 (3):** "Tier 1 packets (credits, payments, refunds, the ledger, sign-in, sessions, identity linking, privacy, migrations) get an independent review by a different model session before they reach `main`, on a draft pull request so CI runs on the branch."
- **D-190 (3):** "Any session other than the packet's writer lands a packet pull request whose review passed: take the landing slot with a `Land claim <id>: <name>` marker on `agent/queue/landing`, merge `main` (never rebase), keep every row `main` has unchanged and add only the packet's rows (D-183), run `validateAssignments` (it must print `[]`) and `vitest run scripts/`, wait for the required checks on that exact head, land with the merge-commit button, release the slot and report landed." D-190 (2) sets the order: the waiting packets land "one at a time in that order".
- **D-151 (1):** "an agent's model is the part of its name before \" · \" (`modelOf` in `scripts/nextTaskCore.mjs`), and a session of a model that built, took over or pushed a fix to a Tier 1 pull request neither reviews it nor lands it after a passed review. Any other model's session may, including the reviewer who wrote the findings". D-151 (3): "the picker compare[s] models, so a same-model session is never handed such a review or landing."
- **D-291 (2):** the wiring "fails closed: any fetch or parse error, a missing run id or a run not on the branch tip leaves `gateOnly` false (today's MAKE GREEN)."
- **D-292 (1), registered on `main` by PR #1013 (merge `20adbd8e`); its build is not done yet:** on run `42339003779` the named step "is `success` after printing \"review-gate: could not run (… invalid object name 'origin/main'.) — not failing the branch\"", so "`gateOnlyRedFromJobs` … on a real run … is always false and the picker still hands MAKE GREEN."

**Discrepancy, recorded:** D-190 (3)'s "a packet pull request whose review passed" and D-074 (3) agree with each other, but `scripts/nextTaskCore.mjs:795-796` reads D-190 as "the docs path: no Tier 1 review", and the board at `:1105` says "a packet pull request goes the docs path, never through a Tier 1 review". That reading holds for Tier 2 and 3 packets. It does not hold for a Tier 1 row, because the review gate in CI (`scripts/review-gate.mjs:42`) enforces D-074 (3) on the lock branch anyway. The code comments are the defect, not the register.

## 3. Current behaviour (verified on `main` `8e1be413`, file:line)

- `scripts/review-gate.mjs:38-44` `findGateRow`: `const marker = /^agent\/(architect|review|heartbeat)\/([^/]+)$/.exec(branch);` maps `agent/architect/<slug>` back to the row, deliberately, and `:256` runs `reviewGateViolation` for it. A Tier 1 row's packet pull request therefore needs `Verdict pass` naming its exact head on `agent/review/<slug>` (`:118-132`), from a model that is not among the lock's `Claim`/`Takeover` markers (`:134-139`).
- `scripts/nextTaskCore.mjs:579-581` `buildView`: `const packet = task.status === "architect" && Boolean(arch) && (arch.work === true || packetMerged); const work = packet ? archName : workBranchOf(task, branches);` So for a packet the lock is `work`, `info` is the lock, `builders` (`:601`) are the lock's `Claim`/`Takeover` markers (the writers), and `gateOnlyRed` (`:607`) is already computed against the lock's tip.
- `scripts/nextTaskCore.mjs:609`: `open: task.status === "todo" && …`. A packet row is never `open`, so `actionFor` never reaches `if (v.pr && v.task.tier === 1) return tier1(v);` (`:772`), the only REVIEW hand-out for a pull request (`:732-739`).
- `scripts/nextTaskCore.mjs:795-808` is the whole packet path: `if (v.packet && v.pr && v.ci === "green") { … return { kind: "land", … packet: true … } }`; `if (v.packet && v.pr && v.ci === "error") return skip(…)`; then `if (v.task.status === "architect") { … return { kind: "architect", … } }`. Red or running CI falls through to ARCHITECT (or "is writing its packet"). There is no REVIEW.
- `scripts/next-task.mjs:284-305`: the D-291 jobs read already covers the lock, because `heads` keeps every open-PR head ending in `/<slug>`, and `agent/architect/<slug>` does.
- `scripts/next-task.mjs:376` accepts a verdict only from the holder of `agent/review/<slug>` at stage `in-review`, and `:380-381` writes the reviewed head as `tip(task.branch)`, failing with "`<branch>` is not on origin; there is no head to review" when the task branch is absent. For #878 the task branch `agent/queue/d089-request-inbox` is not on origin (the only `d089-request-inbox` heads are `agent/architect/…`, `docs/d266-…` and `docs/d280-…`). So even a manually reached review could not record a pass naming the pull request's head.
- `scripts/nextTaskCore.mjs:1105-1106` (board): `const review = pr && task.tier === 1 && !v.packet ? v.review : null;`.

**Conclusion (verified):** a Tier 1 packet pull request can never lawfully go green. The gate demands a pass on its exact head, the picker never hands its REVIEW, `--verdict` cannot name its head, and a manual marker is what D-200, D-151 and the picker's claim rules exist to replace.

### Live case: PR #878

Read through the GitHub API on 2026-11-07 (Sat 11:20 AM IST, UTC+05:30):

- PR #878 "D-289: D-089-request-inbox packet (employee request-inbox link with screen name, loop L4)": `state: open`, `draft: true`, head `agent/architect/d089-request-inbox` at `e1128076273a9577c703d67e8425253901406616`, base `main`, `mergeable_state: blocked`.
- Row `D-089-request-inbox` on `main`: `tier: 1`, `status: "architect"`, branch `agent/queue/d089-request-inbox`, `packet: null`.
- Run `42339003779` (CI, `pull_request`, attempt 1, head `e1128076`, created Sat 10:03 AM IST): `conclusion: failure`. Jobs: `typecheck` (`128302286336`) failure; `production build`, `unit + component + route tests` and `e2e journeys` success. Within `typecheck`, the only failed step is 12 "Scope check (declared file ownership)"; step 11 "Review gate (independent Tier 1 pass)" succeeded after printing "review-gate: could not run (Command failed: git show origin/main:docs/plans/assignments.json". Step 12 then printed "review-gate: D-089-request-inbox at e1128076: Tier 1: this head has no independent passing review (D-074, D-151). Run node scripts/next-task.mjs to get a review. Nobody has reviewed D-089-request-inbox yet."
- No `agent/review/d089-request-inbox` exists. The lock's writer markers since `main` are `Claim … Hark · b6a8`, then `Takeover` by Antigravity · 5a06, Hark · a442, Qoder · f00e, Claude Code · 1999, DeepSeek V4.1 Flash Free · f227, D-093-language · 69c0 and Hark · 27b8. Under D-151 its reviewer must be a model outside that set.

The case is red only for the missing Tier 1 review. Today `gateOnlyRedFromJobs` reads that run as false, because the failed step is Scope check (D-292). Once REVIEW-GATE-fetch-parity lands and the run is repeated, it reads true, and nothing in the picker can act on it. That is the omission this row closes.

## 4. Why this depends on `REVIEW-GATE-fetch-parity`

The route keys on `v.gateOnlyRed`, which comes only from `gateOnlyRedFromJobs` and the step named `GATE_STEP` (`scripts/nextTaskCore.mjs:306-336`). On `main` today that step fails open on every pull request (D-292 (1)), so a review-only red always surfaces under Scope check and `gateOnlyRed` is always false on a real run. Without D-292's fix, the hand-out added here can be proven only on fixtures. The live proof (§8) and any real effect need the gate step to evaluate. `dependsOn: ["REVIEW-GATE-fetch-parity"]` also holds the build under D-134 until that row is done.

## 5. Change (the build)

**R1. The packet path gains one REVIEW branch, before the ARCHITECT fallback** (`scripts/nextTaskCore.mjs` `actionFor`, between the `ci === "error"` skip at `:803` and `if (v.task.status === "architect")` at `:804`). The order of checks above it is unchanged, so `done`, an unmet dependency (`:756`) and a D-202 re-sync (`:794`) still come first. It applies only when all of these hold:
- `v.packet && v.pr && Number(v.task.tier) === 1`;
- `v.gateOnlyRed === true` (D-291: red, `ci.gateOnly === true`, and the run's `sha` equals the lock's tip);
- `v.review === "needs-review"`, or `v.review === "in-review"` with a quiet review lock (the same states `tier1()` uses at `:732`).

It returns `{ kind: "review", task, work: v.archName, pr: v.pr, lock: v.lockName, lockExists: Boolean(v.lock), builder: v.owner, packet: true }`. The claim, the `Review claim` marker on `agent/review/<slug>`, the stage lock and the printed review steps are the existing ones, with no new marker verb and nothing written by hand.

**R2. Independence (D-151, D-190).** Before R1 returns, `did(v, ["builders", "fixers"])` must be false. For a packet, `builders` are the lock's `Claim`/`Takeover` markers, so this bars every model that wrote or took over the packet, which is the same set `review-gate.mjs:134-139` enforces in CI. A skip says "needs a review, and you wrote or fixed its packet". The writer still never lands: the green LAND at `:797-801` keeps its `v.writers.includes(claimant)` skip unchanged.

**R3. Fail closed.** Every other packet case keeps today's behaviour. That covers red that is not gate-only, `gateOnly` unknown or false, a run on an older sha, `running`, `running-after-red`, `error`, `unknown`, a Tier 2 or 3 packet, and a Tier 1 packet whose review stage is `fixing`, `needs-fix`, `passed` or `landing`. No REVIEW is ever handed when the classification is uncertain. A gate-only red on a packet whose review already `passed` (the run predates the verdict) is a skip ("review passed; re-run CI on `<pr>` on its exact head"), never MAKE GREEN, FIX or ARCHITECT. The review steps for a packet say to re-run the failed jobs on the same head after `--verdict pass`.

**R4. The verdict names the pull request's head** (`scripts/next-task.mjs:380-381`). When the row is a packet (`status: "architect"` and the architect lock is on origin with an open pull request), `reviewed` is the lock's tip, not `task.branch`'s. Every other row keeps `tip(task.branch)` and its "not on origin" failure. `:376`'s holder check is unchanged.

**R5. One at a time.** REVIEW takes no landing slot. Landing stays the existing D-190 path through `agent/queue/landing`, one at a time, and the hand-out sits in the same top-down pending pass, so no packet jumps the FIFO order.

**R6. Board and text.** `scripts/nextTaskCore.mjs:1106` shows the review state for a Tier 1 packet pull request (drop `&& !v.packet` for `tier === 1` only), and the misleading comments at `:795` and `:1105` say "Tier 2/3 packets go the docs path; a Tier 1 packet needs its review (D-074 (3), D-294)". `scripts/nextTaskText.mjs` prints for `pick.packet` that the review is of the packet and its rows (not code), on `pick.work` (the lock), and ends with the re-run step from R3.

## 6. Files

In scope (the build may touch only these):
- `scripts/nextTaskCore.mjs`: R1, R2, R3, R6 (board and comments).
- `scripts/next-task.mjs`: R4 only.
- `scripts/nextTaskText.mjs`: R6 (packet review wording).
- `scripts/nextTaskArchitectReview.test.ts` (new): §7.

Always allowed: `docs/plans/assignments.json` (this row's status at landing) and this packet's `## Status

- `PICKER-architect-review-route`: in progress - Instinct · 09c7 - 2026-11-08 - branch agent/queue/picker-architect-review-route; ordinary picker claim db56b45a. Packet drafted by Hark · b06c, registered D-294.
- Coordination: accidental D-100.otp-hmac review claim 0a6b1b7a/heartbeat96963710 is untouched, holds remain in force, no review/verdict or renewal; factual correction on PR #884. No release/unclaim command exists; normal quiet expiry applies. Exact comma-list avoid is corrected. Supported avoided-continuation routing (nextTaskCore.mjs) selected this build; no review outcome or handoff is claimed.
