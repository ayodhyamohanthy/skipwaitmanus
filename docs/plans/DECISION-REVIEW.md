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
- **Cursor:** unchanged from the Oct 26 section.
