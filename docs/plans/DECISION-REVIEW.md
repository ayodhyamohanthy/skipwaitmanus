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

### 2026-10-29 (evening), Claude Opus 5.5 (session-start re-rating, D-206; no new register entry)
- **Read receipt (D-225):**
  - **Source state:** `main` `622d1b0f`, with CI green (run 40873309908). Live web serves `622d1b0f` and live API `4c6bafa4`; the four merges since `4c6bafa4` touched no server code.
  - **Read:** `docs/BRIEF.md`, `docs/BUILD_CONTINUITY.md`, `AGENTS.md` and `CLAUDE.md`; D-200, D-214 and D-222 to D-232 on `main`; the draft D-233 on #818; D-021 to D-040; this ledger; the `PRICING-banded-oct25` and `FND-4` packets.
  - **Last outcome:** the morning section, which is on #818 and not on `main` (draft, head `9dd3a6df`, required CI green, behind `main`). In the ten hours since, it got no review and no comment, and nobody took #666's review.
  - **Picker:** previewed without claiming. It offered the Tier 1 review of #815 (`D-048-p3-inbox`), which this session did not take (D-225).
- **Scope:**
  - D-233, the only entry since the last section.
  - The cursor, D-021 to D-040.
  - The decisions under the top five open rows. Those rows are unchanged since this morning: `P1-release-gate-strict-compare`, `PRICING-banded-oct25`, `LAUNCH-legal-copy`, `LAUNCH-live-qa` and `SKIPPY-fix`.
- **Newer than the last section:**
  - **D-233, 7 (draft).** The diagnosis is right, and I reproduced it: an `in-review` row is never handed out, and D-151 compares spellings. Against: it bundles the one urgent fix (#666's status) with a rule change, a new row and five closures. That needs a careful review, and no route provides one, so nothing moved in ten hours. This session ships the urgent piece alone, as #804 does for #734.
- **Cursor D-021 to D-040** (D-025 and D-027 are retired IDs; D-020 has no row):
  - **D-021, 8, active**, as amended by D-066 and D-147. Reopening a request to colleagues gives the seeker a second chance sooner. Against: the seeker's spend stays gone after a claim and a decline; D-147's scope question is still open.
  - **D-022, 8, active**, as narrowed by D-177 and D-220. Posted roles turn referrers into supply. Against: no session can see how many posts exist or convert.
  - **D-023, 9, active.**
  - **D-024, 7, active.** The rule is fine. Its reason ("custom handles as the paid perk") has no current source: no D-219 plan lists the perk, and no code gates one.
  - **D-026, 10, active.** Its sync clause now lives in D-206 and D-225.
  - **D-028, 6, half done.** Company pages exist, but a shared company link still unfurls as the generic site card. Live today, `og:title` on `/explore/skipwait` reads "Private job referrals from verified employees", not the company. No queue row owns company link previews, and they are a share loop. Missing evidence: share counts.
  - **D-029 and D-032, historical** (merged into D-026 by D-059).
  - **D-030, 9, active and frozen.** Work-email-only sign-in is the trust signal referrers rely on. Against: a code on every visit costs the scarce side effort. The referrer passkey (D-209) is your call.
  - **D-031, 9, active.**
  - **D-033, 8, active.** I don't know whether any data shows people picking the wrong role.
  - **D-034, 9, active and done** (`66801d2b`, `29ba528e`). Spending only when a referrer can see the request is the fairest money rule in the register.
  - **D-035, historical** (rejected, D-147).
  - **D-036, historical** (superseded by D-219). One part of it is still live: it said the per-credit route retires once packs sell. On Oct 25, after your pause and after the provider archive, that route still opened a working 10-credit cart (#666 comment 6399494075). #666 is that retirement.
  - **D-037, historical** (retired by D-059).
  - **D-038, 8, active and live** (`907bf2cd`). Against: its north-star number (requests referred within 7 days) is reported nowhere a session can read. That is the same gap as D-018.
  - **D-039, 8, active** as amended by D-219 (3). The card switch is off, so today the 3 a month need no card.
  - **D-040, 7, active.** The fairness rule is right, but its open half is a live money path. The direct-Razorpay employer unlock checkout is still on `main` (`server/employerRoutes.ts:113`), although D-004 (frozen) and D-040 move employer payments to Chargebee. D-040's sync cell left switching it off to you on Oct 16, and it is still open (owner question 3).
- **Under the top five open rows** (new evidence only; the morning's ratings stand):
  - **D-219, 8.** #666 merges cleanly with `main` `622d1b0f` (tree `73c61fde`). All 22 changed files are inside its owns, and its `ci.yml` diff is empty, so a review is the only missing step.
  - **D-082 9, D-151 9 as a rule and 6 as enforced, D-147 6, D-221 7, D-216 7, D-201 9, D-140 8, D-123 9:** unchanged.
- **Findings** (no decision needed; each has a named route):
  - **The default share text breaks the wording rule.** `client/index.html:18,23,29` (description, `og:description` and `twitter:description`, used by every page without its own) says "3 free credits every month; extra asks use credits". D-173 and D-180 keep "credit(s)" and the noun "ask" off pages. #716 (`D-180-a-free-asks-chip`) changes only the first half and waits for eight rows plus a review; `D-180-referral-words` owns the tail. Next CEO session: decide whether this one file gets its own small row.
  - **`/explore` still claims availability.** Its live description reads "Find people open to referral requests at …", and `/api/companies` still returns `openToReferrals` (D-176; D-193 (5)-(6)). `D-176-public-claims` owns both and is waiting.
  - **FND-4 is a live rule gap.** On `main` `622d1b0f`, `server/sentry.ts:7-13` redacts browser routes only, and `server/errorAlerting.ts:99` sends `req.originalUrl` with its query. Four token-bearing API routes reach Sentry and alert emails unredacted. Exposure is low, because the review link is bound to the signed-in referrer, but the rule is absolute.
- **Actions** (docs and registry only; no code, price, flag, legal text or money path):
  1. **`PRICING-banded-oct25`: `in-review` to `todo`** (D-200 (2)). The note names the builder (Instinct) and the fixer (Claude, `dbb0aa12`); both take the picker with `--avoid`. Run on this branch as an uninvolved model, the picker now hands out "REVIEW PRICING-banded-oct25" first.
  2. **`FND-4` declares its packet's files and waits for `D-090-BYOR`.** BYOR owns the same Sentry and alert files and is fixing the same leak for its invite route. Packet §0b and the §3b line say why. `DEPLOY-gate-docs-sync` also waits for it, because both own `docs/ARCHITECTURE.md`.
  3. **Validation:** `validateAssignments` with the parsed register reports 221 rows and 0 errors.
- **Owner questions** (rated, D-023):
  1. **Merge two one-line routing fixes, this one and #804: 9/10.**
     - *What they do:* each moves one stranded Tier 1 row to `todo`, so the picker hands its review to an eligible model. No code changes.
     - *Against:* you merge without an independent read of a registry diff. Each diff is one status field plus notes, and D-200 (4) lands Tier 2 and 3 docs changes on green CI anyway.
  2. **Name who lands a registry-only PR that is not a queue row: 8/10.** This sharpens this morning's question 1.
     - *Proposal:* any session other than its author lands it on green required CI, if it changes only existing rows' status, notes, owns or dependsOn and adds no rule, price, legal text, flag or money path.
     - *Evidence:* the fix for #666 had no lander for about 57 hours, #804 has waited 19 hours and #818 ten.
     - *Against:* a reorder can starve a lane. Limiting it to existing rows, with the reason in the PR, keeps that visible.
  3. **Switch off the direct-Razorpay employer unlock checkout (D-004, D-040): 7/10.**
     - *Against:* an employer mid-purchase would be stranded, though the reconcile path at `server/employerRoutes.ts:120` stays.
     - *Unknown:* I don't know whether `RAZORPAY_KEY_ID` is set in production. The cheapest test is `wrangler secret list`, which only you can run.
  4. **Unchanged from this morning:** the D-018 and D-038 numbers before the Nov 2 day-14 review of D-015, and the seven owner-held rows.
- **Cursor:** the next session rates D-041 to D-060, then every entry newer than D-233.
- **Nov 3 merge note (#828 merged `main` `fa462f69`):** this pull request no longer changes any queue row. On `main`, `PRICING-banded-oct25` went to `todo` and was then parked at `owner` by D-266 (Nov 1), because its Tier 1 review gate cannot be handed to any session. FND-4 is `done` at `4762a1e2` (Hark · 3f68), so the BYOR ordering in actions 1 and 2 above is moot. The merge keeps `main`'s rows, plan line and FND-4 packet, so only this section remains. The ratings above are as of Oct 29 and are not re-rated here.
- **Nov 19 merge note:** this section is placed by date, between the Oct 27 and Nov 11 sections. The sections after it keep the Oct 26 Cursor ("unchanged from the Oct 26 section"), so its own Cursor line above is superseded: the newest section's Cursor governs. On `main`, D-001 to D-020 are still unrated (this session's Oct 29 morning ratings of them are on the unmerged #818), and D-021 to D-040 are rated here as of Oct 29.

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
