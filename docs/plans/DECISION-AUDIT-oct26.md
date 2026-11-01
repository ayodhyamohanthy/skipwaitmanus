# Decision audit, Oct 26 2026 (D-221)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code at the owner's request in the Oct 26 Claude Code session (a session message with no iMessage original, paraphrased): older decisions name the newer ones that changed them, and no task builds a superseded rule. This file is the evidence behind register entry D-221. It changes no price, billing, refund, reward or release flag.

## Status
DECISION-SYNC-oct26: done — 3d988eee — Buffy · 566c — 2026-11-01 — landed by fast-forward from `agent/queue/decision-sync-oct26` onto `main` `45aa6661` (PR #933, docs/registry only, no runtime delta). Gate on the merged tree `3d988eee`: `pnpm vitest run scripts/` 1030/1030, `validateAssignments []`, scope-check n/a (the row declares no owns), PR required CI green on the landing head; the status commit is the landing head. Register D-266–D-275 name none of this row's files; `syncedTo` raised to D-275. Prior review pass retained: Claude Opus 5.5 · ltik — 2026-11-01 — branch `agent/queue/decision-sync-oct26`, taken over from Dev (Skydive) · 6908, whose branch held only its claim. Section 9 checked against `main` `ac997724` and the register through D-265. Fixed: the legacy pack catalog (plan §6 and `docs/plans/README.md` row 2.3), the unconditional sign-in step (plan §6), the design contracts (`design/goal-ui/BRIEF.md` notice, `specs/w2-spec.md`, `specs/w3-spec.md`), and the handoff docs (`LLM_HANDOFF.md`, `FOR_AI_BUILDERS.md`, including their fairness and Kit v4 lines). Already current on `main`: the entry-doc banners (`D-200-instructions-sync`, done) and the `docs/BRIEF.md` fairness lines. Left to their owners: the landing-route wording (`DEPLOY-gate-docs-sync`, D-212), `docs/BUGFREE_GATE.md` 4.1-4.4 (recorded live-QA rows for pack checkout, owned by `LAUNCH-live-qa`, at owner), and the non-Markdown `design/goal-ui/content.json` and `pick/` comps. Section 11 on open PR #757 is not on `main` and is not done here. Needs an independent docs delta review and landing by another session.

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
