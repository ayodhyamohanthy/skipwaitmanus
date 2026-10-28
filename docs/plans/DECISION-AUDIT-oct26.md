# Decision audit, Oct 26 2026 (D-221)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code at the owner's request in the Oct 26 Claude Code session (a session message with no iMessage original, paraphrased): older decisions name the newer ones that changed them, and no task builds a superseded rule. This file is the evidence behind register entry D-221. It changes no price, billing, refund, reward or release flag.

## How the request was read
The request has two readings, and the audit covers both:
1. **Propagation:** when a newer decision changed an older one, the older entry says so, and nothing still builds, sells or promises the older rule.
2. **Integrity:** no older owner decision was quietly rewritten in place, or overridden by a ruling that was not the owner's to make.

The owner's answers in the session set the limits:
- Record the Oct 25 banded pricing, the paused packs and the card-verified free allowance now.
- For first-look timing, invite rewards and the extra prices, recover the original wording before marking anything superseded, and coordinate the evidence with Instinct on GitHub.
- Change no billing, prices, rewards or flags.

## Method
- **Snapshots:** `origin/main` `927dfac`, re-checked on `0367fcbe` and `ad8bbb23`.
- **Register mapping:** 9 agents read all 193 rows. For each newer entry they recorded what it supersedes, amends, narrows, suspends, rejects or retires, with quotes. They also recorded who made the ruling and whether it touches an owner-reserved item.
- **Adversarial verification:** 83 older rows whose status cell named no newer entry; 145 suspected conflicts that neither entry names; 58 cases where a ruling not made by the owner changed an owner-reserved one. Each claim was refuted where the text did not support it.
- **Work audit:** the 88 queue rows that were not done, each with its packet; every open pull request (92, then the 38 newest again on current `main`); the instruction and product docs; and the runtime code on `main`.
- **History check:** every version of `docs/DECISIONS.md` on `main`'s first-parent history (75 versions), to find rows whose text changed after they landed.
- **Evidence from Instinct:** two comments on PR #666 (6423014846 and 6423059948). The audit's reply and its three open questions are comment 6423290055.

## 1. Results in one view
- **86 older entries** did not say what had changed them. Each now ends with "Oct 26 audit, changed by: ..." (section 3). No decision text was edited.
- **The Oct 25 owner decisions were missing from the register** while code PRs (#666, #672) implemented them and queue rows kept building the replaced D-132 pricing. They are now **D-219** (banded pricing, paused packs, free 3 with a verified card, plus the referrer and company prices, none of them chargeable yet) and **D-220** (24 h poster first match). `docs/PRICING.md`, `AGENTS.md`, `docs/BRIEF.md`, `docs/PRD.md` and `docs/plans/README.md` now state them.
- **Three queue rows were building the replaced model** (D-132-item3, D-132-v2-checkout, SKIPPY-3). They are now `architect` for a re-scope. D-132-item3's re-scope first delivers the accepted-price check SKIPPY-fix S-3 needs (answer 409 before any charge), so the SSRF security fix does not wait on rebuilding the superseded quote.
- **Seven live strings and one string landed by D-132-audit** still state a replaced rule. They now have owners: the new row DECISION-COPY-oct26 and the D-048-fix-send-ask-blocker note.
- **Owner questions** remain only where the existing evidence leaves a real gap (section 8). Evidence on three of them is pending from Instinct.

## 2. Corrections made in this change
| Where | Correction |
|---|---|
| `docs/DECISIONS.md` | 86 status notes (section 3); new D-219, D-220, D-221; eight new Superseded lines (D-028/D-104, D-043, D-054, D-059 translation, D-066 Send again, D-117, the D-132 family, D-022) and the pass-sales chain carried through D-084 and D-146; the Oct 23 merge-policy amendment notes D-200 (4). |
| `docs/PRICING.md` | The model is D-219. D-132 is superseded history. Runtime truth: nothing new on sale; packs paused but `CREDIT_PACKS_ON_SALE` still true until #666; no referrer or company charge. Lists what is not decided. |
| `AGENTS.md`, `docs/BRIEF.md`, `docs/PRD.md`, `docs/plans/README.md` | Their pricing lines now say D-219, not "D-132 only, packs on sale". |
| `docs/plans/assignments.json` | D-132-item3, D-132-v2-checkout and SKIPPY-3 set to `architect`. SKIPPY-fix keeps its D-132-item3 dependency (pinned by `scripts/register520Packets.test.ts`), and D-132-item3's re-scope delivers the accepted-price check first. D-048-p3-skippy waits for SKIPPY-fix (D-201). Notes added to SKIPPY-6, ASSIST-approval-cost, LAUNCH-legal-copy, D-086-demand-list, PICKER-decision-sync and the six D-132-dependent journey rows. New row DECISION-COPY-oct26. `validateAssignments` returns `[]`. |
| Packets | `SKIPPY-fix.md`, `SKIPPY-next.md` and `STRANDED-OCT23.md` open with a pricing-basis notice. New `DECISION-COPY-oct26.md`. |
| `docs/plans/DECISION-REVIEW.md` | This session's entry (D-206). |

## 3. Every older entry and what changed it
Generated from the register's status cells. Where an entry is changed by more than one newer entry, the whole chain is listed; the newest wins.

| Older entry | Changed by (status note added Oct 26) |
|---|---|
| D-001 | narrowed by D-044 (kit sets layout, never numbers) and D-033 (sign-in role cards); kit pricing superseded by D-005 |
| D-002 | displaced by D-030 (seeker code sign-in) until D-049 revived passwords for seekers only |
| D-003 | also amended by D-074 (Tier 1 independent review on a draft PR) and D-134 (6) (fast-forward or up-to-date merge, never squash); docs-only and Tier 2/3 landings follow the Oct 23 owner merge-policy amendment and D-200 (4) |
| D-005 | Pro/Max clause superseded by D-067; Free counts superseded by D-039; plan credits amended by D-041; DM perk narrowed by D-012; the whole pricing model superseded by D-219 (Oct 25 banded freeze) |
| D-006 | narrowed by D-040 (employers may buy labeled ads and tooling), D-135 (4) (plan Reach, flagged, at D-132 enable) and D-196 (opt-in referrer-plan first access); the seeker-side rule stands |
| D-008 | strengthened by D-068 (docs move in the same push, never after the code); D-083 lets a picker task's docs ride its branch to main with the code |
| D-010 | per-change owner approval narrowed by D-058, D-091, D-123 and D-203 (5): only the owner-reserved list waits for his yes |
| D-011 | provider list merged into D-049 by D-059; company binding stands |
| D-012 | item (2), a decline keeps the credit spent, still binds as the decline-credit rule (D-147, Superseded section); item (3)'s Pro/Max notice superseded by D-067 |
| D-013 | retired by D-059 |
| D-014 | retired by D-059 as a duplicate of D-046; pass sales now off (D-146) |
| D-015 | dates amended by D-064 (clock restarted; day 14 Nov 2, day 30 Nov 18) |
| D-016 | day-30 review moved to Nov 18 by D-064 |
| D-019 | login basics follow D-030 as amended by D-049 and D-057 |
| D-021 | amended by D-066 (a post-accept step back also reopens the ask); the decline-credit clause is confirmed by D-147 (no release on any decline) |
| D-022 | posting-link rule narrowed by D-177 (employee-shared referral drives may post without a public career-page link); 48 h first-look window superseded by D-220 (24 h poster first-match window) |
| D-028 | coverage-state clause superseded by D-176 and D-193 (5)-(6): no availability status, and the public payload drops openToReferrals/openCount |
| D-029 | merged into D-026 by D-059 |
| D-030 | seeker method amended by D-049 (password + social, no code, when task 2 ships); referrer continuity login amended by D-057 |
| D-032 | merged into D-026 by D-059 |
| D-034 | partly superseded: lapses and unreferred acceptances release the credit (D-038); the 7-day clock counts from first visibility (D-061); expiry clauses suspended for launch by D-174; unit renamed 'referral' by D-173 (wording only); per-level cost at D-132 enable (D-135) |
| D-035 | closed and off the queue by D-163 |
| D-036 | pack ladder replaced at D-132 enable (D-135); packs stayed on sale meanwhile (D-146); pack ladder superseded by D-219 (old packs paused; per-level extra referrals) |
| D-037 | retired by D-059 |
| D-038 | refined by D-076 (what release and lapse mean in the ledger) and D-066 (2) (post-accept step back) |
| D-039 | grant gated on a provider-validated card when FREE_CREDITS_REQUIRE_CARD_VALIDATION is on (D-079, off in prod); unit renamed 'referral' by D-173 (wording only); amended by D-219 (3 a month at any level, verified card, no carry-forward) |
| D-040 | narrowed by D-135 (4) (plan Reach, flagged, at D-132 enable) and D-196 (opt-in referrer-plan first access) |
| D-041 | plans not sold (D-146); plan contents replaced at D-132 enable (D-135); plan contents replaced by D-219 |
| D-042 | narrowed by D-133 (the advertised $199 employer programme removed) |
| D-043 | dates moved by D-064; the bonus-pitch rejection is narrowed by D-086 (3), D-087 (L5), D-089 (3) and D-099 (employer-published bonus figures with a source, never paid by skipwait.me) |
| D-044 | 'the kit governs layout' superseded by D-048; the catalog-numbers rule stands |
| D-045 | retired by D-059 |
| D-046 | pass and Keep warm sales suspended by D-084 and superseded by D-146 (D-132 plans only, packs on sale); go-live gated by D-059 and D-075 |
| D-047 | a waiting ask older than 30 days reconfirms before its spend (D-061; built without closure by D-193 behind ASK_RECONFIRM_ENABLED); one credit becomes the level cost at D-132 enable (D-135) |
| D-048 | refined by D-070 and D-077; the #358 rollout map replaced by D-134's picker split; in-place redesigns allowed by D-149/D-150; Kit v4 retired by D-120 |
| D-049 | release gated by D-080, now path (b) (D-163); reset path narrowed by D-081 |
| D-052 | Send again not approved (D-147, D-163); the picker never shows a credit effect (D-066 (4)) |
| D-053 | order amended by D-072 and D-075; the D-035 step dropped (D-147, D-163) |
| D-054 | tool choice superseded by D-204 (3) (Umami web analytics, Mixpanel funnel fed server-side); the D-018 server-side counts stand |
| D-056 | freeze lifted for owner-approved items by D-111 |
| D-058 | amended by D-068, D-085 and D-200 (Claude Code builds; nothing waits for one model); the reliability list stands |
| D-059 | no-business-numbers principle reversed for per-company demand counts by D-086; the translation answer superseded by D-093 |
| D-061 | the 90-day close and the day-30 closure are suspended for launch by D-174; reconfirm-before-spend is built without closure by D-193 (4) (ASK_RECONFIRM_ENABLED) |
| D-066 | (1) Send again rejected by D-147 and D-163; (2) and (3) detailed by D-076 (4), (8) |
| D-070 | navigation amended by D-077 (Impact is a queue-header link) |
| D-071 | comp details amended by D-077 |
| D-072 | 'one lane at a time' amended by D-075 (parallel-safe lanes) |
| D-073 | 'push to main as today' amended by D-082 (pull request first, green CI on the exact commit) |
| D-074 | (1) amended by D-109 (any agent writes packets); (2) extended by D-202 (3) (read newer register entries); (3) narrowed by D-151 (the reviewer is another model); (4) owner-kept list narrowed by D-091, D-123 and D-203 (5); (5) narrowed by D-134 (5) (shared-row status lives in the packet) |
| D-076 | (1) and (6): one credit becomes the level cost at D-132 enable (D-135); the D-035 parts are not approved (D-147) |
| D-078 | order reversed by D-163 (the D-057 session gate first); (5) amended by D-080 |
| D-079 | card validation becomes the free-allowance rule under D-219 (3); the switch stays off until enabled |
| D-082 | (3) narrowed by D-182 (required checks only; Workers Builds is not a gate); (4) landing mechanics amended by D-134 (6); docs-only landings follow the Oct 23 owner merge-policy amendment and D-200 (4) |
| D-083 | 'only Claude Code adds, removes or reorders tasks' amended by D-200; the review exclusion amended by D-151 (1), D-184 and D-200 (4) (by model, builders and fixers only) |
| D-085 | amended by D-109, D-195, D-200 and D-203: Claude Code builds too, nothing waits for one model or session, and any capable session may write packets and order rows |
| D-087 | build order amended by D-162 (BYOR before the demand list) |
| D-089 | (3) order amended by D-162 |
| D-091 | owner-yes list restated by D-123, D-126 and D-203 (5) |
| D-094 | provider plan amended by D-204 (3) (Azure OpenAI on startup credits first, Bedrock fallback) |
| D-104 | 'verified referrers inside' figure withdrawn by D-176 (no coverage data on company pages) |
| D-109 | (c) and (d) amended by D-200 (any session unblocks and records rulings) and D-151 (1) (Tier 1 reviewer eligibility by model) |
| D-110 | per-ask credit cost superseded by D-219 (one referral of the request's level band; the L1-L10 to band mapping is open) |
| D-112 | the Stealth pass is not sold under D-146 |
| D-115 | step prices amended by D-124; one price book per person by D-122; superseded by D-219 |
| D-117 | (2) seeker level superseded by D-148 (optional, seeker-chosen, never inferred) |
| D-118 | (1)-(2) plan shape superseded at enable by D-132 (D-135); plan shape superseded by D-219 |
| D-120 | 'flag-safe' migration amended by D-149 and D-150 (a real redesign may land in place after a parity check and review); the claim table replaced by D-134's picker lanes; hero colour exception by D-130/D-131 |
| D-124 | ladder merged into D-132 (D-135); Inner Circle renamed Insider (D-128); ladder superseded by D-219's extra-referral volume discounts |
| D-129 | Oct 25 owner answer: stays off and out of launch (docs/IMPLEMENTATION-BACKLOG-oct25.md, decision log 2); the program is not built |
| D-130 | hero band superseded by D-131 |
| D-132 | plan names replaced by D-148, then D-152; Mentor held for the owner (D-135 (2)); superseded by D-219 (banded plans replace the plan family and the per-ask level cost; the code stays on main behind off flags) |
| D-134 | (4) reviewer-and-CEO sign-off amended by D-200 (2)-(4) |
| D-135 | (5) audit order amended by D-149; its D-132 sync superseded by D-219 |
| D-136 | narrowed by D-201 (step 3 sells packs only; Skippy flags stay off until SKIPPY-fix lands with proof) |
| D-141 | scope amended by D-178 and D-181 (with the user's approval an agent may pay from the user's wallet; the free allowance is agent-spendable; nothing activates before its build) |
| D-143 | narrowed by D-201 (off until SKIPPY-fix lands with live proof, then the owner decides per flag) |
| D-146 | 'D-132 only' and 'credit packs stay on sale' superseded by D-219 (banded model; old packs paused); passes stay off |
| D-148 | names superseded by D-152, then by D-219's bands |
| D-152 | plan names superseded by D-219 (Early to Mid, Mid to Senior, Senior to Executive) |
| D-166 | queue-gate exception amended by D-200 (docs-only PRs pass from any branch); (2)/(4) scoped manual packet landing by D-190 |
| D-170 | narrowed by D-193 ('live-verified' Greenhouse boards means the preview allowlist; job fetch is row D-174-job-catalog) |
| D-173 | allowances and extra-referral prices set by D-219 |
| D-174 | no-expiry rollout gated by D-193 (5) (waits for D-174-held-ask-reconfirm and ASK_RECONFIRM_ENABLED); pool visibility narrowed by D-193 |
| D-185 | (1) amended by D-197 |
| D-193 | held-ask-reconfirm dependencies amended by D-197 |
| D-196 | referrer plan prices and contents recorded by D-219 (7); paid activation blocked until the routing design is reviewed and tested; window bounded by the Oct 25 answer |

## 4. Old entries edited in place (history check)
Across 75 versions of the register on `main`, 21 rows changed after they first landed:
- **Pointer or status notes only (fine):** D-003 (amended by D-082), D-018, D-035 (rejection banner), D-075 and D-083 (amended by D-085), D-134 (the owner's quote and D-149), D-148 (names superseded by D-152).
- **The owner's own words added to the same row (acceptable, but a new entry is clearer):** D-007 (Oct 15 reconfirmation), D-049 (the owner's same-day clarification), D-079 (the owner chose PayPal-link validation), D-082 (the owner's yes to the ruleset), D-136 (the assistant renamed Reffy, then Doorway, then Skipper, then Skippy, all inside one row, each on the founder's word), D-147 (status flipped from "decision pending" to the founder's rejection (attribution unverified - no recovered owner original; register state and refund behavior unchanged)).
- **Rewritten in place without a new ID (worth knowing, nothing to revert):** D-043 (v1 growth strategy replaced by v2 the same day; the v1 referrer-bonus pitch was dropped) and D-072 (queue-order sentence updated as work shipped).
- **Removed:** D-020, D-025 and D-027 (by D-067; listed under Superseded, IDs reserved).

No owner decision was silently reversed in place. Going forward, a change to a decision's substance gets a new entry; an older row only gains a pointer in its status cell (as section 3 now does). `PROCESS-id-check` is the row that can enforce that in CI.

## 5. Rulings not made by the owner that changed an owner-reserved rule
58 cases checked: 26 implementation detail of an owner decision, 12 within the CEO remit, 6 authorized by the owner in the row, 3 ratified by the owner later, 5 no real change, and **6 that change an owner rule without his word**. Nothing was changed for these; each is in section 8:
- **D-081 narrows D-049:** seekers whose sign-in email is at a covered company get no password reset.
- **D-106 narrows D-055/D-104:** an opt-in shareable per-referrer impact card (flag off).
- **D-163 narrows D-030:** a password demo login for the fixed reviewer accounts, including a referrer account.
- **D-188 narrows D-194:** a settled-then-refunded first payment keeps the /share link.
- **D-193 (3) narrows D-174:** the company pool shows a count and one email a day, not the requests themselves.
- **D-206 narrows D-123:** "anything that could upset users" dropped from the must-ask list.

## 6. Live code that still follows a replaced rule
| Rule (old → new) | What `main` does | Owner of the fix |
|---|---|---|
| Ask expiry (D-034/D-050/D-061 → D-174) | The 7-day, 90-day and day-30 clocks still run and refund (`ask-expiry-sweep`, `server/db.ts` expiry path). Six strings hard-code 7 or 90 days. | Known runtime caveat. `D-174-expiry-clock-removal` waits for `D-174-held-ask-reconfirm` (D-193). |
| Decline keeps the credit spent (D-147) | (a) A pass made without a claim leaves the credit refundable on a later withdrawal or expiry: `passReferralRequestTx` (db.ts:2156) records no pickup (db.ts:3041, 3047), so the refund runs at db.ts:2306 → 2325. A test pins this (`server/db.referralPassReopen.test.ts:497`). (b) Claim then pass: kept spent. (c) Step back after accepting: released, per D-066 (2) and D-076 (1). | Owner question (section 8). Nothing changes and any change stays blocked from release. |
| Availability framing (D-169 → D-176) | Home and the /explore description; company page and drawer; `ForCompanies.tsx:62`, `VisualJourney.tsx:15`, `WaitingAsks.tsx:38`; `useAskComposer.tsx:527` ("This company just opened up to referrals", landed with D-132-audit); `/api/companies` still returns `openToReferrals`/`openCount`. | `D-176-public-claims`, `D-048-p3-live-review-find`, `DECISION-COPY-oct26` (new), `D-048-fix-send-ask-blocker` (note). The payload row D-193 (5) promises is not registered yet. The `slot_open` notify-me text needs a ruling. |
| Old packs on sale (D-146 → D-219) | `CREDIT_PACKS_ON_SALE = true`; "Add credits" CTAs render while it is true. Provider items archived Oct 25 (D-214). | `PRICING-banded-oct25` (#666, Tier 1), with the scope row in #718. |
| D-132 plan model (→ D-219) | Built behind off flags; D-132-audit landed it reviewed. | Flags stay off. Re-scope rows set by D-221. |
| Retired plan perks, D-035 wording, spend timing (D-146/D-219, D-147, D-034) | `SavedAlerts.tsx:31` "Momentum and Land: unlimited"; `WaitingAsks.tsx:29` "releases the credit if you pass"; `Help.tsx:16` "paid plans allow more"; `guides.ts:80` "leaves your balance when you send". | `DECISION-COPY-oct26` (new). |
| "Credit"/"ask" wording (D-173/D-180) | Widespread in pages, components, `shared/moneyCopy.ts` and server notices. | Registration PRs #704, #711, #717 and copy PRs #674, #716 are open, not on main. |
| Invite rewards for paying users (D-129, Oct 25 "stay OFF") | D-129's paid-conversion program is not built. The live /share reward is different: a friend's verified signup creates a pending credit for each side, and each unlocks on that person's own next referral request (db.ts:4023-4052, 4437). Only paying users get the link (D-194). | Not changed. The Oct 25 answer may not cover it; the exact question is pending from Instinct (section 8). |
| Compliant | Passes off; Pro/Max retired; referrer checkout refused first (D-055); no referrer payout; Free 3 in the catalog with the card switch off; Skippy naming; D-152 display names (until D-219 replaces them). | — |

## 7. Open pull requests that build or record a replaced rule
Recommendations for each PR's owner. The audit changed no PR; its only PR action is the evidence thread on #666.
| PR | Problem | Recommended action |
|---|---|---|
| #523 | D-132 rung checkout (D-132-v2-checkout) | Do not land as written (row is `architect`). |
| #542, #543, #544, #550 | D-132 per-level quote with availability ("open on skipwait.me") and expiry copy | Do not land as written (D-132-item3 is `architect`). Keep the accepted-price invariant. |
| #380, #383, #416 | Re-cut the D-036 ladder or switch on the D-132 model, with expiry and availability copy. #380 adds a second D-110 row (ID collision). | Close. |
| #319 | Second D-079 and D-080 rows (ID collisions), migration 0096 collision | Close, or renumber and re-ground. |
| #187 | Replaces the live Terms with kit prototype copy (legal text is the owner's; D-001 retired) | Close. |
| #659 | Legal draft promises the referral back after a pass, and says "referral packs add more" while packs are paused | Fix before the owner's approval (the row note now says so). |
| #557, #656 | Money-lane packets built on "D-132 only", the D-152 names and `/plans#packs` | Re-sync to D-219 before landing. |
| #572, #598 | Goal /share ignores the D-194 lock and promises a reward to both sides | Port the locked state and the owner's line; drop the reward promise until section 8 (b) is settled. |
| #576 | Goal referrer home re-creates "releases the credit if you pass" (D-035) | Drop the credit clause (D-147). |
| #563, #573, #596 | "Assistants need Land" (pass not sold); retired-plan perk note; shortfall links to paused packs | Re-state against D-219. |
| #568, #575, #632 | User-facing "ask" (D-180); #575 adds "open to requests" (D-176) | Apply D-180 and D-176 wording before review. |
| #672 | Implements D-220 but misses the "48-hour head start" notice (db.ts:2529) and the job description | Add both; it needs a queue row (#669 holds it). |
| #666 | Implements D-219; referrer and company constants | Keep them non-chargeable (D-219 (7)); scope row in #718. |
| #645, #660, #661, #677, #696 | Owner decisions recorded outside the register | Fold each into register entries with "Affects tasks" (D-202). #661's pricing is now D-219 and its first look D-220. |
| #669 | Duplicate device-sign-in and dark-mode rows; stale statuses | Merge main, drop the duplicates, point the pricing and first-look rows at D-219 and D-220. |
| #710 | Offers "restore or recreate the pack prices" | Drop that option (it would undo the D-219 pause). |
| #697, #698 | Referrer passkey exclusion keyed on an openId prefix only (D-209 (4) default: no referrer passkey) | Gate on the server's verified-referrer verdict. |
| #680 | "SkipWait.me" wordmark against D-108 | Owner confirms the casing first. |
| #608, #650, #676 | Anchor the money freeze or the level pricing on D-132/D-110, or cite a dead ID (D-157) | Re-anchor to D-219/D-196. |
| #493, #309, #354, #461 | Keep D-035 or the 48 h first look alive in docs | Close. |
| #462, #531, #325, #623, #625, #662, #670, #671, #673 | Moot, duplicated or overtaken (#623 duplicates #703; #625 is the landing slot, 790 commits behind; #662 = D-207 and #670 = D-208, both moot, IDs stay reserved) | Close (reset the landing-slot branch to main; never delete it). |
| #470, #526 | VRA reward plans the owner parked on Oct 25 (no success fee; referrers never paid) | Park, or close with a pointer. |

## 8. Questions for the owner, and evidence pending
**Pending from Instinct** (asked on PR #666, comment 6423290055). No change is made until it arrives:
- (a) **D-147 scope:** does any founder message after Oct 23 separate a pass made before accepting from a step back after accepting? Today (a) a pass without a claim refunds on a later withdrawal or expiry, (b) a pass after a claim does not, and (c) a step back after accepting refunds per D-066 (2) (Oct 18, before D-147). The D-038 5-day lapse releases the credit and D-147 keeps that.
- (b) **Invite rewards:** the exact Oct 25 question behind "Invite rewards for paying users (D-129): stay OFF". Was it the unbuilt D-129 paid-conversion program, or the live signup reward on paying users' /share links?
- (c) **First look:** confirm that no message after Oct 25 17:48 changed the 24 h window (recorded as D-220).

**Owner questions where the evidence is already complete** (from section 5; the current behaviour stays until he answers):
1. May seekers whose sign-in email is at a covered company go without a password reset (D-081)?
2. May a referrer opt in to share a card of their own numbers (D-106), given "recognition is private" (D-055)? The flag stays off.
3. Did he approve the password demo login for the fixed reviewer accounts, including a referrer account (D-163 against D-030)? May it ever be on in production?
4. If a first payment is later refunded, does the /share link stay unlocked (D-188) or lock again?
5. Should every verified employee who joins see a company's waiting requests (D-174's words), or only a count plus one email a day (D-193 (3))?
6. Should "anything that could upset users" stay on the must-ask list (D-123), now that D-203 and D-206 leave it off?
7. *(Added Oct 27, section 11.)* D-219 (7) names neither Mentor (priced by D-132, held by D-135 (2)) nor D-132's draft Organisation company tier. Should both stay unbuilt and unsold, or be retired?

## 9. Docs drift still open
Recorded for row `DECISION-SYNC-oct26`; this change does not fix them:
- **Legacy pack catalog still the target:** `docs/KIT_V4_BUILD_PLAN.md` §6 (:238, :248), `docs/plans/README.md` row 2.3 and `docs/BUGFREE_GATE.md` 4.1-4.4 still aim at the legacy pack catalog (D-219 paused it).
- **Design contracts still specify replaced rules:** `design/goal-ui/BRIEF.md`, `design/goal-ui/content.json`, `pick/` and `specs/` specify "Open to requests" chips (D-176), expiry countdowns (D-174), D-035 outcomes (D-147) and light mode only (the dark-mode direction).
- **Handoff docs give replaced rules as build instructions:** `LLM_HANDOFF.md` and `FOR_AI_BUILDERS.md` give launch companies "open to referrals", "paid unlimited" alerts, the 7-day expiry, the Kit v4 design system and "credits/asks" money wording as current.
- **Old build banner:** eight entry docs' line-5 banner says only the open models build (D-200), which is row `D-200-instructions-sync`.
- **Direct-push landing route:** `AGENTS.md`, `docs/BRIEF.md` and `docs/DELEGATION.md` give `git push origin <sha>:main` as the landing route (D-200 (1); D-212 is pending in #703).
- **Blanket fairness lines:** `docs/BRIEF.md` and `LLM_HANDOFF.md` say "never sell priority" and "referrers never charged" without the D-196/D-219 referrer-plan exception.
- **Unconditional sign-in step:** `docs/KIT_V4_BUILD_PLAN.md` §6:249 enables Email + Password unconditionally (D-080, D-163).

## 10. Checks
- `pnpm vitest run scripts/`: every script test passes, including `registerShape` and `briefContract`. The output is in the pull request.
- `validateAssignments` on `docs/plans/assignments.json`: `[]`.
- Every register row has 3 or 6 cells; IDs are unique and in order (D-219, D-220, D-221 follow D-215; no branch holds them).
- `docs/BRIEF.md` is 10,164 bytes (limit 10,240).
- `git diff --check` is clean. No file outside Markdown and `docs/plans/assignments.json` changed.

## 11. Register cells still stale after this audit (Oct 27 follow-up)
A second audit ran on `main` `eb0fd8cd` (Oct 27), after D-219 to D-221 landed. It found the register places below that still point at a replaced rule, each checked against the register text. The state claims were re-checked by command on Oct 27:
- GitHub deletes head branches on merge.
- `main-protection` requires 0 approvals.
- `shared/companyOpportunities.ts` still has `OPPORTUNITY_FIRST_LOOK_HOURS = 48`.
- There is no D-157 row and no `D-057-referrer-continuity` row.
- D-209 and D-213 to D-220 carry no "Affects tasks:".

These items are recorded for row `DECISION-SYNC-oct26`, together with section 9.

**Rules for the builder.**
- Edit only the status/sync cell, the "Supersedes · affects" cell, or the named section. Never change what an entry decides.
- Find each place by the quoted words, not by line number.
- Skip any fix the register already carries (a newer pull request may get there first), and say which ones in the pull request.
- If a fix would change what an entry decides, stop and report it blocked, naming the entry.

**Pricing (D-219 replaced the D-132/D-135 model and paused the packs).**
1. **D-034, D-047, D-076:** in each Oct 26 note, replace "one credit becomes the level cost at D-132 enable (D-135)" (or "per-level cost at D-132 enable (D-135)") with "cost is one referral of the request's level band, spent in the D-219 (4) order (D-132/D-135 superseded by D-219)". **D-063:** append " · Oct 27 audit: the free rule is now D-219 (3) (3 referrals a month at any level, with a verified card once the switch is on); the sentence is rewritten in the terminology lane (D-173, D-180, D-219)."
2. **D-084:** append " · Oct 27 audit, changed by: D-146 (passes and Keep warm are not sold as a model choice, not pending evidence) and D-219 (6) (legacy packs paused; runtime `CREDIT_PACKS_ON_SALE` stays true until PR #666). The 409 refusal and recovery paths stand." **D-046:** in its Oct 26 note replace "(D-132 plans only, packs on sale)" with "(passes off), then by D-219 (6) (legacy packs paused too)".
3. **D-146:** append " · Oct 27 audit: its 'do not ask again' answered the Oct 23 model question; the newer owner freeze D-219 leaves its (5) and (8) for the owner's word, and pricing going live always needs it (D-123), so those questions go to him batched (D-064)."
4. **D-165:** append " · Oct 27 audit, changed by: (3) superseded by D-219 (3)-(4) (the free allowance continues on top of a paid band and is spent after the plan's included referral for that level, not first); (2)'s chain (D-132-item3, D-132-v2-checkout) is re-scoped to architect by D-221." **D-185:** append "; (2) rides D-132-v2-checkout, re-scoped by D-221 against D-219 (8) (purchased-referral expiry undecided; runtime `PAID_CREDITS_NEVER_EXPIRE` stays true)". **D-186:** append " · Oct 27 audit: (4)'s D-132 enable list is moot under D-219; the D-132 v2 items created on the live site (#528) are not sold, and whether to rename or archive them is decided in the D-221 re-scope of D-132-v2-checkout." **D-197:** append "; (5) #523 is not landed as written (D-221 (2))".
5. **D-132:** append " · Oct 27 audit: its draft Organisation company tier has no counterpart in D-219 (7) (Team, Growth and Scale are employer plans, and companies never buy referrals); it stays unbuilt and unsold. Mentor stays held (D-135 (2)) and is not one of D-219 (7)'s referrer priority plans. Both are owner questions (DECISION-AUDIT-oct26 section 8, question 7)." Do not mark the Organisation tier superseded.
6. **D-201:** append " · Oct 27 audit, changed by: (4)'s step 3 (credit packs through the kit-pack arm) is overtaken by D-219 (6) (packs paused); SKIPPY-3 is architect for a D-219 re-scope (D-221 (2))." **D-136:** in its Oct 26 note replace "step 3 sells packs only" with "step 3 re-scoped against D-219 by D-221".
7. **D-173:** append to its note "; its plan names (D-152) are replaced by the D-219 bands and the D-132 amounts by D-219". **D-179, D-180, D-181:** append " · Oct 27 audit: the money freeze it cites is now D-219 (D-132/D-152 superseded)."
8. **D-055:** append "; referrer priority plan prices recorded by D-219 (7), no charge until a reviewed routing design (Oct 27 audit)". **D-119:** append " · Oct 27 audit, changed by: D-196 and D-219 (7): the opt-in extra is level-matched first access only (priority, no badge), priced but not chargeable." **D-156:** replace its status with "answered by D-196 (basic referring stays free; the plan is level-matched first access) and D-219 (7) (prices; no charge yet); Mentor stays held (D-135 (2))". **D-006, D-040:** replace "D-135 (4) (plan Reach, flagged, at D-132 enable)" with "D-135 (4)'s Reach fell with D-132 (D-219; seeker-side fairness unchanged, and the free allowance reaches every level)".
9. **D-117:** append "; (1) credit scale and (4) premium reach overtaken by D-219 (one referral per request; bands)". **D-118:** append " · Oct 27 audit: (3)'s level-times-credits planner is overtaken by D-219 (one referral per request; included, free, then purchased per D-219 (4))." **D-122:** append " · Oct 27 audit: the selection rule is not contradicted by D-219; its go-live bar is now D-219 (8) and D-123." **D-125:** append " · Oct 27 audit: gift SKUs, plan months and the x0.52 conversion rest on the superseded D-115/D-124 books; re-derive against D-219 before any build." **D-127:** append " · Oct 27 audit: the pass, trial-end and reach-up moments have no product under D-146, D-051 and D-219; re-map the moments to D-219 before paid prompts are enabled."
10. **D-059:** append "; frozen items reopened by the owner: D-005, D-039 and D-041 by D-219; D-006 and D-055 narrowed by D-196 and D-219 (7); kept items since changed: D-022's window by D-220, D-035 rejected (D-147), D-046 and the pass sales by D-084, D-146 and D-219 (6) (Oct 27 audit)".
11. **D-069:** replace its status with "sync tool built (row D-069-chargebee-catalog-sync done); its legacy catalog targets are superseded by D-146 and D-219 and archived at the provider Oct 25 (D-214 (3)); the create-only v2 items are recorded by D-165 (1) / #528". **D-065:** replace its status with "check live since eed80e5f (D-075 (3)); slices B and C done; the owner's live INR test is tracked in BUGFREE_GATE 4.x".

**Expiry, availability and the first look.**
12. **D-162:** append " · Oct 27 audit, changed by: (3)'s 90-day waiting close and day-30 closure are suspended by D-174; reconfirm before spend is built without closure by D-193 (4)."
13. **D-174:** in its Oct 26 note replace "gated by D-193 (5)" with "gated by D-193 (4)".
14. **D-176:** replace its status with "directory framing removed by #609 (D-189 (2)); remaining: D-176-public-claims (copy, todo), the post-save delivered-or-waiting line in D-174-seeker-journey-build (architect, D-189 (2)), and the row that drops openToReferrals/openCount from the public payload, promised by D-193 (5) and not yet registered".
15. **D-086:** append " · Oct 27 audit: (2)'s public per-company demand counts are unresolved against D-176 (no coverage data or availability status in the directory); the D-086-demand-list packet shows counts without revealing whether a company has a verified employee, or the question goes to the owner rated (D-221 note on that row)."
16. **D-220:** append to "Supersedes · affects": " Affects tasks: first-look-24h-oct25 (PR #672), D-177-recruiter-posts-referral-drives." Append to its status: " · Runtime caveat (Oct 27): until PR #672 lands, `shared/companyOpportunities.ts` keeps `OPPORTUNITY_FIRST_LOOK_HOURS = 48` and the poster notice says 48 hours."

**Process and roles.**
17. **"Affects tasks:" (D-202 (2)).** Append to each entry's "Supersedes · affects" cell:
    - D-209: "Affects tasks: FIX-device-signin, DEVICE-SIGNIN-passkeys."
    - D-213, D-214 and D-216: "Affects tasks: LAUNCH-live-qa."
    - D-215: "Affects tasks: D-048-p3-seeker-small."
    - D-217: "Affects tasks: D-048-F-credits, D-048-p3-referrer-home."
18. **D-200 and D-203:** append to each sync cell " · Oct 27 audit: 'D-157' here is #520's number for what landed as D-202." **D-200:** also append " · main-protection requires 0 approvals (verified Oct 27), so (1)'s wait for the owner's merge has ended; landing follows (4) on green required CI." (D-200 (7)'s instruction sync stays open: section 9, row `D-200-instructions-sync`.)
19. **D-197:** append "; (2) 'Only Claude Code changes rows' is also superseded by D-200 (2)". **D-199:** append " · Oct 27 audit, changed by: D-200 (2): any session registers the row, and a docs-only registry PR passes from any branch; the existing-branch and no-bypass rules stand."
20. **D-205:** replace "owner action open (GitHub auto-delete setting)" with "GitHub auto-delete is on (verified Oct 27)".
21. **D-213:** append " · Oct 27 audit, changed by: (3) superseded by D-214 (1)-(2) (alias QA route, no owner code forward); (5)'s catalog label corrected by D-214 (3); the row status is now set by D-216." **D-214:** append " · Oct 27 audit, changed by: D-216 (row back to owner until the #709 proof)."
22. **D-216:** append " · Oct 27 audit: the PR #710 comment quoted as the owner's confirmation is in an agent's voice from the shared account (D-166 (5)(a)), so it is not verified owner wording; the ruling rests on D-200 (2) and AGENTS rule 8."
23. **D-123:** append " · Oct 27 audit: D-203 (5) and D-206 (3) restate this list without 'anything that could upset users'; until the owner answers (DECISION-AUDIT-oct26 section 8, question 6), D-123's full list binds."
24. **D-075 (4), D-060, D-043 (4):** append to each " · Oct 27 audit: the D-035 step or send-again item is void (D-035 rejected by D-147; Send again not approved, D-163 (3))."
25. **D-172:** append " · Oct 27 audit, changed by: D-209 (SimpleWebAuthn approved Oct 25; row DEVICE-SIGNIN-passkeys waits on the owner's D-209 (4) answers)."
26. **D-057:** append " · Oct 27 audit: row D-057-referrer-continuity is not in docs/plans/assignments.json, so the picker cannot hand it out; it is registered after D-057-session-gate (Tier 1)."
27. **D-171:** append " · Oct 27 audit: no queue row; D-174-seeker-journey-build (architect) takes it or a row is added." **D-177, D-178:** append " · Oct 27 audit: packet first (D-189 (2)); row architect."

**Sections after the table.**
28. **Standing constraints line:** replace "Kit v4 visual contract in `DESIGN.md`" with "the goal-UI visual contract in `DESIGN.md` (D-048, D-120; Kit v4 retired)".
29. **Superseded list.**
    - In the pass-sales chain line (it starts "- D-014 → D-037 → D-046"), append " → D-219 (6) (legacy credit packs paused too; provider items archived Oct 25, D-214 (3))."
    - In the 'Credits' line, replace "(wording only - the amounts and rules in D-034, D-036, D-039 and D-063 are unchanged)" with "(wording only; D-173 changed no amount, and the D-036 ladder and the D-039 count were later replaced or amended by D-219)".
    - After D-030's seeker email-code line, append " The code stays live until seeker-passwords ships after the D-057 session gate (D-078 (1), D-080 (b), D-163 (1))."
    - Add these lines, leaving out any the list already has:
      - "D-198 → withdrawn by D-200 (1)."
      - "The Claude-only steps in D-083 (row order), D-085 (6) and D-109 (d) (never a build, CEO-only unblocks and order), D-109 (c)'s routing of packet rulings to the CEO, D-197 (2), D-199 (1)-(2) and D-203 (3) (never develops) → D-200 (2)-(3); the CEO role in D-085 (6) and D-203 (2) stands."
      - "D-166's CEO docs-only branch exception → D-200 (2)."
      - "D-154 (1) → D-162."
      - "D-102's 'Open: N' and 'Not open yet' lines → D-176, D-193 (6)."
      - "D-113, D-114 → D-115 → D-132 → D-219."
      - "D-128's names → D-148 → D-152 → D-219."
      - "D-130's hero band → D-131."
      - "D-110's per-ask credit cost, D-117 (1) and D-118 → D-219."
      - "D-156's open shape → D-196, D-219 (7)."
      - "D-162 (3)'s 90-day waiting path → D-174, D-193 (4)."
      - "D-213 (3) and (5) → D-214."
      - "D-129's program → off and out of launch (Oct 25 owner answer, D-221)."
30. **Open owner questions.**
    - Keep each paragraph and append an "Answered by ..." marker:
      - level pricing → D-173, D-219;
      - goal-alignment items → D-034, D-040, D-054, D-059;
      - monetization rethink → D-044 to D-046, D-051, D-055, D-056, D-219;
      - earlier questions → D-059 (translation: D-093).
    - Then add a short "Open now" list:
      - the D-219 (5) and (8) items;
      - this audit's section 8 (questions 1 to 7);
      - D-193 (8);
      - D-166 (5) (b)-(e) ((a) is overtaken by D-200 (1));
      - D-182 (3);
      - D-089 (2);
      - the D-098 vouch control;
      - D-086 (2) against D-176.
31. **Reconciliation, 2026-10-24.** Make three replacements and one addition:
    - Replace "under the D-132/D-152 freeze" with "under the D-219 freeze (D-132/D-152 superseded Oct 25)".
    - Replace "D-132/D-152 amounts and names stay frozen" with "amounts and names now D-219 (Oct 25)".
    - Replace "level-based pricing research (D-056 freeze stands)" with "the D-219 (5)/(8) open pricing items (see Open owner questions)".
    - After its D-168 citation, add "(D-168 is on open PR #592, not on main)".
32. **Founder D-035 rejection attestation section:** move the two Oct 24 owner notes (the product compass and the LinkedIn-scale vision) under a new heading "## Owner compass notes, Oct 24, 2026", placed before the Reconciliation section. Change nothing else.
33. **Scoped founder manual-claim exception:** append "**Moot (Oct 27 audit):** the claim lapsed under the 2-hour rule, and D-200 (2) lets any session take PICKER-review-independence." Leave the `CLAUDE.md` and `AGENTS.md` footers alone. In the Oct 23 merge-policy amendment, replace "D-035 founder hold" with "D-035 rejection (D-147)".
34. **D-144 (proposed section):** add under its heading: "Status (Oct 27 audit): still unregistered. Its cost rule follows D-219 (one referral of the request's level band, spend source shown before sending; the D-132 per-level credit math is superseded), as SKIPPY-fix S-2/S-3 require. The D-114, D-076 and D-022 citations are checked by the next Skippy packet writer (D-142 is the referrer-privacy rule)."

**Left out on purpose.** Some rows have only three cells: D-024, D-101, D-102, D-105 to D-107, D-136 to D-143 and D-146 to D-148. The register-shape test accepts three-cell rows (section 10), so changing that is a test change, not this Markdown row's.

**Checks for this section.** Run the section 10 checks. Then `grep -c 'Oct 27 audit' docs/DECISIONS.md` must be at least the number of items applied, and no entry's decision text may differ from `main` (`git diff` shows changes only in status, "Supersedes · affects" and the named sections).
