# Monetization rethink — proposals awaiting the owner (Oct 16 2026)

**Status: PROPOSALS, not decisions.** The owner asked on Oct 16 to "rethink and push to main the 10/10 monetizable for us, 100x value for users decisions". Each proposal below becomes binding only when the owner approves it. It is then recorded in `docs/DECISIONS.md` as the next free D-number (D-044 is taken by the #293 ruling). Until then agents must not build from this file (D-010). Read with D-034–D-043 and `docs/GROWTH_STRATEGY.md`.

**Update Oct 18 2026:** the owner has since answered most proposals through D-044–D-069. Each answered proposal is marked below with its D-number; where a proposal and its decision differ, the register wins. Unmarked parts stay proposals.

**How it was made:**
- Six lenses proposed decisions: outcome-aligned pricing, packaging, coaching, other revenue sources, timing and trust, and a contrarian lens.
- Three independent skeptics scored every proposal: evidence; user value, trust and legality; revenue against effort.
- A final synthesis gave keep, change or retire for every existing money decision.
- 10 agents in total, read-only against `main` d83e351c.

## The honest answer first
**Nothing qualifies as 10/10.** The highest honest rating is **8**, and only for cheap, near-certain hygiene. The core revenue rule is a **7**. Five reasons:
1. Every revenue figure depends on acceptance, decline and attach rates nobody has measured. About 14 asks have ever been sent, and the D-018 panel has no reading yet.
2. Revenue is about ₹0 under *every* design until outside referrers exist: 0 outside companies are open, INR checkout fails at Razorpay review (cleared Oct 16, BUGFREE 4.14), and there are 0 subscribers. The real money lever is the supply sprint (`GROWTH_STRATEGY.md` move 1). No pricing rule can do that job.
3. Whether a per-ask fee counts as an employment-agency fee under NY GBL §171(2)(c) or Cal. Civ. Code §1812.501 is unresolved. Settling it needs counsel, which is a money-spending call for the owner (D-031).
4. The approved credit rule (D-034/D-035/D-038) adds return paths to a ledger that had refund P0s this week.
5. P-2's #293 question is resolved: the owner ruled Oct 16 2026 (D-044) that the register numbers win — Free 3/mo with no welcome credits, Keep warm 4/mo, Momentum 36/30d. The rest of P-2 stays a proposal.

**"100x for users":** the evidence supports "never pay for silence, always get a reason, and pay about ₹55–95 per referred ask instead of ₹1,299–2,499 elsewhere". That is roughly 2–20x on cost and trust. The 100x comes only when seekers can actually be referred at the companies they want, which is supply.

**Evidence corrections from this round:**
- Ashby's "40% of referred candidates reach interview vs 3% inbound" **is verified**: Ashby Talent Trends, "Referrals", 16 May 2025, checked directly on Oct 16. One skeptic could not find it.
- Lee & Niederle's "roses" were free, so the study supports scarce sends, not priced capacity.
- Wiles, Munyikwa & Horton (2025) found about +8% hires from writing help, with no wage effect reported.

## Ranked proposals

| # | Proposal | Action | Rating | Switches on |
|---|---|---|---|---|
| P-1 | Checkout opens one payment leg at a time, only once proven | change D-036/D-037 rollout — **answered: D-046, D-065, D-069** | 8 | Now: Razorpay review cleared Oct 16 (BUGFREE 4.14), so INR opens after one owner-run ₹99 round trip; USD $5 pack after one owner round trip |
| P-2 | The catalog equals the register; advertise only what code grants; resolve #293 | change — **answered in part: D-044, D-046, D-051, D-067** | 8 | #293 resolved by D-044 (register numbers win; restore landed Oct 17); "on sale until the gate" approved as D-045 (Oct 17), then superseded by D-046; remaining items await approval |
| P-3 | Keep the outcome-aligned credit rule (D-034 + D-038 + D-035) as the only charge event; one outcome per ask | keep + refine — **answered: kept (D-059), refined by D-047, D-050, D-052, D-061, D-066** | 7 | D-034 done (`66801d2b` + `29ba528e`); build D-038, then D-035 |
| P-4 | Paywall only where a credit buys a deliverable ask: free waiting list, release at coverage, four honest paid moments | change (implements D-034) — **answered in part: D-047, D-060, D-061, D-062** | 7 | With the D-034 build |
| P-5 | Money-truth rule: every money sentence is generated from the catalog or ledger; banned phrases | change (makes D-043 move 3 binding) — **answered in part: D-063** | 8 | Now |
| P-6 | What SkipWait will never charge for; referrers stay unpaid | new (answers an open question) — **answered in part: D-055, D-059** | 8 | Now |
| P-7 | Free referral-ready check before a credit moves; no gate requires a paid tool; no paid badge | new | 7 | Objective check now; AI review after P-9 caps |
| P-8 | Enforce the published 2-asks-per-company cap at ask creation | keep D-006 (drift fix) — **answered: D-053** | 8 | Now |
| P-9 | AI guard: list only built tools, cap every AI route, keep resumes off training tiers | new | 7 | (1)(2) now; (3) needs an owner D-031 ruling |
| P-10 | Freeze prices until enough real data exists, not until a date passes | new (answers an open question) — **answered: D-056** | 7 | Now |
| P-11 | Reverse trial hidden now; on only with passes, as an A/B; clock starts when a referrer can first see an ask | new (answers an open question) — **answered: D-051** | 5 | With passes at the D-037 gate |
| P-12 | Featured listings only where referrals get answered; inbound only | change D-040 timing | 5 | After a company meets the gate |

### P-1 — Checkout opens one payment leg at a time, only once proven (8/10)
**Answered (Oct 17–18):** D-046 puts every payment option on sale with no supply gate (D-059: once D-063, D-067 and D-051 land); D-065 has the owner run one live ₹99 UPI buy-and-refund (agents never pay; a USD test needs a buyer outside India); D-069 brings every Chargebee item price in line with the catalog through an admin sync the owner applies. The register wins where the rule below differs.
- **Rule:**
  1. One server check (`checkoutLiveFor(currency)`) gates every buy surface, and a test proves no surface bypasses it.
  2. **Update Oct 17:** the Razorpay review cleared on Oct 16 (BUGFREE 4.14), so INR no longer needs to be switched off. It opens, like USD, after the owner's one live round trip on the smallest item. Until then INR screens say "India checkout opens soon. Email me when it does" (opt-in, logged, no counts).
  3. A currency opens only after the owner completes one real round trip on the smallest item: credits land, and the webhook and reconcile run. Agents never pay.
  4. USD opens with the $5-for-5 pack; the $1 single credit never reopens.
  5. INR shows one-time UPI first.
  6. No UPI AutoPay, e-mandates or PayPal reference transactions until passes switch on.
  7. The owner flips INR the day the review clears.
- **For users:** no checkout that can only fail. In India's scam-primed job market, a failed payment reads as a confirmed scam.
- **For us:** the only path to first revenue within 90 days. It gives up ₹0, because INR fails anyway.
- **Strongest counter:** hiding INR loses any sale that would succeed if Razorpay approves overnight, and the owner's round trip spends real money on fees (D-031 tension).
- **Becomes a 10 when:** both legs carry real payments for 30 days with 0 failed or stuck payments and 0 reconcile mismatches.

### P-2 — The catalog equals the register; resolve #293 (8/10)
**Update Oct 16 2026: the owner ruled on the #293 conflict — the register numbers win. Recorded as D-044 (Free 3/mo with no welcome credits, Keep warm 4/mo, Momentum 36/30d; the restore is a code change in progress). The remaining items below (checkout gating until the D-037 gate, per-currency retirement of the single credit, hiding the trial and unbuilt tools from the public catalog, the register-pinning contract test) stay proposals awaiting approval.**
**Answered further (Oct 17–18):** checkout gating was adopted as D-045, then replaced by D-046 (every option on sale with no supply gate, once D-063, D-067 and D-051 land — D-059); the ₹99/$1 single credit retires per currency once its packs are buyable (D-036, D-046); the trial comes off the public catalog (D-051); the legacy monthly plans are removed entirely, with no dry run (D-067). Still proposals: hiding unbuilt tools (P-9) and the register-pinning contract test.
- **Rule (a recommendation; the owner's ruling decides):**
  - The kit governs layout and the register governs numbers. D-001 already exempts founder edits after Oct 9, and D-005 replaced the kit's prices.
  - So: Free 3 credits a month with no welcome credits; Keep warm 4 a month; Momentum 36 per 30 days.
  - If the owner wants welcome credits, record that and wire `grantWelcomeCredits` in the same change. **Advertising credits nothing grants is not allowed either way.**
  - Checkout gating until the D-037 gate: answered — D-046 puts every pass, Keep warm and the packs on sale with no gate, and D-067 removes the legacy monthly plans.
  - The ₹99/$1 single credit retires per currency only once that currency's pack price is live.
  - The public catalog hides welcome credits, the trial and unbuilt tools (code kept).
  - A contract test pins catalog numbers to the register.
- **For users:** no promised gift that never arrives, no paid plan worse than Free, no "Recommended" tier that is the worse deal, no Land pass selling an undeliverable human review.
- **Strongest counter:** the owner merged #293 himself after D-041, so "kit as-is" may be his newest intent. Welcome credits cost almost nothing at cold start.

### P-3 — Keep the outcome-aligned credit rule; one outcome per ask (7/10)
**Answered (Oct 17–18):** the rule stands — D-034, D-035 and D-038 are kept (D-059) and built in the D-053 order, refined by D-047 (no credit: the ask is held), D-050 (personal-link asks count as unclaimed), D-052 (the pass-reason list), D-061 (waiting asks and the 7-day clock) and D-066 (a "Send again" replaces the reopened original, never two copies). The register wins where the rule below differs.
- **Rule:** an ask's 1 credit leaves the balance when the ask first becomes visible to an available verified referrer (D-034).
  - **Kept** if the referrer marks it "Referred" (D-038) or declines with a fixable reason (D-035).
  - **Returned** for: no decision, a not-fixable decline, a lapsed claim, or an acceptance not marked Referred within 5 (+3) days.
  - An ask never costs more than 1 credit, however often it reopens (D-021).
  - A D-035 "Send again" is a new ask under the same return rules.
  - Each ask's outcome is one keyed ledger row, written once inside the request-lock transaction. A returned credit is never taken again, so a late "Referred" tap is free.
  - Copy calls the unit "a reviewed ask" and never prices the referral or the job.
- **For users:** they pay for a referral or an actionable reason, never for silence. A delivered referral costs about 1.2–2.1 credits (₹55–95), against ₹1,299–2,499 at FindMyReferral.
- **For us:** per 100 covered asks at 10/25/50% acceptance it keeps 19/35/55 credits, against 30/50/70 under the live #249 rule. That is 21–37% fewer credits. It needs a 27–58% lift in paid volume to break even, and nobody has measured that.
- **Strongest counter (shown explicitly under D-032):** #249 is built, audited and earns more per ask. A guarantee that pays out most of the time signals "this rarely works" (Moorthy & Srinivasan 1995). The cleaner alternative is RefOpen's "a referral or your credit back", which conflicts with the owner's D-012 amendment and D-035.
- **Becomes a 10 when:** data shows the paid-volume lift, with 0 ledger mismatches over the first 100 outcomes and fixable declines under half of all declines.

### P-4 — The paywall only where a credit buys a deliverable ask (7/10)
**Answered in part (Oct 17–18):** D-061 (an uncovered ask waits up to 90 days at no cost, the seeker is emailed on day 30 to confirm, it uses no open slot until a referrer can see it, and a seeker who sent it more than 30 days earlier reconfirms before its credit is spent), D-047 (the credit is spent at first visibility; with no credit the ask is held), D-062 (a new referrer receives waiting asks oldest first, up to their monthly capacity) and D-060 (pending actions are emailed). The rest of P-4 stays a proposal.
- **Rule:**
  1. An ask to a company with no available referrer is saved free on a waiting list. It does not use a live slot, is capped at 10 per seeker and 2 per company, and must pass P-7.
  2. Its cost is stated once at save. A check-in runs every 30 days, and the ask closes free at 90 days. This answers D-043's "wait past 7 days?".
  3. When a referrer appears, waiting asks are released oldest first within that referrer's capacity. A release spends 1 credit automatically only if the seeker kept "send automatically" and saved or reconfirmed the ask within 14 days. Otherwise the seeker gets a one-tap "Send now for 1 credit?". Each release is one keyed, idempotent ledger transaction.
  4. Only four moments may offer payment, each after the free fix: 0 credits on a covered ask (renewal date first, then the smallest pack); the live-slot cap (close a stale ask first); a fixable decline (free checklist first, then "Send again"); and once after a confirmed referral.
  5. Never shown after sign-up, the first ask, an expiry, a not-fixable decline or on referrer surfaces. No countdowns, scarcity claims or confirmshaming.
- **Why:** today a 0-credit seeker cannot even save a free waiting ask (`ReferralRequest.tsx:276`, `server/db.ts:1632`), and waiting asks fill Free's 3 slots (`planGates.ts:17`).
- **Strongest counter:** free waiting asks invite spray. A new referrer's first inbox could be a pile of stale asks, and a delayed automatic spend can feel like a surprise charge.

### P-5 — Money-truth rule (8/10)
**Answered in part (Oct 18):** D-063 — one truthful money sentence everywhere: "3 asks free every month; more use credits. Referrers are never paid and never ask you for money."; refund and credit-back lines must match the code; legal text goes to the owner separately. The rest of P-5 stays a proposal.
- **Rule:** every per-ask money sentence renders from the ledger outcome, never a fixed string.
- **Fix now:**
  - the always-"returned" withdrawn line (`shared/referral.ts:55`);
  - the referrer decline card (`CandidatePreviewCard.tsx:72`);
  - every legacy-plan line (answered: D-067 removes them entirely);
  - the FAQ, Refund Policy and Terms lines that contradict the code;
  - the $199 employer card (not on sale);
  - "Partner tip", which becomes "Partner offer · SkipWait may earn a fee".
- **Banned everywhere:** "pay per referral", "pay only when referred", "guaranteed referral", "buy a referral" and any job promise. A copy-lint test enforces it.
- **Credit sentence:** one owner-approved sentence, versioned per slice. After D-034/D-038/D-035 ship: *"Sending an ask uses 1 credit once a verified employee can see it. It comes back automatically if nobody refers you, unless they tell you something you can fix."*
- **Strongest counter:** "pay only when referred" converts better, and RefOpen sells exactly that.

### P-6 — What SkipWait will never charge for; referrers stay unpaid (8/10)
**Answered in part (Oct 18):** D-055 — referrers stay unpaid by SkipWait (recognition only); D-059 — no referrer tips, and no counsel spend for Concierge, which stays by application. The rest of P-6 stays a proposal.
- **Never:**
  - pay referrers or move money between seekers and referrers;
  - take a hire-contingent fee (a percentage of salary, post-hire or pay-what-you-want);
  - use escrow or card/UPI holds (Razorpay auto-refunds uncaptured payments after 5 days anyway);
  - sell employer products to third-party recruiters or staffing agencies;
  - sell or show seeker demand data;
  - run CPC/CPM ads;
  - work with partners who promise jobs;
  - sell a paid badge visible to referrers.
- **Employer accounts:** approved only after a company-domain work-email OTP (an attribute check, not a login change; D-030 holds).
- **Concierge:** closed to NY/CA residents until counsel.
- **Status:** reopenable with evidence (D-032); no code is deleted (D-042).
- **Strongest counter:** a success fee is the only design whose revenue grows with hires, and a funded rival (Refer) uses it.

### P-7 — Free referral-ready check before a credit moves (7/10)
- **Rule:** an ask spends a credit only after objective fields pass: a resolved job link, a resume, and profile essentials (name, current role or level, location). Otherwise it stays a draft with a list of what is missing.
- **Free for everyone, within caps:** deterministic checks; one AI "what a referrer may flag" review per ask; a fix guide after a fixable decline.
- **Guardrails:** no gate ever requires a paid tool. AI never adds facts the seeker did not supply. No paid certification. `profile_check` moves from 1 credit to free.
- **Evidence:** writing help raised hires about 8% across about 480k jobseekers (Wiles, Munyikwa & Horton, *Management Science* 2025).
- **Strongest counter:** giving coaching away undercuts paid rewrites, and blocking costs ask volume.

### P-8 — Enforce the 2-asks-per-company cap (8/10)
**Answered (Oct 18):** D-053 queues the D-006 per-company cap among the trust and truth fixes; D-006 is frozen (D-059).
- **Rule:** refuse a third open ask (waiting or live) per seeker per company inside the ask transaction, with the existing 409 `company_cap_reached`. Tests come first: concurrency, replay, freed slots, ledger audit.
- **Why:** it is published as enforced but has no server use (`shared/planCatalog.ts:178-179`). The live catalog advertises it.
- **Strongest counter:** nobody hits it today, and it touches the money path.

### P-9 — AI guard (7/10)
- **Rule:**
  1. Each credit tool gets an `available` flag, and the catalog, screens and Terms list a tool only once it is built.
  2. Per-account caps on every AI route, plus a global daily spend ceiling that falls back to the deterministic text. Keys go in `.env.example`.
  3. Resumes go only to a provider tier that bars training on, and human review of, inputs. Otherwise the fallback is used. **Owner ruling needed under D-031** on about $0.001–0.005 per call.
  4. A live tool is charged only on delivery, with one free retry.
- **Why:** 11 unbuilt tools are advertised, and `ai.*` and `/api/smart-pitch` have no per-user limits in app code.

### P-10 — Freeze prices until there is data (7/10)
**Answered (Oct 18):** D-056 — no price, plan-content or new credit-rule changes until two full weeks of baseline data exist (D-018 panel + D-054 analytics), counted from the day analytics goes live; selling the approved catalog (D-046), truth fixes and building the approved money rules are not frozen. The register wins where the rule below differs.
- **Rule:** no price, pack or plan-content change (other than P-2's alignment) until all three hold:
  - 100 asks have been visible to an available referrer;
  - 30 paid purchases have completed;
  - the D-018 panel has 2 weeks of readings after the first outside company opened.
- **Meanwhile:** log out-of-credit refusals, notify-me clicks, pack views and abandoned checkouts.
- **First experiment after the freeze:** a mid INR pack (e.g. ₹449 for 10), because ₹99 for 2 then ₹1,199 for 25 is a 12× jump for a 3% discount.

### P-11 — Reverse trial (5/10)
**Answered (Oct 18):** D-051 — off the public catalog now, because nothing grants it; it switches back on together with its trigger, recommended: the seeker's first ask that reaches an available verified referrer. The register wins where the rule below differs.
- **Rule:** hidden from the catalog now (nothing grants it). It switches on only with passes, as a 50/50 A/B.
- **Clock:** starts the first time a seeker's ask becomes visible to an available referrer; once per person; no card.
- **At the end:** back to Free with no charge, and live asks are never cut off. Switched off if the trial arm earns less per seeker at 30 and 90 days.

### P-12 — Featured listings only where referrals get answered (5/10)
- **Gate:** off per company until it has 2 or more available verified referrers (not counting the employer-account holder), at least 1 decided ask in the last 30 days, and a public careers or ATS link for the role.
- **Terms:**
  - Chargebee only, sold to domain-verified direct employers.
  - Flat price per role per 30 days with no auto-renew. The placeholder ₹1,499 / $49 is subject to P-10.
  - A minimum-views promise with a pro-rata credit if missed.
  - The employer sees only its own views and clicks.
  - Inbound only, with no outreach to corridor companies (D-028).

## Keep as they are
D-004, D-015, D-018, D-021, D-030, D-031, D-036 (prices kept under the D-056 freeze), D-037 (since retired; its timing replaced by D-046), D-039, D-040 (with P-12), D-041 (confirmed by D-044), D-042, D-043, and the still-valid parts of D-005: India at 0.4–0.6× the USD price, opt-in auto-extend, nothing under $2.99 in USD.

## Rejected, with the reason
- **Keep #249 permanently, or charge at send with no return:** it earns most when the product fails, which is the Upwork Connects / Thumbtack pattern.
- **Keep the credit only on "Referred" or at acceptance:** removes the only cost of a low-effort ask, and its framing sits closest to "paying for a referral". It is still shown above as the alternative.
- **Keep the credit only on silence (LinkedIn style):** silence here is mostly missing supply.
- **Success fees, salary percentages, post-hire, pay-what-you-want, tips, escrow, holds:** they break D-006/D-015 and fall under NY GBL §185 and Cal. Civ. Code §1812.517. "Pay after you got the job" is the Indian scam signature.
- **A seeker "I was not referred" clawback:** cannot be verified.
- **Selling an extra open ask now:** pay-per-attempt under another name.
- **A uniform 10-ask cap:** reverses D-039 with no data.
- **Re-cutting INR packs now:** it falls inside the price freeze.
- **Paid "Improve my note", resume rewrite or interview pack now:** low willingness to pay, a free competitor, hallucination risk, and no volume.
- **A free employer on-ramp:** D-028, plus the risk of an HR policy memo.
- **Affiliate offers at the decline moment:** a conflict of interest at the moment of rejection.
- **Pay-on-accept talent intros:** "joining fee" scam risk.
- **Gift packs or institution codes now:** a new payment surface while INR cannot take a payment.
- **Hiding the buy button by coverage:** P0 risk on the checkout path.
- **Advertising "7 days or your credit back" now:** D-043's bar is not met.
- **A paid "referral-ready" badge:** a bought ranking signal (D-006).
- **Free forever with revenue elsewhere:** there is no "elsewhere" yet.
- **An unlimited-asks pass:** destroys scarcity.

## Revenue model (assumptions, not forecasts)
- **Today:** about ₹0 under every design.
- **Per 100 covered asks under P-3:**
  - If every kept credit is paid: ₹855 / ₹1,575 / ₹2,475 at 10/25/50% acceptance (₹45 blended pack price).
  - Realistically ₹0–1,500, because Free's 3 credits a month cover most seekers.
  - Scale check: ₹1 lakh a month at 25% acceptance needs about 6,300 fully paid covered asks a month.
- **After the D-037 gate, per 100 active seekers a month:** about ₹3,300 (India) or about $87 (global), assuming 5% buy the first pack, 1% the 25-pack, 2% Start and 1% Momentum.
- **Featured listings after their gate:** 10 companies × 2 roles × ₹1,499 ≈ ₹30k a month (arithmetic only).
- **Revenue drivers, in order:** covered asks (supply) → acceptance rate → whether seekers exceed Free's 3 credits → the fixable/not-fixable decline split → price per credit (the lever after the freeze).
