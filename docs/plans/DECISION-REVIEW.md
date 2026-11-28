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

### 2026-11-28, GPT-6.1 Sol · 2269 (D-206 session review; PICKER-claim-cost takeover)

- **Scope:** 62 unique IDs individually rated below: all 39 register entries newer than D-375, the additional top-five-open-task foundations, and the next 20 oldest active entries (D-019 counts in both foundations and that oldest slice, once). This is not a completed full-register review: the legacy D-222–D-375 review debt remains except for entries individually rated here or in earlier sections.
- **Evidence inspected, not re-run:** main `510547f2a`, integrated branch `a424801b7`, the current assignments and PICKER-claim-cost packet, [`BUGFREE_GATE`](../BUGFREE_GATE.md), [Nov 28 live QA](../qa/launch-live-qa-2026-11-28.md), [banded release QA](../qa/banded-release-qa.md), and the [local liveness coordination receipt](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-7237992628). The primary also supplied the read-only GitHub settings readback recorded at D-413 below. These provisional source-backed assessments were reviewed by the primary; they are not new test results or authorization.
- **Status key:** **A** active; **H** historical/completed ruling; **X** superseded clause only, not the whole decision. A lower rating identifies an evidence gap or existing acceptance work, not permission to change a rule, reopen a settled owner decision or create another gate.

#### Entries newer than the last review

| ID | Rating | Status | Evidence, gap and cheapest existing closure |
|---|---|---|---|
| D-376 | 9/10 | A | Aligns auto-land with live-release holds. Preserve the existing red/unknown controls; prove red, unreadable and registered-release-fix cases in the owning acceptance. Unknown is not evidence of green. |
| D-377 | 9/10 | H | D-388 and Nov 28 signed-in QA resolve the original two-secret wait. Keep that receipt; do not re-ask for seeker/referrer passwords or revive the completed hold. |
| D-378 | 8/10 | A | An unblock ruling must actually clear its block. D-412 amends the merged-marker-loss case; prove clearing after the ruling merges, not just while its lock still holds the marker. |
| D-379 | 9/10 | A; X clause | Honest waiting copy prevents a false promise. The 90-day wording is replaced by D-385/D-411 when no-expiry is enabled; verify both switch variants in the existing release work. |
| D-380 | 9/10 | H | Support release #1193 and retirement #1314 are recorded. That closes the old reconciliation, not separate account-menu parity; retain the release receipt and finish the existing menu acceptance. |
| D-381 | 9/10 | H | The durable-intent migration has real-MySQL proof and merged prerequisites. An empty table is not fulfillment acceptance; use the existing BANDED-grants fulfillment evidence separately. |
| D-382 | 6/10 | A | Fresh interactive authentication protects money-card approval. Provider-path acceptance remains unverified; close the existing SKIPPY-stepup acceptance before money cards. No security reproducer or mechanism is published here. |
| D-383 | 8/10 | A | Correctly distinguishes documentation from activation. Nov 28 `onSale:true` proves the offer state, not checkout; attach the already-required exact-release hosted-page handshake and 1280/390 evidence. |
| D-384 | 9/10 | A | Pool review email restores the pending-action notice without uncapped delivery. Prove the daily cap, blocked-pair denial and retry/recovery in the existing pool-email acceptance before release. |
| D-385 | 8/10 | A | Couples no-expiry to reconfirmation rather than silently aging requests out. The paired-flag live skipped-sweep and countdown-free evidence still needs closure in D-174-no-expiry-release. |
| D-386 | 9/10 | H; X mechanism | D-370 supersedes the old independent-review/Fixed mechanism; retiring the unused row avoids wasted work. Preserve the historical receipt and do not resurrect that review dependency. |
| D-387 | 9/10 | A | Sample removal and required e2e checks prevent misleading QA success. They do not prove full fresh-clone bootstrap or repair recovery; finish those existing acceptance cases, not another status-only pass. |
| D-388 | 8/10 | A | Session folders and dependency patches address recorded collisions and advisories. They do not prove full deploy catch-up or remaining advisory closure; use the existing catch-up run and dependency evidence. |
| D-389 | 9/10 | A | Nov 28 sandbox QA proves safe demo journeys and removal of the cookie-session WorkOS error. It is not real WorkOS refresh/provider proof; complete the existing provider-path acceptance separately. |
| D-390 | 9/10 | H | Journeys run [46085771891](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46085771891) supplies the missing transitions, privacy, keyed ledger and cleanup, bound to actual web `f9d4ff39` / API `f02de526`. Retain that scope; do not infer untested sign-in paths. |
| D-391 | 9/10 | H | The dedicated packet and reconciled prerequisite remove the old packet block. D-411 later supplies the legal wording; continue release acceptance rather than re-asking the settled legal question. |
| D-392 | 9/10 | H | TEST run [45550727769](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45550727769) records payment verification, refund success and cancellation. Older TEST price IDs do not prove current catalog parity; retain that limit without inventing a new release gate. |
| D-393 | 8/10 | A | The sandbox isolation is tested by Nov 28 journeys and keeps real employees untouched. TEST billing and auth-log retention have separate acceptance; prove each in its existing row, not from the free-request run. |
| D-394 | 8/10 | A | One search input matches seeker intent. The live universal-input matrix remains unproven; exercise company name, website, job title and job link, including honest unavailable/no-referrer results, in existing search acceptance. |
| D-395 | 9/10 | H | The own-request read route has its own implementation proof and does not need agent send. Preserve that boundary; D-178.release still owns the delegated-send release journey. |
| D-396 | 9/10 | H | The repaired premium output, not an obsolete ancestor marked merged, is the accepted implementation. Compare served recovery-only behavior with the repair's evidence; ancestry alone cannot close parity. |
| D-398 | 8/10 | A | A stable screen name keeps shared links attached to the same person. Preserve pause/company-change/CAS regressions and verify their outcomes; this is not approval to rename, release or recycle aliases. |
| D-399 | 7/10 | A | Build-ahead can save idle time but produced churn. D-407/D-412 narrow refresh work; prove actual source progress on eligible rows, not more empty claims or withheld-draft refreshes. |
| D-400 | 8/10 | A | Central founder protection prevents administrator lockout and remains founder-locked. Authorized dual-seat/handover acceptance is still distinct from unit pins; future handover policy stays owner-reserved, with no active handover evidenced. |
| D-401 | 7/10 | A | Resume identity avoids abandoned work, but shared-name churn required D-415's durable loop name. Prove real restart/resume without taking another live session's claim in existing durable-session acceptance. |
| D-402 | 8/10 | A | Supervisor/configuration code supports automatic continuation. A real capped-client restart, backoff and stop sequence is still needed; use the existing supervisor acceptance without claiming the upstream cap is removed. |
| D-403 | 6/10 | A | Tool-pair and SSE fixtures cover transport handling, not semantic continuity through lossy compaction. Prove the packet, exact identity and constraints survive a real continuation before calling it reliable. |
| D-405 | 9/10 | A | Grant-bound approval and local tests restore revocation/cap/label controls. They are not D-410's delegated release journey; finish the existing D-178.release proof and cleanup. |
| D-406 | 8/10 | A | Code/link unit controls reduce sign-in friction while preserving approved methods. Real-inbox delivery, code/link use and cross-device acceptance remain unverified; close the existing email-link release checks. |
| D-407 | 8/10 | A; X clause | Local environment failures are not task-wide blocks. Its broad draft-refresh clause is narrowed by D-412/D-415; verify eligible source work instead of refreshing owner-held or externally blocked drafts. |
| D-408 | 8/10 | A | Approved work-email-bound referrer passkeys preserve the login boundary. Device acceptance is not supplied by unit tests; the seeker release awaits D-415's owner-present phone/laptop ceremony, with approved methods kept. |
| D-409 | 7/10 | A | Automated issues #1708/#1709 demonstrate detection. Complete issue → official pickup → repair → later passing QA, and the daily explorer acceptance, before claiming a fully self-repairing loop. |
| D-410 | 9/10 | A | Reuses the authorized demo sandbox instead of a paid container. Ordinary demo journeys do not cover MCP packet §8; its delegated journey, keyed ledger, decline/revoke/shortfall and cleanup remain separate release work. |
| D-411 | 8/10 | A | Owner-approved strings and a 31-day real-server MySQL journey resolve the legal/preview route. Do not ask a new legal question; finish exact-head CI and the paired-flag live skipped-sweep/countdown proof. |
| D-412 | 8/10 | A | Source work over status churn addresses the measured slowdown. Existing routing changes still need source-progress and throughput measurements; compare productive pickups and elapsed work, not report or merge counts alone. |
| D-413 | 8/10 | A | Primary's read-only `gh api`: auto-merge/merge commits true, squash/rebase false, secret scanning/push protection enabled, CodeQL default setup configured/default. Active green-CI ruleset `25433342` has strict typecheck/unit-aggregate/build/e2e requirements and no bypass actors; active `main-protection` `25733248` limits RepositoryRole bypass to `pull_request`. No effective `merge_queue` rule despite owner-reported setup: coordinator handoff for owner-settings reconciliation, not agent settings changes, a new task or a new landing blocker. |
| D-414 | 8/10 | A | The recorded long-page baseline justifies an app-like mobile flow. Before flipping, compare before/after captures and funnels, including keyboard, text zoom and smaller screens; mocks alone do not prove accessibility or completion. |
| D-415 | 8/10 | A | All-domain work-email protection and durable names address concrete gaps; the two picker fixes are explicitly promoted. Common-directory lock/zombie liveness and claim cost still need real-CLI acceptance in existing tasks, not new owner permission. |
| D-416 | 8/10 | A | Employer acceptance genuinely needs the owner-set `REVIEWER_EMPLOYER_PASSWORD` repository secret. Then extend the existing reset/runner pattern and obtain signed-in 1280/390 plus 24 h Sentry evidence; employer features remain non-launch-blocking and unsold. |

#### Additional top-five-open-task foundations

| ID | Rating | Status | Evidence, gap and cheapest existing closure |
|---|---|---|---|
| D-019 | 9/10 | A | Nov 28 demo QA restores evidence for core transitions, privacy and ledger behavior. It does not prove real-inbox/provider/payment paths; close existing basics acceptance, keeping real-money QA owner-only. |
| D-200 | 8/10 | A; X clauses | Shared capability removes single-session bottlenecks. Historical role/review clauses are amended by D-348/D-370; verify current routing, not obsolete model exclusions or independent-review waits. |
| D-321 | 7/10 | A | Holds have rulings, but a ruling is not a productive outcome. Follow existing unblocks through source implementation and accepted results rather than counting another coordinator receipt. |
| D-324 | 8/10 | A; X clause | Red main holds landing, not branch work. D-370 supersedes external-provenance pass-over; D-412 qualifies zero-wait with useful work. Prove official eligible pickups without weakening holds or authenticity. |

#### Next 20 oldest active entries (D-019 above included)

| ID | Rating | Status | Evidence, gap and cheapest existing closure |
|---|---|---|---|
| D-003 | 9/10 | A; X mechanism | Verified shipping remains the goal; direct-main mechanics are superseded by D-082/D-200/D-370/D-373. Prove the exact-head protected merge with required CI, never a direct push. |
| D-004 | 8/10 | A; X clause | Chargebee remains the billing authority. D-367 routes banded USD through Razorpay, not the old PayPal rule; use existing provider/currency fixtures rather than restoring legacy routing. |
| D-007 | 9/10 | A | Owner tax facts require no GST and approved India-price wording. Keep the approved settings; verify current invoice/catalog behavior without inventing a GSTIN or changing tax configuration. |
| D-008 | 8/10 | A; X clause | Durable docs prevent drift, but main-first docs are superseded by D-068/D-083's same-change path. Keep only affected docs with real work; D-412 rules out preflight/status churn. |
| D-009 | 8/10 | A; X order | One shared queue protects coordination. Original discretionary order is replaced by FIFO plus explicit D-370/D-415 exceptions; verify the official pick, never an opportunistic manual selection. |
| D-010 | 9/10 | A | Referral speed/supply, not merge count, is the north star. Use existing referral latency and verified-supply measures to test impact; process activity alone does not demonstrate seeker success. |
| D-011 | 9/10 | A; X clause | Company matching before money protects trust. Historical provider lists are amended by the login decisions; verify current provider acceptance and company/currency fixtures without restoring old methods. |
| D-015 | 6/10 | A | Supply-first still addresses the marketplace bottleneck; dates were amended by D-064. Aggregate outreach, verification and 72-hour outcomes lack a fresh receipt here; read existing private totals, with no new messages authorized. |
| D-016 | 5/10 | A | Historical owner attestation is not fresh verified supply or employer endorsement. Check current private aggregate totals and D-323 public copy; do not renew old proof or name employers as endorsing SkipWait. |
| D-017 | 8/10 | A | Keeping the chosen recipient preserves the seeker's intent. An old deployment receipt does not prove today's sign-in bridge; run the existing personal-link/sign-in acceptance with that recipient retained. |
| D-018 | 8/10 | A | The aggregate baseline contract enables evidence-led work without exposing people. A first live panel/baseline receipt is still missing here; use the existing authorized admin panel, not a new analytics system. |
| D-021 | 8/10 | A; X clause | Reopening after a decline gives the seeker another chance without refunding the decline. D-066/D-147/D-174/D-411 govern the current lifecycle; verify decline, reopen and withdrawal separately, without re-asking the settled charge rule. |
| D-022 | 8/10 | A; X clause | Employee-posted roles improve relevant supply. D-177 adds the link exception and D-220 replaces 48 h with 24 h first look; verify post, renewal and first-look behavior in existing acceptance. |
| D-023 | 9/10 | A | Honest counterarguments prevent agreeable but unsupported decisions. D-414 strengthens it: state the missing evidence and closure for every shortfall, never round a rating up or treat one as authorization. |
| D-024 | 8/10 | A | Avoiding orphaned public handles preserves shared links. Verify existing clear/link-404 behavior; this public-profile contract is separate from D-398's permanent referrer alias and does not reopen it. |
| D-026 | 9/10 | A | Current instructions prevent building against old intent. Publication does not prove receipt or productive implementation; follow existing work to accepted user outcomes instead of another read receipt. |
| D-028 | 7/10 | A; X clause | Honest company pages and unfurls can bring relevant supply. D-176/D-193 remove availability framing; close existing unfurl, indexing and canonical-page proof with real data, not a revived coverage promise. |
| D-030 | 8/10 | A; X clauses | The founder-locked role boundary stands as amended by D-049/D-057/D-406/D-408. Preserve approved methods, not obsolete prohibitions; finish existing real-inbox and device acceptance before claiming current login coverage. |
| D-031 | 9/10 | A | Free-first hard stops protect the owner's money (D-204). D-406 explicitly accepts its email cost, not blanket spending; use already-authorized free/credit-backed paths and leave new spend owner-reserved. |

- **Actions:** no new D-number, policy, task, status-only PR, settings mutation or production action. Record this review with the existing PICKER-claim-cost work; reconcile its packet intro to D-415's promotion, record session 2269's takeover in one Status line and update only its `syncedTo` to D-416. Each evidence remedy above belongs to existing acceptance work, not a new permission request.
- **Owner inputs, not reopened decisions:** D-416's employer password goes only into repository settings, never this ledger or chat; D-415's approved device release awaits the owner's phone/laptop sitting. Future D-400 handover policy remains reserved to the owner, with no active handover evidenced; no new handover approval is sought. Do not re-ask the resolved D-377 secrets, D-392 TEST payment or D-411 legal wording.
- **Local finding, not a global block:** the linked coordination receipt identifies a zombie-liveness gap local to a clone. Existing common-directory/liveness and claim-cost acceptance must distinguish it from a live expensive scan; no lock was bypassed and no system-wide hold is asserted. Root-phase attribution, repair and before/after claim proof remain unverified.
- **Cursor:** next oldest active entry D-033. The unreviewed D-222–D-375 debt remains, except individually rated entries; this section does not claim a full-register review complete.
