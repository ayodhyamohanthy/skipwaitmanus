# Decision review ledger (D-206)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Every CEO session starts by re-rating our decisions against the goal and appends one dated section here (D-206). The goal (D-010, D-026): skipwait.me is the go-to global site for job referrals and gets people referred faster. Seekers and referrers both win, the business earns, and nobody's money is at risk.

## How a session uses this file
1. Start from the newest section below. Re-rate:
   - every register entry newer than that section;
   - every decision the top five open tasks in `docs/plans/assignments.json` rest on;
   - the next 20 active entries that have gone longest without a review (the "Cursor" line of the newest section).
2. Rate each one 1 to 10 against the goal, with the evidence. Give each a status: active, superseded or historical.
3. For anything below 10, choose one of three outcomes:
   - **CEO remit (D-203):** fine-tune it now, as a new register entry with `Affects tasks:`, and re-sync those tasks (D-202).
   - **Owner-reserved (D-123):** put it to the owner, rated, with the strongest counter-argument (D-023).
   - **Missing evidence:** name the cheapest test that would settle it, and queue it.
4. Append a section: the date, the session, the ids reviewed with ratings, the actions taken (with D-numbers), the owner questions, and the new Cursor.

## Sessions

### 2026-10-26, Claude Code (decision audit, D-221)
- **Scope:** all 193 register rows checked for propagation (which newer entry changed each one), 145 suspected unnamed conflicts and 58 changes to owner-reserved rules by non-owner rulings; evidence in [`DECISION-AUDIT-oct26.md`](DECISION-AUDIT-oct26.md). Status set for 86 older rows (section 3 there). This session did **not** rate every entry 1 to 10; it rated only the ones it touched.
- **Ratings (against the goal: the go-to global site for job referrals, getting people referred faster):**
  - **D-219, 8/10.** One clear priced model replaces three half-shipped ones. The free 3 at any level with a verified card keeps the door open while cutting spam. Against: the job-level to band mapping, the paid-priority routing and the USD renewal rail are open, so nothing sells until they close.
  - **D-220, 8/10.** A day-long poster window moves requests faster than 48 h without losing the poster's edge. Against: no data yet on poster response times.
  - **D-147, 6/10 as written.** "Any decline keeps it spent" is clear, but runtime treats a pass without a claim differently from a pass after one, and D-066 (2) still releases on a step back. Its scope is the open question in the audit's section 8 (a).
  - **D-066 (2), 5/10 until that question is settled.**
  - **D-174, 7/10.** "Never expires" is user-kind, but removal waits on the reconfirm switch (D-193), so the old clocks still run.
  - **D-176, 8/10.** Matches how seekers search. Seven strings still contradict it; DECISION-COPY-oct26 owns them.
  - **D-196, 7/10.** Paid referrer priority could serve both sides. It now has prices (D-219 (7)) but no reviewed routing.
- **Actions:**
  - Recorded D-219 (the Oct 25 pricing freeze; the Oct 26 session restatement is context, not an anchor) and D-220 (24 h poster first match), and D-221 for this audit.
  - Set 86 status notes and synced PRICING, AGENTS, BRIEF, PRD and plans/README.
  - Moved D-132-item3, D-132-v2-checkout and SKIPPY-3 to architect, made D-132-item3's re-scope deliver the accepted-price check SKIPPY-fix needs first, and made D-048-p3-skippy wait for SKIPPY-fix.
  - Added rows DECISION-COPY-oct26 and DECISION-SYNC-oct26.
- **Owner questions:** the six in section 8 of the audit. Evidence for (a) the D-147 scope, (b) the invite-reward scope and (c) the first-look timing is pending from Instinct on PR #666.
- **Cursor:** next session rates D-001 to D-020 (oldest first; none of them was rated here), then every entry newer than D-221.

### Oct 27 (Claude Code, finishing the Oct 26 sync; no new audit)
- **Corrected before landing:** D-219 now carries the frozen proposal's conditions as Instinct recovered them on PR #666 (comment 6423014846): "Founding-member launch price" framing only; referrer plans with no guaranteed requests, a shared priority stage for overlapping bands, and no charge until meaningful matching activity exists *and* a reviewed, tested routing design; the pre-launch checklist (level classification, paid-priority routing and window, taxes, gateway fees). Every included, free or bought count is a number of referral requests, never a promise of an accepted or submitted referral (D-179, D-180).
- **Not settled, routed to Instinct:** the regular price after a founding cap fills. PR #666's description says about +50%, but its code removed that multiplier as unapproved. Nothing is priced after a cap until the owner's word.
- **Superseded instructions marked:** the D-132 packet banner and the KIT_V4 §3b D-132 row; BRIEF and AGENTS now give the referral-only wording rule and the recorded-but-unsold referrer and company plans.
- **Unchanged:** every done row, the D-147 refund questions (behaviour unchanged), and every flag, price and sale state.
- **Oct 27 provenance correction (Instinct's review on #720):** the two verbatim Oct 26 session quotes (D-219's re-confirmation and D-221's request) were removed. Session messages have no iMessage original, so they are paraphrased as context and are not anchors; D-219 rests on the Oct 25 anchors. The D-147 founder-rejection attribution is now labelled "attribution unverified - no recovered owner original; register state and refund behavior unchanged" in DECISIONS.md (the D-035, D-147, D-163 (3) and Superseded lines, plus a provenance note under the attestation section), KIT_V4_BUILD_PLAN.md, two queue-row notes and the audit file. Nothing is deleted, D-147 stays active, refund behaviour is unchanged, and the decline-credit scope question stays open.
- **Oct 27 renumber (D-162):** #723 reached `main` first with D-216 (the LAUNCH-live-qa block), so this sync's entries move from D-216/D-217/D-218 to D-219/D-220/D-221, with every reference in this PR renumbered. No content change.
- **Oct 27 queue order after D-217:** `main`'s D-217 unparked `D-048-F-credits` (#568) to unblock `D-048-p3-referrer-home`, so this sync no longer makes that row wait for the pricing row; `PRICING-banded-oct25` waits for `D-048-F-credits` as #718 registered it, and `LAUNCH-legal-copy` (owner-held) still waits for the pricing row.

### 2026-11-11, Claude session (D-323 story pivot; a partial review, not the full D-206 pass)
- **Scope, stated plainly:** only the decisions the story pivot rests on were re-rated. The full D-206 pass (every entry since the last section, the top five open tasks' decisions and the next 20 unreviewed entries) was **not** done in this session; roughly a hundred entries (D-222 to D-320) still have no review here. The Cursor below is unchanged for that reason.
- **Ratings (against the goal: the go-to global site for job referrals, getting people referred faster):**
  - **D-323, 8/10.** Costs nothing and makes the public story match rules the product already enforces. Against: wording does not change the underlying risk that many referral policies discourage referring strangers, paid or not (`docs/POSITIONING.md` section 7).
  - **D-055, 10/10.** Unpaid referrers are the base of the whole answer to an employer. Active.
  - **D-006 / D-040, 9/10.** Never selling a referral, a rank or a yes is now said in public. Below 10 only because D-196 narrows it.
  - **D-153, 9/10.** Plain intent first. It is why "trust and matching" stays a frame and not a headline.
  - **D-173 / D-180 (the "referral" unit in money lines), 5/10 against the new story.** "3 free referrals" and "extra referrals" at a price read as referrals for sale. Owner-reserved; recommendation: count "referral requests" in every money line.
  - **D-196 with D-219 (7) (paid referrer priority), 3/10 against the new story.** An employee paying for first access to candidates is the hardest item to defend to an employer. Unbuilt and unsold. Owner-reserved; recommendation: keep it out of every public page and reopen it before any build. Missing evidence: whether any verified referrer would buy it. Cheapest test: ask them, at no cost.
  - **D-219 level-based prices, 6/10 against the new story.** A price that tracks seniority reads as pricing the referral, not the service. No change proposed; have the answer ready.
  - **D-147 (a decline keeps the charge), 8/10 for the story.** It is the fact that makes "you pay for the request, not for a yes" true. Refund-on-decline would turn the model into pay-per-acceptance.
- **Actions:** D-323 recorded; `docs/POSITIONING.md` written; rows `STORY-trust-landing` and `STORY-employer-rules-answer` registered last in the list with packet `docs/plans/STORY-trust-matching.md`. Nothing owner-reserved was changed.
- **Owner questions (rated in `docs/POSITIONING.md` section 6):** 6.1 referral requests in money lines; 6.2 the paid referrer plan; 6.3 level-based prices; 6.4 D-147 as part of the positioning.
- **Finding:** `docs/BRIEF.md` is at 10,238 of its 10,240-byte cap, so D-323 could not be added there without cutting another session's text; the pointer is in `AGENTS.md` (product compass, item 4). The brief needs a trim row before the next decision that belongs in it.
- **Cursor:** unchanged from the previous section.

### 2026-11-13, Claude session (blocker pass; a partial review, not the full D-206 pass)
- **Scope, stated plainly:** only the entries newer than the last section that this session read in full, and the decisions the two rows it worked rest on. The full D-206 pass was **not** done; D-222 to D-320 still have no review here, and the Cursor is unchanged.
- **Ratings (against the goal: the go-to global site for job referrals, getting people referred faster):**
  - **D-321 (coordinator checklist), 8/10.** Each rule answers a measured stall. Against: it is a checklist, so it only works if someone runs it; the board on main `5cad31e1` still shows 14 red rows, most of them Tier 1 pull requests waiting for a reviewer, which is rule 6's job.
  - **D-322, D-325, D-326, D-328, D-329, D-330 (owns and dependency rulings), 6/10 as a pattern.** Each one is correct and bounded. Six in two days, plus D-331 today, says the cause is upstream: the scope check reads `owns` from `main`, and packets are written before the builder knows which shared file (the goal-boundary allowlist, the money copy, an e2e pin) the work must touch. Each miss costs a review round and a day. Missing evidence: how many of the open goal-surface rows will hit the same wall. Cheapest test: run `scripts/scope-check.mjs` on every open task branch once and count.
  - **D-324 and D-315 (`build` never dead-ends), 7/10.** Verified in this session: the picker handed work on every call. Against: it also handed a Claude session a fix stage, and `--claim` recorded the fix claim before the session could decline, so the role split of D-225 depends on the session previewing with `--as` first.
  - **D-151 (independent Tier 1 review), 10/10.** The re-review of PR #1161 found two user-visible defects that four builders, one reviewer and green CI had passed: a link to a switched-off page on every company door, and the goal line cut off on a phone. Active.
  - **D-150 (a real redesign, never the old layout in black), 9/10.** The same review found the retired kit not-found page inside the goal frame. Below 10 only because "matches its approved comp" is still checked by eye.
  - **D-176 (no availability framing before sending), 9/10.** The door on PR #1161 drops the pill but still states availability in its reason line; `D-174-seeker-journey-build.door-neutral` owns the rest. No change proposed.
  - **D-225 (Claude reasons, other tools build), 8/10.** It held here for the review. The gap is the fix hand-out above.
- **Actions:** D-331 recorded (one `owns` entry on `D-048-p3-conversation`, Affects tasks named). Findings verdict recorded on `D-048-p3-live-review-find` (PR #1161, head `07bfca89`). Nothing owner-reserved was changed.
- **Recommendation for whoever holds the picker (rated 7/10, not built here):** let `--claim` refuse a fix or build hand-out for a session whose name starts with "Claude" unless it passes an explicit flag, the same way D-324 passes over an external-route task. Counter-argument: D-200 says no step waits for one model, and a role filter in the picker is one more rule to keep in sync with D-225.
- **Owner questions:** none new.

### 2026-11-11, Claude session (D-332 old-design removal; a partial review, not the full D-206 pass)
- **Scope, stated plainly:** only the decisions the removal rests on were re-rated. The full D-206 pass was **not** done in this session; it is still owed, and the Cursor below is unchanged for the second section running.
- **Re-rated against the goal:**
  - **D-120 / D-150 (one goal design, landing to admin), 9/10.** One design is what makes the product read as one product. Below 10 because 25 of 46 surfaces still serve the old one three weeks after the ruling.
  - **D-317 (per-surface release rows), 6/10 as executed.** The diagnosis was right; the rows were appended at positions 263 to 282, behind 57 older rows, so in a day nothing was released. Fine-tuned by D-332 (2).
  - **D-167 (coverage; "moved" is a test), 8/10.** It defines moved but nothing defined removed; D-332 (3) adds the missing stage.
  - **Split rule 5 (7-day soak before deleting), 7/10.** It protects the rollback. Against: it is a week added to an instruction that said "forcibly". Owner question (a).
  - **FIFO (Oct 31), 8/10.** Read with its own words ("including unfinished acceptance") it supports moving the release rows; it does not support moving the retirement rows, which stay last.
  - **D-225 (Claude reasons, other tools build), 8/10 here.** This session changed no page. Against: the fourteen built pages are a one-line change each and still wait for a builder and a reviewer.
  - **D-231 (shell parts parked as the owner's), 5/10.** Four old-design parts on every page have waited since Oct 28 on one yes or no. Owner question (b).
- **Actions:** D-332 recorded; twenty release rows moved beside their build rows; 38 per-surface retirement rows, `D-048-K-inplace`, `D-048-K-kit` and `GATE-goal-design-ratchet` registered with packet `docs/plans/D-048-retire.md`. Nothing owner-reserved was changed and no page was edited.
- **Owner questions (in `docs/DECISIONS.md`, "Open owner questions"):** (a) soak length; (b) whether the instruction answers the `D-048-F-shell-parts` hold; (c) order of retirement.
- **Findings:** `docs/BRIEF.md` is still at 10,238 of its 10,240-byte cap, so D-332 is pointed to from `AGENTS.md` (styling section) and not from the brief. `D-048-p3-for-companies` reads `todo` in the list while its surface is in `RELEASED` and its last report says landed; the row's status needs its holder's correction.
- **Cursor:** unchanged from the Oct 26 section.

### 2026-11-13 (later), Claude session (owner-asked blocker and goal-design pass; a partial review, not the full D-206 pass)
- **Scope, stated plainly:** only the decisions on the path from "goal page built" to "old page deleted", plus the owner holds on that path. The full D-206 pass was **not** done; the Cursor is unchanged.
- **Measured on main `a4a0ddd0` before any action:** 22 of 46 surface ids in `RELEASED`. Five pull requests had passed independent Tier 1 review with green required CI and had waited 14 to 49 hours for a lander. Ten built goal pages had no release pull request. The release rows were still at positions 263-282. The retirement rows were still unregistered (#1164 had been stuck since Nov 11 with conflicts and a colliding decision id). Sixteen rows sat at `owner`.
- **Ratings (against the goal: the go-to global site for job referrals, getting people referred faster):**
  - **D-321 rule 6 (land what has passed), 9/10.** Right rule, but it was not run: five passed pull requests sat idle while no development session was active. Below 10 because it names no fallback lander when the coordinator is away.
  - **D-225 (Claude reasons, other tools build), 6/10 as measured today.** For reviews it holds. But when only Claude sessions are running, passed work never ships. Fine-tuned for this session only, by the owner's own answer (D-333 (1)). **Owner question, rated 8/10:** should a coordinating Claude session land work that already has an independent pass and green required CI, never building or fixing? Against: one model lineage would then both review and land. That is allowed (D-151 excludes builders and fixers only) but it concentrates trust.
  - **D-317 / D-332 (per-surface release rows beside their build rows), 8/10.** It fixes the cause measured twice: the rows sat behind 57 older rows.
  - **D-230 and D-231 (holds recorded as the owner's), 3/10.** No owner source was ever found, and the coordinator said so on #767 itself. Each blocked an every-page design change for 16 days, and one question cleared it. D-316 (2) ("asked, not assumed") was the right call at 9/10; it just went unasked for three days.
  - **D-209 (4) defaults (no referrer passkey, no Apple), 8/10.** Answered as the defaults. They keep D-057's work-email proof intact.
  - **D-266 (pricing PR parked for review routing), 6/10.** The parking reason (a review deadlock) was cured by D-286 on Nov 3, but D-316 kept the row back for the owner's D-123 word. That word is now given (D-333 (4)).
- **Actions:** D-332 recorded (PR #1164's plan, renumbered and replayed on current main by a script, not hand-merged). D-333 recorded: the owner's four answers, the D-057 §0b.8c restoration, and the `D-048-p3-inbox` note typo. Landings and their stamps are in D-333 (1) and the rows.
- **Owner questions:** the D-225 landing question above. D-332 (a) soak length and (c) order of retirement are still open.
- **Findings for the queue:** `D-048-R-support` and `D-048-R-assistants` are claimed by Qoder sessions that have been quiet for 12 hours on red branches, so both are free for takeover under the 2-hour rule. `D-048-p3-for-companies` still reads `todo` although its id is in `RELEASED` (reported Nov 11, uncorrected). `node scripts/next-task.mjs --status` got a 502 from the GitHub API for one CI lookup and still printed the board.
- **Cursor:** unchanged from the Oct 26 section.

### 2026-11-14, Claude Code · 0cb9 (owner asked "fix all blockers"; a partial review, not the full D-206 pass)
- **Scope, stated plainly:** only the decisions this session's blocker pass ran into. The full D-206 pass was **not** done; the Cursor is unchanged.
- **Measured on main `80aeba16` (CI green):** every Tier 1 review the picker offered a Claude session was one Claude may not take. #666 (`PRICING-banded-oct25`) was fixed by Claude (`dbb0aa12`; its note excludes Claude). #1191 (`D-048-R-assistants`): Claude edited the page it releases (`a618099f`, `GoalApprove.tsx`). #324 (`seeker-passwords`) was built on `agent/claude/*`. #831 (`D-048-p3-conversation`) has a `Fixed` marker by Claude Code · a971 (Nov 12). The other hand-outs were MAKE GREEN, BUILD or TAKE OVER, which are development work for other tools under D-225.
- **Ratings (against the goal: the go-to global site for job referrals, getting people referred faster):**
  - **D-299 R7 (packets get no fix or land stage), 4/10.** It left a packet with a findings verdict no exit. #878 took four takeovers after a finding that was already cured. Fine-tuned by D-334.
  - **D-225 (Claude reasons, other tools build), 6/10 as measured.** The rule is right, but the earlier Claude fixes it now forbids (Nov 12 on #831, and on #666 and #644) exclude Claude from reviewing those rows under D-151. So the Claude seats can't clear the review backlog either. No new entry: D-225 already says Claude does not fix. Holding to it keeps Claude sessions eligible to review.
  - **D-321 rule 11 (a dead end is a picker defect, fixed the same day), 9/10.** Applied here. Below 10 only because the same-day fix still needs a non-Claude builder.
  - **D-151 (independence by model), 9/10.** It held on every hand-out checked; the picker printed the exclusion each time.
- **Actions:** `D-089-request-inbox` (#878) taken over: F1 re-verified, `origin/main` merged, rows re-stamped `syncedTo: "D-333"`, D-332's retirement-row interaction measured and recorded in the packet (head `589b4afd`). D-334 recorded, with row `PICKER-packet-findings-exit` and its packet. No code, price, legal text or owner-held row changed.
- **Owner questions:** none new.
- **Findings for the queue:** `D-048-p3-for-companies` is still handed out as BUILD while its id is in `RELEASED` (reported Nov 11 and Nov 13). `D-086.mount` (#1169) is handed LAND, but it conflicts in `Explore.tsx` with #1161's redesign, so it needs a builder to merge main before a lander can land it.
- **Cursor:** unchanged from the Oct 26 section.

### 2026-11-21, Claude Code (session ccr-d3ee9f32-69o0tx; owner asked "Make sure local build is pushing to repo without manually pushing to GitHub"; a partial review, not the full D-206 pass)
- **Scope, stated plainly:** only the decisions this change rests on. The full D-206 pass was **not** done; the Cursor is unchanged.
- **Measured on main `7076b65b`:** `scripts/sync-clone.mjs` (SYNC-clone-guard, #1445) pushes committed branch work only when someone runs it. Its timer is opt-in and has to be typed once per Mac. A commit on local `main` is only reported, so it stays on the machine.
- **Ratings (against the goal: the go-to global site for job referrals, getting people referred faster):**
  - **D-373 (5) as built (opt-in timer), 6/10.** The sync rules are right, but "nothing is installed without the flag" left the owner's own clone depending on a command nobody is reminded to type. Fine-tuned by D-375: a post-commit hook, and the picker installs the hook and timer by itself.
  - **D-205 (every clone in sync with GitHub), 9/10.** Still right. Below 10 because landing still needs a pull request: a pushed branch without one is visible but never lands, and that stays a deliberate gate (D-166).
  - **D-082 / D-166 (nothing reaches `main` except a queue row's pull request on green CI), 9/10.** Kept unchanged. D-375 saves local `main`'s own commits on a `sync/main-<sha>` branch rather than weakening this. Below 10 because those saved commits still need a session to bring them in.
  - **D-371 (auto-land), 8/10.** Works where GraphQL is reachable. From cloud sessions it needs `PICKER-auto-land-cloud`, which is still unbuilt; that row is the next gap between "pushed" and "on main".
  - **D-375 (new), 9/10.** Below 10 until a real Mac run shows the hook and timer installed by `--claim`; this session could test only on Linux.
- **Actions:** D-375 recorded, with row `SYNC-auto-push` and its packet section in `docs/plans/BRANCH-HYGIENE.md`. No price, legal text, login rule, money path or owner-held row changed.
- **Owner questions:** none new.
- **Cursor:** unchanged from the Oct 26 section.

### 2026-11-28, GPT-6.1 Sol · 747d (D-206 review; read-only and provisional)
- **Scope / basis:** main `5b1c0f5a9104fc6a524762ff70312e3fb0916f07`; exact-main [CI 46117090916](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46117090916) is green; official board snapshot: 488 tasks, 442 done. Reviewed all 39 extant entries D-376–D-416 (D-397/D-404 absent), the next 20 oldest active entries (D-003–D-031 below), and the current top-five rows: `PICKER-common-dir-lock` (current holder 8167), `PICKER-claim-cost`, `P0-goal-shell-sign-out` (PR #1701, merge `524b94435`), `P0-support-account-menu` (PR #1719, merge `8444f3f0`), `PICKER-speed-fixes` (PR #1702, merge `fb9f767e4`). Source PRs alone do not close the latter rows' assigned acceptance.
- **D-376–D-416 ratings** (statuses are active, superseded or historical; below-10 gaps refer to existing packet acceptance/tests, not new authority):

| Decision | Rating / status | Evidence gap or bounded action |
|---|---|---|
| D-376 | 9, active | Scoped picker regression: red release blocks auto-land except its registered fix. |
| D-377 | 9, historical (resolved by D-388) | Secrets were handled later; no new secret request. Use existing runner evidence for remaining QA. |
| D-378 | 9, active | Picker test for unblocker's own lock/report clearing its evidence-backed block without repeat handout. |
| D-379 | 9, active | Existing status-help coverage must retain the 90-day close until D-174 removal is released. |
| D-380 | 9, historical | PRs #1193/#1314 and live record reconcile support; preserve status-reconciliation coverage. |
| D-381 | 9, active | PR #1468 / real-MySQL intent test is evidence; grant replay/idempotency remains the money-path bar. |
| D-382 | 8, active | Existing step-up tests must cover stale/renewed cookie and Bearer sessions with no card mutation. |
| D-383 | 8, active | D-392 addresses the TEST bot-check; retain provider artifact and exact-SHA release proof; sales stay off. |
| D-384 | 9, active | Existing pool-email tests must pin grant, blocked-pair, one/day cap and retry idempotency. |
| D-385 | 9, active | Paired expiry/reconfirm and copy tests; exact release proof before either switch changes. |
| D-386 | 9, retired | D-370 removed the stale-review gate; do not revive unless that governing rule changes. |
| D-387 | 9, active | Exact-release signed-in QA must fail visibly on skips/errors and keep credentials/PII out of artifacts. |
| D-388 | 8, active | Verify the existing deploy/worktree fixes on their exact targets; no status or upload alone is release proof. |
| D-389 | 8, active | Existing demo journeys still owe wallet, isolation, transitions and job-link evidence; no real payment. |
| D-390 | 9, active | Keep launch acceptance waiting for the recorded journey run; picker dependency test guards landing. |
| D-391 | 8, active | D-174 MySQL journey must cover reconfirm, expiry and copy before the coupled release. |
| D-392 | 8, active | Owner TEST payment only; retain provider/refund/cancel/replay evidence, never real-money QA. |
| D-393 | 8, active | Sandbox/auth tests must prove cross-user isolation and exclusion from real people/counts. |
| D-394 | 9, active | Search release needs cited real job sources and domain mapping; no invented coverage. |
| D-395 | 9, active (block cleared) | PR #1522's own-request tests satisfy the ruling; preserve owner scope and no SKIPPY-6 dependency. |
| D-396 | 9, active | PR #1433 supplies the repair; current parent holder owns any registry reconciliation. |
| D-398 | 8, active | Existing BYOR/name tests must prove recipient identity, replay safety and no handle recycling. |
| D-399 | 8, active | Picker tests must build ahead on owner/blocked rows while refusing landing before gates. |
| D-400 | 10, active / founder-locked | Pinned founder identity and suspension-refusal tests; no gap identified in this snapshot. |
| D-401 | 8, active | Session-reuse tests must keep the exact holder while preventing takeover of an active session. |
| D-402 | 8, active | Existing loop tests must cover stop/backoff and avoid an unbounded failure/restart cycle. |
| D-403 | 7, active | Protocol-safe compaction tests: keep tool-call/result pairs, stream unchanged, retry once, never log auth. |
| D-405 | 9, active | D-178 tests must reject revoked/expired grants and enforce locked caps plus replay safety. |
| D-406 | 10, active / founder-locked | Pinned same-account email link/code behavior and one-time spend; no gap identified here. |
| D-407 | 9, active | Scoped picker tests distinguish owner/external holds from work that remains build-ahead. |
| D-408 | 8, active | Release only with owner present for real phone/laptop checks and 1280/390 evidence. |
| D-409 | 8, active | Existing QA/issue tests need exact web/API SHAs, deduped recovery and no secrets/PII. |
| D-410 | 8, active | D-178 journey must use only demo identities in D-393 sandbox, record exact SHAs and clean up. |
| D-411 | 9, active | Approved wording stays unchanged; existing MySQL journey proves the 31-day reconfirm path. |
| D-412 | 8, active | Existing speed-fix tests and linked P0 live runs, not read receipts/status churn, establish closure. |
| D-413 | 8, active | Owner-reported settings are not machine-verified; confirm read-only when access exists; preserve approved text. |
| D-414 | 8, active | Existing mobile acceptance must show the one-screen role choice at 390 without changing auth methods. |
| D-415 | 8, active | Verify company-domain guard cases and bounded picker/supervision tests; passkey release still needs owner present. |
| D-416 | 9, active owner hold | Owner provisions the repository secret; then the existing runner, signed-in 1280/390 captures and 24-hour Sentry proof remain. |

- **Next 20 oldest active entries (D-003–D-031):**

| Decision | Rating / status | Evidence gap or bounded action |
|---|---|---|
| D-003 | 9, active as amended | Exact candidate CI and protected PR/merge path remain the evidence, not a direct push. |
| D-004 | 9, active / frozen | Keep Chargebee/provider boundaries; existing recovery and replay matrix guards any change. |
| D-006 | 9, active / frozen | Fairness remains; existing tests must keep D-040/D-196 exceptions narrowly bounded. |
| D-007 | 10, active / frozen | No GST until owner fact changes; source tax labels from the live configuration. |
| D-008 | 8, sequencing superseded by D-068 | Docs still move in the same change; verify affected-doc sync, not a pre-code main commit. |
| D-010 | 10, active / frozen | North-star remains; use observed seeker/referrer outcomes rather than a proxy claim. |
| D-011 | 9, partly active | Company binding remains; auth-method wording is superseded; test company match before spend. |
| D-015 | 6, historical / paused | Sprint evidence is stale; no outreach without current evidence and per-item owner approval. |
| D-016 | 6, historical / attest first | Reconfirm the owner attestation before any public claim; do not imply employer approval. |
| D-017 | 9, active | Existing personal-link tests must preserve referrer and job across sign-in and replay. |
| D-018 | 9, active | Use current count-only production measures with source/date; no personal data or invented baseline. |
| D-019 | 10, active | Basics remain non-negotiable; focused suites and exact-release live proof are the evidence. |
| D-021 | 9, active as amended | Decline/reopen and ledger replay tests must preserve D-147 spend and D-066 reopen. |
| D-022 | 9, active as amended by D-220 | Test the 24-hour poster first look; response-time evidence is still the limit. |
| D-023 | 8, active | Numerical certainty needs source data; label uncertainty instead of promoting an unsupported score. |
| D-024 | 8, partly active | Pin stable handles/no recycling; no paid-handle benefit is authorized by this entry. |
| D-026 | 10, active | Vision and session sync remain; use current decisions and the prior repo-only outcome. |
| D-028 | 7, partly active | Discovery remains, availability framing is superseded; use sourced job data only. |
| D-030 | 10, active / founder-locked as amended | Preserve the D-406/D-408 methods; login-rule and account-binding pins remain decisive. |
| D-031 | 10, active | Free/wired options only; never use a card or credits without an approved hard stop. |

- **Top-five task bases:** D-019 is rated above; D-409/D-412/D-415 are covered above. D-085, 9/10 active: scoped lease tests must retain 2-hour idle takeover while honoring pushes/heartbeats. D-200, 9/10 active: scoped hold/scope tests must preserve isolated work and protected CI. D-202, 9/10 active: verify authoritative origin decision sync and stale-task refusal. D-225, 9/10 active: preflight must use actual current instructions and prior repo-only outcome, not a read receipt. D-309, 9/10 active: overlap is safe only with isolated writers and conflict-preserving integration. D-321, 8/10 active: supervision needs proof it clears only evidence-backed work through existing routes. D-324, 9/10 active: concurrent CLI tests must show single-flight/no dead ends without weakening holds. D-370, 9/10 active: exact green required CI remains the landing gate; no independent review. D-375, 8/10 active (re-rated from 9): a real Mac run must prove hook/timer continuity and recovery.
- **Actions / owner questions:** no decision, task, queue, setting, price, legal text, login rule, money path or outreach authority changed. All sub-10 items point to existing packet tests or acceptance. No new owner question; preserve D-416's existing secret hold and D-408's owner-present device ceremony.
- **Cursor:** D-032 onward; next 20 oldest active entries not yet rated.
