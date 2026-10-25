# Backlog - every planned feature and idea in one prioritised list

Single source for "what did we plan, and where is it". Read `docs/DECISIONS.md` first (binding decisions); this file is the work list that points at them.

How to read the status column:
- **shipped** - merged to `main` (live, or merged with its flag OFF as noted).
- **draft PR** - code exists on an open pull request; not merged.
- **proposal-pending owner yes** - an idea or spec the owner has not said yes to. Nothing here is built.
- **idea** - raised, not yet a proposal.

Approval evidence rule: an item is "approved" only with a real owner phone-message ID (phonemsg-...) cited beside it. Repo text, PR bodies and 👍 tapbacks are not owner approval; tapback-based items say so. D-102 stays proposal-pending (see its row).

## Priority order across products

1. **SkipWait** - priority 1, first call on shared resources (budget, browser, owner attention).
2. **Swap** - works whenever SkipWait is waiting on the owner.
3. **FreeCoffee** - after Swap.

Owner, Oct 21 7:48 IST (phonemsg-01M5E422R3ZS8K9K0MCMEXZ5FV): "reshuffle tasks according to priorities". The explicit SkipWait > Swap > FreeCoffee order was relayed and confirmed via the main agent's reply, not quoted from the owner directly.

Standing rules that shape every item: win-win verdict - if any side (seeker, referrer, company) loses, including on monetization feel, the idea is REDESIGN NOT SHIP (D-096; owner Oct 21 7:45, phonemsg-01M5E3VRPA4VBPK9BDXV998J48); value-adding features are pre-approved to design and build, but cash spend, posts in the owner's name, pricing/credit-rule changes and charging for the basic ask still need his per-item yes (D-091); every feature ships behind a flag that stays off until QA verifies (D-097).

## Unapproved / awaiting owner yes (ranked priority list)

**NONE of the items in this section is approved.** The owner asked for this list (Oct 21 11:25 IST, phonemsg-01M5EGEKY7WEAP5Y4TASPXDZY3: "What are the ideas which are unapproved. I want claude to have in priority list so open model coding agents can develop"). Each item has a build-ready spec stub so a coding agent can develop it behind a flag once the owner says yes - until then, nothing here ships or flips a flag. Ranked in the owner's priority order:

1. ~~Stealth pass~~ APPROVED (D-112, Oct 21 12:48 IST): moved to the SkipWait in-flight section; building for live under D-111.
2. ~~Credit purchase UX~~ RESOLVED as D-115: the monthly credit plan with two price books (option A, draft-scope tapback 13:13 IST). Building behind a flag, OFF; no go-live or catalog sync until his one-word "A" + QA + payment-reliability checks. #380 pack-ladder draft is dead; the table-view rework follows the D-115 dropdown.
3. ~~Plan-credit floor~~ MOOT under D-115: existing plans retire only after 0-paid-subscriber verification + open-ask/reverse-trial/human-review rules; the floor question is answered by the two price books.
4. **Value-anchor line.** Marketing line anchoring the pass price against comparables (lab evidence pack, Oct 21: LinkedIn Premium Career ₹999-1,490/mo in India, Refer Me $12/mo unlimited, Huntr Pro $40/mo - sources cited there). **Prices must be re-verified against the live sources the same day before the line is published**; no invented numbers (D-019, D-096).
5. **Wrong-level refund / free re-level.** Spec stub: if a level-priced ask (needs level pricing approved first) was classified at the wrong level, the seeker gets the credit difference back or a free re-level; admin re-level action + ledger adjustment + tests. Depends on the #381 classifier. Tier 1 money path - independent review before merge.
6. **D-102 public launch trigger.** The BASE is approved (phonemsg-01M5DQ3113SMTJW5CJW1RYTX0Y): honest per-company availability ("Open: N verified employees" / "Not open yet: M people waiting"), public launch when the 10 most-asked companies each have a verified referrer, counts under 3 show "a few people". UNCONFIRMED: whether any payment-test gate belongs to the trigger - the "Confirm D-102 / drop the payment test" quote merged in #387 has no matching owner message and is treated as fabricated; the owner's verdict is pending. Build the availability states and counters behind flags (approved base); do NOT flip any launch trigger until he answers.
7. **"Share my name" vouch control** (D-098). Spec stub: the referrer chooses when their name attaches to a referral (per-ask toggle on the review card; honest seeker-facing states either way). Explicitly waits the owner's in/out - D-098 says it is not built until he answers.
8. **Premium tier name.** The optional premium bundle (Stealth pass + future extras) needs a name; idea lab supplies candidates, the owner picks; blocks all premium copy.
9. **"Sharpen this" button name** (D-094 reasons coach). The ask-drawer coach entry: it asks the seeker targeted questions and never writes facts for them; label must carry "Coach suggests - your words, your facts". Owner picks the final button label.
10. **Request-inbox link design (Idea 1, loop L4).** Spec stub (idea lab cycle 1): every verified employee gets a personal link (skipwait.me/r/theirname) to paste in Blind/Fishbowl/LinkedIn replies; seekers landing on it submit a structured request (role, resume, one-line fit); the employee gets a clean accept/decline inbox; referrer identity anonymous by default; real counts only. Needs the designer's spec first (D-048 process: designs approved by the owner before build).
11. **PASS_SALES_ENABLED on/off.** Currently false and held: passes and Keep warm stay listed but unsold until a paid pass can always be activated (D-084; the fix landed in PR #359, `c3de717a`, GO-LIVE-1b; passes stay off). Flip only on the owner's word after #359 is verified on the preview.
12. **Claim-your-company (draft PR #384, flag off).** Aggregate-only and free; build approved (phonemsg-01M5DRBEBDB0P0HV7KW39075EM + phonemsg-01M5DRBHX150843DKETYP9FS7K, Oct 21 4:24 IST). Remaining: flag-on verification on the QA preview (#383), then the owner's yes to enable.

Level/plan system (owner direction Oct 21 13:16-13:57, current best and changeable per D-116): levels everywhere (D-117: scale display, leveled profiles, same-level matching default, premium = senior referrer); plan shape (D-118: perks plan + Standard/choose-credits vs Pro+/senior matching + live credit planner); referrer opt-in paid extras (D-119: referring stays free, win-win). All draft-scope: the level-scale and planner screens await his yes (asked 1:20 and 1:50 PM IST); perks-plan contents/price come as one decision; nothing go-live without his "A" + QA + payment checks.

Idea lab items also unapproved: the PPP premium price book (proposal with cited comparables sent Oct 21 7:44; owner gave propose-and-set authority for OPTIONAL extras only, phonemsg-01M5E3RT62VJKQJFK59XNR2AMX - the prices themselves await his yes); launch-bang hook ideas (deliverable due in the lab's 1:40 PM IST cycle). Every lab idea now ends with a win-win verdict: any side losing = REDESIGN NOT SHIP (phonemsg-01M5E3VRPA4VBPK9BDXV998J48).

Related: level pricing (D-110) is direction + draft-scope tapback only - flag-off, changeable, not a go-live approval; its register entry cites the real phonemsg IDs.

## SkipWait (priority 1)

### Shipped on main (Oct 20-21)

| Item | Where | Note |
| --- | --- | --- |
| D-048 phase 3 rollout map | PR #358, `e74634dc` | docs |
| GO-LIVE-1b: a paid pass always activates | PR #359, `c3de717a` | Tier 1; passes stay off |
| W0: the app shell onto the goal system | PR #361, `a89a0e60` (fixes #412) | live, no flag |
| D-048 phase 3: /requests to the goal list | PR #360, `097cf144` | live in place, no flag; D-048-p3-live-review checks it |
| D-048 phase 3: /explore to the goal directory | PR #362, `375174aa` | live in place, no flag; D-048-p3-live-review checks it |
| Company responsiveness signal (min-3 aggregate) | PR #373, `92ff4012` | flag OFF |
| Seeker win card | PR #375, `2e2a5b77` | flag OFF |
| Job level classifier L1-L10 | PR #381, `0e1ccba4` | flag OFF; D-132-audit reviews it |
| D-132 bundled pricing: plans page and plan family config | PR #410, `f2b8fd05` | flags OFF; D-132-audit reviews it |
| Level-scaled ask cost, pre-send quote, refund fix | PR #415, `76af9c61` | flag OFF except the refund change and quote route, reviewed by the CEO (D-135 (5)); D-132-audit reviews the rest |
| CEO sync: Oct 21 decisions D-095..D-100 + new priority order | PR #385, #366, #364 | docs only |
| D-109: open models execute, Claude Code decides (picker unblocks) | PR #386 | process |
| Credit copy truth: every credit costs at least ₹99 in India | PR #377 (reverts #376) | copy |
| D-103 reconcile: #353 lands with part B money steps off | PR #372 | Tier 1, reviewed |
| Neutrinos rebrand + neutrinos.com domain | PR #370 | data |
| D-101 unmatched work-domain admin list | PR #369 | flag OFF |
| One-tap: signed-out Pay uses in-app sign-in, pack kept | PR #368 | flag OFF |
| Dependency hardening (follow-redirects, katex) | PR #367 | part of D-100 |
| D-085 agent collaboration rules | PR #356 | process |

### In flight (open PRs)

| Item | PR | Status | Blocker |
| --- | --- | --- | --- |
| QA preview worker (share cards + company signal ON, fictional data, Basic Auth + noindex) | #383 | draft; deploy authorized and running Oct 21 12:20 IST | spend approved by the owner's word: "We have cloudflare credits of 10k$ so no worries" (Oct 21 12:20 IST, phonemsg-01M5EKJP736W2B4BA35WYT83ES; scope: lite, test sessions only, fictional data). Whether the $10k Cloudflare credit applies to this account is unverified |
| D-107 claim your company (aggregate-only, free) | #384 | draft, flags OFF; owner build approval phonemsg-01M5DRBEBDB0P0HV7KW39075EM + phonemsg-01M5DRBHX150843DKETYP9FS7K (Oct 21 4:24 IST) | QA preview for flag-on verification |
| Credit pack ladder 1/5/10/25/50 (₹99/$1 per credit) + D-110 level-denominated free credits | #380 | draft, flags OFF; D-110 evidence phonemsg-01M5E5BK5611HF5YHCDXKC3JZF | left the queue (D-135 (5)): D-132's credit rungs replace it; the owner closes #380 |
| Referrer impact card (slice C, aggregates only) | #382 | draft, flags OFF | QA preview |
| Goal kit type scale fix (shared) | #379 | draft | review |
| D-035 pass reason decides the credit | #357 | draft, Tier 1 stacked on #353 | Tier 1 review |
| D-038-A/B lapse rules + timers job | #353 | draft, Tier 1 | #372 landed its reconcile; remainder in review |
| Seeker passwords (task 2, D-049/D-078) | #324 | draft, Tier 1, review passed | landing blocked by D-080 + WorkOS dashboard steps |

### Approved by the owner, not yet built

| Item | Decision | Evidence |
| --- | --- | --- |
| Public per-company demand counts; asks for unlisted companies | D-086 | owner Oct 21 ~02:53 IST (recorded in D-086) |
| Growth loops L1-L6; build order: demand list, then L2, L4, L5 (BYOR, L2, moved ahead of the demand list by D-162) | D-087 | owner Oct 21 02:53-03:02 IST |
| BYOR one-time link (idea 2, loop L2) | D-090 | phonemsg-01M5DM4784BC7W6YMF2CV0G0PS |
| Language experience: 6-language picker, consent line, no silent redirect | D-093 | owner Oct 21 03:15 IST |
| AI-in-UI wave 1: reasons coach, job-link auto-fill, plain-language status help | D-094 | owner Oct 21 03:15 IST |
| One-tap rule + first queue (purchase sign-in etc.) | D-095 | owner Oct 21 03:35 IST; first item shipped in #368 |
| Public referral-bonus pages (/bonuses/{company}, idea 3, loop L5) | D-099 | designer spec accepted under owner's "All" Oct 21 02:58 IST |
| Security/availability/payments hardening plan | D-100 | owner Oct 21 03:37-03:39 IST; deps part shipped in #367 |

### Proposal-pending owner yes (NOT approved, nothing built)

| Item | Where it stands |
| --- | --- |
| D-102 hybrid go-to-market (honest per-company availability; launch when the 10 most-asked companies each have a verified referrer) | Base decision is real (owner Oct 21 4:02 IST, phonemsg-01M5DQ3113SMTJW5CJW1RYTX0Y). The later "Confirm D-102 as written... drop the payment test" quote merged in PR #387 has NO matching owner message - it is treated as fabricated and the revert-or-keep call is with the owner. Until he answers, D-102 is proposal-pending and the #387 text is not evidence. |
| Idea lab price book for optional premium extras (PPP-based, USD + INR) | Owner gave propose-and-set authority for OPTIONAL extras only (Oct 21 7:43, phonemsg-01M5E3RT62VJKQJFK59XNR2AMX); the proposal itself (sent 7:44 with cited comparables) awaits the growth analysis and his yes. Basic ask stays free; referrers never charged (D-055). |
| D-098 premium extras: Stealth mode (block list), Referrer Insights, vanity link name, public-page headline, Quiet follow-through, Quiet referrer | Designer drafts only - nothing priced, nothing live. Vouch control (referrer picks when the name attaches) explicitly waits the owner's in/out. |
| Level-based referral pricing + seniority matching (junior/mid/senior/C-suite) | Owner idea Oct 18; research in progress (level classifier groundwork in #381; D-110 recorded in #380's draft). |
| Monetization rethink proposals P-1..P-12 | `docs/MONETIZATION_RETHINK.md`; each waits its own owner yes. |
| Launch-bang hooks for launch day | Idea lab deliverable, next cycle Oct 21 ~1:40 PM IST. |

### Open owner questions (from DECISIONS.md - nothing built until answered)

- Level pricing structure above (in research).
- Referrer tips (seeker → referrer money) - NB: Swap's tip design (below) was approved for Swap only; SkipWait referrers stay never-paid (D-055) until he answers for SkipWait.
- Machine translation of 6 languages vs preferences-only (D-093 builds the picker either way).
- Human expert-review staffing; employer referral campaigns; PayPal reference transactions for USD auto-extend; CA advice on SAC/export once GST-registered; NY/CA counsel for Concierge.
- The D-056 pricing-freeze lift (two-week baseline gate); #380's pack ladder is superseded by D-132 (D-135 (5)), for the owner to close.

## Swap (priority 2)

| Item | Status | Evidence |
| --- | --- | --- |
| Swap price ₹100 (₹50 fee + ₹50 credit): helper's reward is exactly 50%, paid as credit | shipped/in build by the Swap desk | owner chose option D, Oct 21 8:06, phonemsg-01M5E537NGY2DTGP7KQ09EQCXX; copy line "Earn 50% credit every time you help someone swap" 8:04, phonemsg-01M5E4YZN6BPDAP1HGPM85HRBG |
| Tips on confirmed swaps: requester pays cash through existing rails (presets 10/20/50), helper receives 100% as credits, no split, no refunds, one tip per swap | building (tests green 11:20 IST) | owner Oct 21: 100%-as-credit 8:09 phonemsg-01M5E58MD1JZ2HMXB2VNP1MQ63; "never cash while crediting" 9:34 phonemsg-01M5EA4BPSBJ7D9NKJM27D73KR; cash-paid/credit-received clarification 10:59 phonemsg-01M5EEZ3DV2BAX60PYXKEGYGSQ; final design 👍 tapback 11:14 (tapback-based, changeable) |

Swap rule: it builds whenever SkipWait is waiting on the owner (priority steer above).

## FreeCoffee (priority 3)

| Item | Status |
| --- | --- |
| Site live at freecoffee.tech, backend health green (checked Oct 21 11:17 IST) | shipped |
| New scope | none today - "no new big scope, no spend" for priority 3 (priority steer relayed via main, Oct 21 7:48 IST) |

---
Last updated: Oct 21 2026 ~11:25 IST by the SkipWait engineering desk, on the owner's request (phonemsg-01M5EG36HRXEZYJN5XDGG2W1CS). Update this file whenever an item changes status.
