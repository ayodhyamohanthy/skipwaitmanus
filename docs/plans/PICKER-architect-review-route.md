# Packet PICKER-architect-review-route: a Tier 1 packet pull request whose only red is the review gate is handed its REVIEW

> A packet is written and opened as a pull request on its architect lock `agent/architect/<slug>` (D-190). The review gate deliberately maps that branch back to the row (`findGateRow`), so a Tier 1 row's packet pull request is red until an independent pass names its exact head (D-074 (3), D-151). But the picker's packet path hands only ARCHITECT (rewrite the packet) or, on green CI, LAND. It never hands REVIEW, and `next-task.mjs --verdict` names the task branch's tip, not the lock's. So a Tier 1 packet pull request can never lawfully go green, and D-190 (3) lets a packet land only "whose review passed". This row lets the picker's own REVIEW hand-out reach that case, with its normal claim, lock and verdict machinery, and nothing else.

| Field | Value |
|---|---|
| Row | `PICKER-architect-review-route` (Tier 2, lane `picker`) |
| Branch | `agent/queue/picker-architect-review-route` |
| Registered by | D-294 (2026-11-07), docs-only, on the architect lock `agent/architect/picker-architect-review-route` |
| Depends on | `REVIEW-GATE-fetch-parity` (D-292, PR #1013) |
| Decisions | D-074 (3) (independent Tier 1 review before `main`), D-151 (reviewer independence by model), D-190 (packet pull requests, never the writer, one at a time), D-286 and D-291 (the gate-only-red review route and its wiring), D-292 (the named gate step evaluates), D-202 (re-sync first), D-134 (no work while a dependency is open), D-200 (any session registers rows and records rulings), D-032 (better approach with evidence), D-299 (the R7 amendment) |
| Synced to | D-299 |

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

**R7. Review-claim lifecycle (D-085).** `ownStage` (`scripts/nextTaskCore.mjs:945`) admits a packet row for a `of: "review"` continuation when the newest stage marker on the review lock is this session's `Review claim`, exactly as it does for a `todo` Tier 1 row, so the picker hands CONTINUE REVIEW, `heldAllBy` (`:1027`) lists the claim and `--heartbeat` keeps it alive (the generic `review` case of `leaseFor`, `:1062`, heartbeats the lock). The admission is Review-claim-only: `Fix claim`, `Verdict pass` and `Land claim` markers on a packet row keep today's behaviour - no fix or land continuation from this branch, and the packet's landing continuation stays the existing D-190 packet-lander branch (`:963`). Every other packet case keeps today's behaviour (R3).

## 6. Files

In scope (the build may touch only these):
- `scripts/nextTaskCore.mjs`: R1, R2, R3, R6 (board and comments), R7 (`ownStage` review-continuation admission only).
- `scripts/next-task.mjs`: R4 only.
- `scripts/nextTaskText.mjs`: R6 (packet review wording).
- `scripts/nextTaskArchitectReview.test.ts` (new): §7, including (l).

Always allowed: `docs/plans/assignments.json` (this row's status at landing) and this packet's `## Status`.

Not edited: `scripts/review-gate.mjs`, `scripts/scope-check.mjs`, `scripts/queue-gate.mjs`, `.github/workflows/ci.yml`, every existing test file (`scripts/nextTask.test.ts`, `scripts/nextTaskArchitectLanding.test.ts`, `scripts/nextTaskGateRedReview.test.ts` and the rest stay green as written), and anything under `server/`, `client/`, `shared/` or `drizzle/`. No `owns` is declared, for the reason D-286 (4) measured for this lane: `scripts/nextTaskCore.mjs` is already owned by other unstarted picker-lane rows, so serialisation falls to the `picker` lane (`laneBusy`). A hunk outside the in-scope set stops and reports through the picker (`--report blocked`) instead of widening.

**Scope fence.** The fetch-parity fix (the named gate step fetching `origin/main`) is PR #1013's scope (`REVIEW-GATE-fetch-parity`, D-292), and the LAND exact-tip defect is the separate `PICKER-land-exact-head` packet. Neither is in scope here, and the build changes neither the green packet LAND at `:797-801` nor `scripts/review-gate.mjs`.

## 7. Red-first tests (`scripts/nextTaskArchitectReview.test.ts`)

Drive `pickNext` through the same fixtures `scripts/nextTaskArchitectLanding.test.ts` and `scripts/nextTaskGateRedReview.test.ts` use: a Tier 1 row with `status: "architect"`, its lock carrying a work commit and `Claim <id>: Writer · 1111`, an open pull request from the lock, and `prCi` for the lock with `{ state: "red", gateOnly: true, sha: <lock tip> }`. Each case must fail against `main` `8e1be413` where marked:

- (a) A session of another model (`Reviewer · 2222`) is handed `kind: "review"` with `work` = the lock, `lock` = `agent/review/<slug>`, `packet: true`. *Red today:* it gets `architect`.
- (b) A session of the writer's model (`Writer · 3333`), and a session of a model that took the packet over, are never handed that review. With no other eligible row they get no review of it.
- (c) A model that fixed it (a `Fixed` marker on the review lock) is never handed the review.
- (d) Fail closed: the same row with `gateOnly: false`, `gateOnly` missing, `sha` of an older commit, `state: "running"`, `"error"` or `"unknown"` gets exactly what it gets today (ARCHITECT, skip or the existing reason), never REVIEW.
- (e) A Tier 2 packet with a gate-only red is untouched (no REVIEW).
- (f) Review stage `in-review` held by a live reviewer is a skip; with a quiet review lock, it is handed to another eligible model.
- (g) Review `passed` with a stale gate-only red tip run is a skip naming the re-run, not `green`, `fix` or `architect`. *Red today:* `architect`.
- (h) Green CI after the pass still hands the existing packet LAND, never to a writer (unchanged; asserts the D-190 skip still fires).
- (i) Unmet `dependsOn` or an out-of-sync `syncedTo` wins over the review (skip and `resync` respectively).
- (j) Spawn harness (the mocked-fetch harness `scripts/nextTaskGateRedReview.test.ts:166` uses): `next-task.mjs --verdict pass` by the review-lock holder on a packet row whose task branch is not on origin records `reviewed <lock tip>`. *Red today:* fails with "is not on origin; there is no head to review".
- (k) Spawn harness: a red tip run on the lock whose jobs show only the gate step failed prints `REVIEW <id>` for an eligible session, and the board line shows the review state.

- (l) Lifecycle: a packet row whose review lock's newest marker is this session's `Review claim` gets `ownStage` CONTINUE REVIEW, is listed by `heldAllBy` and gets a lock `Heartbeat` from `leaseFor`; the same row with a newest `Fix claim`, `Verdict pass` or `Land claim` marker gets no continuation from `ownStage`. *Red today (`main` `d6685c97`):* no continuation exists for any packet review claim.

## 8. Definition of done

- §7 red-first: the test commit without the change fails (a), (g), (j), (k) and (l). With the change, all pass.
- `pnpm check`, `LANG=en_US.UTF-8 pnpm vitest run scripts/`, `validateAssignments` → `[]`, `node scripts/decision-id-check.mjs` exit 0.
- **Live proof, after REVIEW-GATE-fetch-parity has landed:** re-run CI on #878 (or the newest Tier 1 packet pull request red only for its review). Paste run and job ids showing that the only failed step is "Review gate (independent Tier 1 pass)", with Scope check `skipped`. Then show `node scripts/next-task.mjs` (preview, or `--status` for the board line) printing `REVIEW D-089-request-inbox` for a session whose model is not among #878's writers, where it printed ARCHITECT or a "writing its packet" skip before. The proof claims and records nothing: no `--claim`, no review marker and no verdict are pushed for the proof.
- Not done: no Tier 1 packet lands from this row. Each still needs its own independent pass on its exact head and its own green-CI landing under D-190.

## 9. Review checklist (Tier 2: no separate review is required, but a reader checks)

1. `git diff --stat origin/main...` touches only §6's files, `assignments.json` and this packet's Status.
2. R1 sits after `done`, the dependency check and re-sync, and before the ARCHITECT fallback. It cannot fire unless `tier === 1`, `gateOnlyRed` and a review-pending stage all hold.
3. R2 uses `did(v, ["builders", "fixers"])` (model level), and the green packet LAND is byte-identical.
4. No marker is pushed by anything except the existing claim and `--verdict` code paths. No `GATE_STEP`, `REVIEW_GATE_FAIL` or classifier change.
5. Existing test files are byte-identical to `main`.

## 10. Stop and ask

- If the route needs any change to `scripts/review-gate.mjs`, `.github/workflows/ci.yml`, a required check, branch protection or the green packet LAND, stop and `--report blocked` with the measured reason.
- If the live proof shows #878 red at more than the gate step, do not widen the classifier. Prove on another Tier 1 packet pull request or report.

## Status

- `PICKER-architect-review-route`: in progress - Instinct · 09c7 - 2026-11-08 - branch agent/queue/picker-architect-review-route; ordinary picker claim db56b45a. Packet drafted by Hark · b06c, registered D-294.
- Coordination: accidental D-100.otp-hmac review claim 0a6b1b7a/heartbeat96963710 is untouched, holds remain in force, no review/verdict or renewal; factual correction on PR #884. No release/unclaim command exists; normal quiet expiry applies. Exact comma-list avoid is corrected. Supported avoided-continuation routing selected this build; no review outcome or handoff claimed.

- 2026-11-08 04:27 IST: bounded lifecycle omission found, not silently implemented. `ownStage` recognizes review ownership only for `v.open`, while packet rows have `v.open=false`. New red lifecycle regression reproduces `kind:none` instead of CONTINUE REVIEW and absent normal heartbeat ownership. Packet R1-R6 does not admit that change; coordinator clarification and independent inspection pending. Existing implementation is not ready to land.
- `PICKER-architect-review-route`: packet drafted by Hark · b06c on `agent/architect/picker-architect-review-route` (registered by D-294, 2026-11-07). Direction: Instinct coordinator, 2026-11-07 (coordinator routing confirmed; no owner instruction on this packet).

- Amendment R7 (Review-claim-only lifecycle continuation for packet rows) registered by D-299, 2026-11-08: successor-architect ruling under D-200/D-202 - the original architect session (Hark · b06c) ended 2026-11-07 12:57 IST and no task waits for one session. Defect measured on `main` `d6685c97` and reproduced by the independent reviewer (PR #1038 comment 6714302658; 11/11 focused, `nextTask` 299/299).

- `PICKER-architect-review-route`: done — 0c751a50 — 2026-11-08 — landed by merge commit 0c751a50 through PR #1038 (branch `agent/queue/picker-architect-review-route`, tip 7c11a237). Independent final-head PASS by Hark · 5de4 at 5a4f9454 (PR comment 6714726685) and delta PASS at 7115b258 (PR comment 6714851284); the only commits after the reviewed head are the status commit and an empty takeover marker. Exact-head CI run 42438969823 on 7c11a237: typecheck, unit + component + route tests, production build and e2e journeys all success, no skips; main CI run 42439343411 success on 0c751a50. No deploy ran: the change touches only `scripts/` and `docs/`, outside both deploy path filters (D-003). R1-R7 as §5; `scripts/review-gate.mjs`, `scripts/scope-check.mjs`, `scripts/queue-gate.mjs`, `.github/workflows/ci.yml`, the green packet LAND and every existing test file are unchanged. Live routing proof recorded on the PR before landing: run 42422261119 on #878 fails only the named review gate with Scope check skipped, and a read-only picker preview printed `REVIEW D-089-request-inbox`; nothing was claimed, reviewed or landed for that proof.

- 2026-11-08 05:21 IST: D-299/R7 is effective on main6327ceae; merged normal scope re-sync, preserving historical red finding and amendment provenance. Narrow review-only implementation and final independent review pending.
- 2026-11-08 05:22 IST: R7 red-first f8f9918c: focused12 tests11pass1fail (existing lifecycle regression); added real `leaseFor` lock Heartbeat assertion and negative Fix/Verdict-pass/Land cases. Narrow Review-claim-only ownStage implementation: all11 picker suites300/300 pass; full scripts and exact-head CI/final independent review pending. No generic packet fix/land widening.

- 2026-11-08 05:41 IST: landing-preparation status commit only, not a landed claim. Implementation5a4f9454504dbe796e8922eb12b4322193914f4f independent final-head PASS at PR1038 comment6714726685; exact CI42427172305 all4 jobs SUCCESS including Typecheck/Vitest. All11 local picker suites300/300; local fullscripts120s timeout remains incomplete. Current-main picker exit4 WAIT: landing slot36fd7836 belongs Qoder b69f / D-048-p3-admin-approvals, no competing slot/merge. Row done is prepared on this PR only; final status-delta review/CI and ordinary slot/protected merge still pending. Accidental D089 reviewclaim41f6 from candidate-router execution left untouched, corrected publicly6714851284, no formal verdict/renewal.

## D-307 bounded supersession, 2026-11-09

Historical R3 and acceptance (g) above remain as the record of the original implementation. D-307's measured scope correction supersedes only their rerun-only requirement for an architect Tier1 packet with passed review, completed exact-tip CI classified as review-gate-only red and a quiet review lock. That state returns to normal qualified REVIEW after the correction and runtime implementation normally land. An active passed lock is not reissued. All other R3 exclusions, independence, dependencies, re-sync, exact-head verdicts, required CI and D-190 landing limits stand. Only the existing test case (g)'s title and two expectations may change to pin normal REVIEW plus no ARCHITECT/MAKE GREEN/FIX; every other case is unchanged. No gate, loader, workflow or automatic PASS/blocked-report clearance is introduced. This paragraph is a docs correction, not proof that the runtime cure has been written or passed tests.
