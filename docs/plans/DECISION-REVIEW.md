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

### 2026-10-29, Claude Opus 5.5 (session-start re-rating, D-206; decisions recorded as D-233)
- **Read receipt (D-225):**
  - **Source state:** `main` `4c6bafa4`, with CI green (run 40791203775).
  - **Read:** `docs/BRIEF.md`, `docs/BUILD_CONTINUITY.md`, `AGENTS.md`, `CLAUDE.md`, the register entries D-222 to D-232 in full and D-001 to D-019, and this ledger.
  - **Last outcome:** the Oct 27 section above. No CEO ledger entry was written since then. The board came from `next-task.mjs --status`.
  - **Picker:** previewed without claiming. It offered the REGISTER-D212 fix, then (with that avoided) the Tier 1 review of #786; this session took neither, because D-225 gives it the reasoning role and D-074 allows one packet a session. #786 is legitimate work: the coordinator lifted its PREP-ONLY hold for a non-Claude worker on Oct 28 at 10:33Z.
- **Scope:** every entry newer than D-221; the cursor D-001 to D-020; and the decisions under the five open rows at the top of the queue (P1-release-gate-strict-compare, PRICING-banded-oct25, LAUNCH-legal-copy, LAUNCH-live-qa, SKIPPY-fix).
- **One number first.** Since Oct 26 06:22Z, 104 pull requests merged to `main`, and 25 of them touched product code (`client/`, `server/`, `shared/`, `drizzle/`, `src/`). The other 79 changed only docs, scripts or the registry. That is the strongest argument against every process decision rated below, D-233 included.
- **Newer than D-221:**
  - **D-222, 8.** A seeker who also refers keeps their own count in view, and plain text keeps D-055's no-purchase line. Against: a seeker number in the referrer workspace mixes roles where a referrer decides; how many people hold both roles: I don't know. It waits for #666 (see D-233).
  - **D-223, 7** (it rated itself 8). Splitting work turned waits into rows, but it multiplied pull requests, markers and registry edits faster than product landings (the number above). Missing evidence: rows split against wait time saved. The cheapest test is `PROCESS-scorecard`, which is queued.
  - **D-224, 7** as an unblock ruling. Dark mode itself gets nobody referred faster; it is now owner-held (D-230).
  - **D-225, 8.** The preflight is why this session found the stranded rows. Against: the picker still offers Claude builds, so a reasoning session previews and avoids by hand (two offers today). A `--reasoning` picker flag that skips build, takeover, fix and green is a cheap later fix; it is not registered.
  - **D-226, 8.** A correct registry fix. Its independence line treated two DeepSeek spellings as different sessions, the gap D-233 closes; the coordinator flagged it on #762.
  - **D-227, 8.** Public, k-anonymous demand counts pull referrers in (loop L1), and supply is the binding constraint. Against: its four rows wait behind D-174-company-search, D-090-BYOR and D-048-p3-live-review-find, so nothing ships soon.
  - **D-228, 9.** It closed a finished row on reproduced evidence (57/57).
  - **D-229, 5** (proposed). A bespoke landing procedure for three pull requests shows that a general registration route is missing. Owner question 1 asks for the general rule instead.
  - **D-230, 9** as a record of the owner's hold. The feature behind it rates 4 against the goal.
  - **D-231, 8** as a queue fix. Its owner question is open.
  - **D-232, 8** as a record. The stale `agent/registry/p1-release-gate-strict-compare-done` branch that D-233 supersedes is the noise the held cleanup would remove.
- **Cursor D-001 to D-020:**
  - **D-001, 2, superseded** (D-048, D-120). Copying a kit "as it is" optimised for fidelity, not for referrals.
  - **D-002, 7, active as D-049.** `seeker-passwords` (#324) is owner-held and 1,830 commits behind, so release it as a rebuild, not a merge.
  - **D-003, 9, active** with D-082 and D-134 (6). Today `main` is green and the live API and web serve its exact SHA.
  - **D-004, 8, active and frozen.** One money system means one reconciliation path. Against: USD renewals wait for PayPal reference transactions, a gap in the "global" half of the goal.
  - **D-005, 3, superseded** by D-219.
  - **D-006, 9, active and frozen.** Referrers must trust that requests are not bought. D-196's paid priority is the first sanctioned exception and stays unsold until its routing is reviewed.
  - **D-007, 8, active.** Correct today. I don't know when registration becomes mandatory for this business (the turnover threshold, or USD export of services); a CA should confirm before revenue nears it.
  - **D-008, 6, superseded** by D-068's same-push rule. As practised, docs drift anyway: D-233 closed five stale rows.
  - **D-009, 7, active** as the picker. One queue works, but its `in-review` blind spot left the revenue review idle for two days (D-233).
  - **D-010, 10, active.** The goal.
  - **D-011, 8, active**; its providers moved into D-049. Missing Apple sign-in (D-209 question) matters for iPhone-heavy seekers.
  - **D-012, historical** (D-059). Item (2) lives on as D-147, rated below.
  - **D-013, historical** (D-053).
  - **D-014, historical** (D-046, D-219). Its fact still matters most: on Oct 14 no external company had an available referrer. No session can read today's value.
  - **D-015, 9 for the strategy; results unknown.** Supply is the binding constraint, and founder outreach is the cheapest supply lever. The day-14 review is Nov 2. Missing evidence: the D-018 numbers (owner question 2).
  - **D-016, historical.** The "Open doors at launch" landing row is gone from the client; the phrase survives only as a referrer-workspace headline, and D-176 removed availability framing.
  - **D-017, 8, active and mostly done.** `P0-ask-link-signin` is done, and `D-174-fix-post-binding` covers posted roles. The personal link is the referrer's own growth loop (L2).
  - **D-018, 8, active.** "Faster" cannot be measured without it. Against: the panel is admin-only and unreported, so no session sees the numbers.
  - **D-019, 10, active and frozen.**
  - **D-020:** the register has no row; D-067 quotes an owner message by that label. Nothing to rate.
- **Under the top five open rows:**
  - **D-082, 9.**
  - **D-219, 8,** unchanged. Its delivery (#666) sat unrouted at `in-review` for two days while the paused legacy pack stayed on sale (D-233).
  - **D-151, 9 as a rule, 6 as enforced** before D-233: exact spellings, and outside builders were invisible.
  - **D-147, 6,** unchanged; the scope question stays open.
  - **D-221, 7.** A thorough audit, but its follow-up rows `DECISION-COPY-oct26` and `DECISION-SYNC-oct26` have sat at `todo` for three days.
  - **D-216, 7.** The hold is correct, but `LAUNCH-live-qa` still has no signed-in legs.
  - **D-201, 9.** S-1 (SSRF) is fixed and independently reviewed (#800). S-2 to S-6 remain, and every Skippy flag stays off.
  - **D-140, 8.** The right pre-launch bar; `SKIPPY-redteam` waits.
  - **D-123, 9.** It kept prices from going live without the owner's word.
- **Actions:**
  - D-233 (CEO remit) routes reviews of work built outside the picker: `builtBy`, D-151 by model family, `--avoid` instead of a block, and `in-review` only while a named session is landing the row.
  - Registered the build row `PICKER-review-identity` (Tier 2), placed just after `PRICING-banded-oct25`; `PROCESS-review-gate` now waits for it.
  - Closed five rows on evidence: `P1-release-gate-strict-compare` (item 5 met by three gated releases and a CONVERGED live check), `D-048-fix-start-ask-handoff`, `D-166-founder-decisions-sync`, `D-048-doctrine-benefit-copy` and `D-179-ats-validation`.
  - Corrected `docs/DELEGATION.md` §6 and the `AGENTS.md` queue row to the family rule. No price, flag, legal text or money path changed.
- **Owner questions (rated, D-023):**
  1. **A route for CEO docs pull requests to reach an independent reviewer, 8/10.**
     - *Evidence:* #799 merged with no independent delta review (disclosed: the Copilot reviewer was out of quota), and #798 merged two minutes after its review request. The picker reads rows only from `main`, so a new decision cannot be handed to a reviewer before it lands.
     - *Recommendation:* let a pull request that only adds one Tier 1 `REGISTER-*` row and its brief land on required CI, so the picker then routes the real change's review.
     - *Against:* it waives review for a class of pull requests, which is your rule to bend; a registration could also slip in a reorder. Scope-checking it to one added row limits that.
     - *Alternative:* wait for `PICKER-architect-landing` (D-190), which now sits behind `PROCESS-review-gate` and `PICKER-review-identity`.
  2. **The D-018 numbers before the Nov 2 day-14 review of D-015.** Four numbers: verified referrers by company, weekly active external referrers, requests per week by outcome, and median time to a referrer's first decision. This is not a decision; it decides how D-015, D-227 and D-223 rate next.
  3. **Seven rows wait for you.** Suggested order by goal impact:
     1. `LAUNCH-legal-copy` (#659). Terms still says "Referrals are always free" (`client/src/pages/Terms.tsx:23`) while packs sell and D-219 prices are frozen.
     2. `D-048-F-shell-parts` (#767).
     3. `LAUNCH-live-qa` (#710).
     4. `BRANCH-HYGIENE-2`.
     5. `D-048-dark-mode` (#766).
     6. `DEVICE-SIGNIN-passkeys` (#697).
     7. `seeker-passwords` (#324, as a rebuild).
- **Cursor:** the next session rates D-021 to D-040, then every entry newer than D-233.
