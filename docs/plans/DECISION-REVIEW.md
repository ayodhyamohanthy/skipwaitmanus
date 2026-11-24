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

### 2026-11-25, DeepSeek V4.1 Flash · 6f0f (CEO review; a partial review, not the full D-206 pass)

- **Scope, stated plainly:** the picker handed this session the CEO review after reporting "Nothing is left for you: no red main, nothing of yours open, no block you may clear, no packet, review, landing or build". This section rates (a) the ledger's own Cursor, D-001 to D-019, which five sections have left unrated, and (b) the entries newer than the last section that this session read in full, D-383 to D-396. The rest of D-222 to D-382 still has no review here.
- **Measured on `main` `c1e31c93a` before any action:** `node scripts/scorecard.mjs` — 80 merged pull requests in the sample (product code 27, scripts 14, docs only 39), 0 reverts, median open-to-merge 0.3 h, longest 7.8 h; live API `0e0de783` and live web `0ce4c488` behind main, which D-003 makes expected when the newer commits touch neither surface. `docs/plans/assignments.json` — 429 rows: 313 `done`, 95 `todo`, 19 `owner`, 2 `in-review`, 1 `architect`. Of the 95 `todo`, 66 have every dependency done and the picker's board calls 65 of those 66 `done`. **The registry says the queue is full while one row is genuinely open.**
- **Ratings (against the goal: the go-to global site for job referrals, getting people referred faster):**
  - **D-001 (implement every kit v4 PNG), 2/10, superseded.** D-120 retired the kit and D-332 forces its removal; the board shows 124 of 138 D-048-p3 rows done. Building 211 screens to a retired spec is the clearest example of work that did not move the goal.
  - **D-002 (WorkOS password sign-in), 8/10, active through D-049.** Shipped as #1474 on Nov 23. Above 7 because it removes a per-sign-in email cost (D-031) and gives seekers a method that does not depend on a social provider. Against: a password is a weaker factor than OAuth and adds reset support to the basics list (D-019).
  - **D-003 (ship each verified group straight to `main`), 6/10 as written.** The direct push is gone (D-082), and D-370/D-371 replaced it with a pull request plus auto-merge. What survives is the useful part: small verified increments. Below 7 because the original wording still reads as permission to push to `main`.
  - **D-004 (Chargebee is the only plan holder), 9/10.** Still the live architecture; D-392's TEST flow runs through Chargebee and no direct gateway route exists. Against: one provider is one outage away from no revenue.
  - **D-005 (30/90-day passes and prices), 2/10, superseded by D-219.** The passes are unsold (`PASS_SALES_ENABLED = false`) and the catalog is banded.
  - **D-006 (never sell referrals, priority, visibility or seeker→referrer payments), 10/10.** It is the trust base of the product, and D-323 turned it into public copy. No counter-argument found.
  - **D-007 (no GST, "India price"), 9/10.** Correct while the business is not GST-registered. Below 10 only because it must be revisited the day a GSTIN exists, and nothing in the queue watches for that.
  - **D-008 (docs first), 8/10.** It kept the register honest for six weeks. Below 10 because D-068's "same push" rule now does the work and the "commit to `main` first" half is dead.
  - **D-009 (one queue, P0 first, then lowest unblocked), 5/10, superseded by FIFO (Oct 31).** Historical.
  - **D-010 (north star), 10/10.** Every rating in this file is measured against it.
  - **D-011 (Google/Microsoft/GitHub; work-email rejects personal domains), 8/10.** The work-email gate is what makes a referrer trustworthy. Below 10 because the provider list has since grown (LinkedIn, Slack) and D-333 removed Apple, so the entry no longer states the current list.
  - **D-012 (four P0 bugs), 7/10, historical.** Fixed; kept for the audit trail.
  - **D-013 (keep the kit queue order), 3/10, superseded.** It ordered work by a retired design.
  - **D-014 (sell 30/90-day passes), 2/10, superseded by D-219.**
  - **D-015 (founder supply sprint, ~25 messages → 5 verifications a week), 7/10.** Supply is still the binding constraint on "getting people referred faster", so the instinct was right. Below 8 because the register never records whether the sprint ran or what it produced, so the same gap is now being rediscovered by D-360/D-363's "no referrers yet" empty state.
  - **D-016 (keep the "Open doors at launch" row naming Wipro, TCS, Merkle, Go Neutrinos), 4/10, superseded.** The row is gone from `client/src`; the names survive only in test fixtures. Naming employers in public copy now contradicts D-323 (no employer named, no employer's approval claimed) and D-365 (no person's name).
  - **D-017 (the personal link keeps its referrer through sign-in), 9/10.** It is the referrer's own growth loop, and D-050/D-090 built on it. Against: a personal link routes one ask to one person, so it does not fix company-wide coverage.
  - **D-018 (admin baseline metrics panel), 8/10.** The only funnel visibility the team has. Below 10 because this session could not read its numbers (no production access), so its value is **UNVERIFIED** here; the cheapest check is one readback of `/admin/flow-health` by a session that can sign in.
  - **D-019 (basics always work), 10/10.** The P0 rule that every other row is judged by.
  - **D-383 (`BANDED-release` reopened), 9/10.** It caught a real dead end: a docs-only merge made the picker call a `todo` row complete while `GET /api/chargebee/banded/offer` still answered `onSale:false`. Above 7 because it is the only entry in this batch that corrected a false "done" with a production readback. Against: it took a manual readback to notice, so the same failure can recur on any row (see the finding below).
  - **D-384 (`D-174-pool-nudges` unblock), 8/10.** A pool delivery now writes the review grant and a capped hourly job sends the email, so the waiting pool is not a dead end. Below 10 because it is unbuilt.
  - **D-385 (`D-174-expiry-clock-removal` packet behind `ASK_NO_EXPIRY_ENABLED`), 8/10.** The right shape: default off, and the release row turns it on only together with `ASK_RECONFIRM_ENABLED`. Below 10 because two switches that must move together are a new failure mode with no test named for the pair beyond the coupling test.
  - **D-386 (retire `PICKER-stale-fixed-landing`), 8/10.** Removes a dead end D-370 made impossible.
  - **D-387 (permanent fixes for the Nov 24 blockers), 9/10.** "Live QA can no longer pass silently" is the highest-value line in it: a green run that proves nothing is worse than a red one. Below 10 because five unrelated fixes share one entry, so a partial landing cannot be read from the register.
  - **D-388 (more permanent fixes), 8/10.** Session worktrees fixed a measured contention. Same batching objection as D-387.
  - **D-389 (prove the launch checks live with the two demo accounts), 9/10.** It chose the free route over a paid second container, which is D-031 applied correctly, and it named the exact gaps the navigation-only runner cannot prove. Below 10 because the runner it depends on cannot yet move credits, so the money paths stay unproven until `OPS-live-qa-journeys` lands.
  - **D-390 (`LAUNCH-live-qa` waits on `OPS-live-qa-journeys`), 9/10.** It prevented D-383's exact failure on a second row. Below 10 because it serializes two Tier 1 rows behind one runner, so one runner defect now blocks the whole launch acceptance.
  - **D-391 (`D-174-expiry-clock-removal` unblock), 8/10.** Correct reconciliation of a dependency that read as unmet after its work merged.
  - **D-392 (`BANDED-release`: one owner TEST payment), 9/10.** The diagnosis is honest (Chargebee's hCaptcha withholds the token; the card was filled correctly), it refuses to work around a bot check, and it keeps the owner's payment in the owner's own browser. Below 10 because it puts a manual owner step on the only revenue path, and the row has now waited on the owner twice.
  - **D-393 (test accounts, admin activity log, one support page per person), 10/10.** The highest-leverage entry in the batch: it lets the owner and the team test any company and any referral without notifying a real employee, and gives admin per-person visibility so a user's report can be reproduced. Both directly shorten the distance between a defect and a fix. No counter-argument found; the sandbox boundary (demo requests reach only the demo referrer) is what makes "any company, no limits" safe.
  - **D-394 (search goes live), 10/10.** It is the owner's release word for the seeker journey and it puts search at the top of the funnel, which is the first step of "getting people referred faster". No counter-argument found; the honest "No referrers yet" state is what keeps it from overpromising.
  - **D-395 (`D-178.read` unblock), 8/10.** Correct: the row needed `D-178.grant`, not `SKIPPY-6`.
  - **D-396 (`D-048-p3-premium` unblock), 8/10.** Correct: the repair child is the accepted implementation and the parent's reconciliation stays with its holder.
- **Actions:** registered row `PROCESS-registry-reconcile` (Tier 3, docs only) with packet [`PROCESS-registry-reconcile.md`](PROCESS-registry-reconcile.md), last in the list so it jumps no FIFO position. It reconciles the 65 board-done rows against their merged pull requests under D-373 (6), and keeps any row that still owes work open with its remaining steps. Nothing owner-reserved was changed: no price, plan content, sales switch, legal text, login rule, money path or spending.
- **Finding (the reason the row exists):** the picker's board and `assignments.json` disagree on 65 rows. The board is right — four checked by hand (`seeker-passwords` #1474, `D-174-expiry-clock-removal` #1552, `D-174-ask-from-job` #1488, `REL-ops-invariants` #1504) all merged the real implementation. The effect is not cosmetic: FIFO is computed over finished work, and a session that reads the list believes 95 rows are waiting when one is. D-383 shows the opposite error is also live (a docs merge counted as done), so the reconciliation must check each row's merged pull request, not just its existence.
- **Owner questions:** none new. The two open owner actions are already recorded and unchanged: the one TEST-card payment for `BANDED-release` (D-392) and the two QA secrets for `LAUNCH-live-qa` (D-377).
- **Cursor:** next session rates D-021 to D-040 (oldest first; D-020 is not a row in the register), then D-222 to D-382, which no section has rated.
