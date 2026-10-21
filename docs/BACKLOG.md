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

(Owner, Oct 21 7:48 IST, phonemsg-01M5E422R3ZS8K9K0MCMEXZ5FV.)

Standing rules that shape every item: win-win verdict - if any side (seeker, referrer, company) loses, including on monetization feel, the idea is REDESIGN NOT SHIP (D-096; owner Oct 21 7:45, phonemsg-01M5E3VRPA4VBPK9BDXV998J48); value-adding features are pre-approved to design and build, but cash spend, posts in the owner's name, pricing/credit-rule changes and charging for the basic ask still need his per-item yes (D-091); every feature ships behind a flag that stays off until QA verifies (D-097).

## SkipWait (priority 1)

### Shipped on main (Oct 20-21)

| Item | Where | Note |
| --- | --- | --- |
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
| W0: app shell onto the goal system (rail, bottom bar, More menu) | #361 | CI 4/4 green on head `cced876c`; NOT flag-gated - merging changes the live UI frame | QA must verify on the QA preview (#383) before merge |
| D-048 phase 3: /explore to goal directory | #362 | open | designer/QA flow |
| D-048 phase 3: /requests to goal list | #360 | open | same |
| D-048 phase 3 rollout map (8 waves) | #358 | draft | planning doc |
| QA preview worker (share cards + company signal ON, fictional data, Basic Auth + noindex) | #383 | draft; deploy run in flight Oct 21 ~11:00 IST | infra deploy; spend approved on lite-only terms |
| D-107 claim your company (aggregate-only, free) | #384 | draft, flags OFF; owner build approval phonemsg-01M5DRBEBDB0P0HV7KW39075EM + phonemsg-01M5DRBHX150843DKETYP9FS7K (Oct 21 4:24 IST) | QA preview for flag-on verification |
| Credit pack ladder 1/5/10/25/50 (₹99/$1 per credit) + D-110 level-denominated free credits | #380 | draft, flags OFF; D-110 evidence phonemsg-01M5E5BK5611HF5YHCDXKC3JZF | owner reviewing the pack table view |
| Job level classifier L1-L10 (level-scaled ask cost groundwork) | #381 | draft, flag OFF | feeds level pricing research below |
| Referrer impact card (slice C, aggregates only) | #382 | draft, flags OFF | QA preview |
| Seeker win card (opt-in copy card on accepted asks) | #375 | draft, flag OFF | QA preview |
| Company responsiveness signal (min-3 aggregate) | #373 | draft, flag OFF | QA preview |
| Goal kit type scale fix (shared) | #379 | draft | review |
| GO-LIVE-1b: a paid pass always activates | #359 | draft | payments verification bar |
| D-035 pass reason decides the credit | #357 | draft, Tier 1 stacked on #353 | Tier 1 review |
| D-038-A/B lapse rules + timers job | #353 | draft, Tier 1 | #372 landed its reconcile; remainder in review |
| Seeker passwords (task 2, D-049/D-078) | #324 | draft, Tier 1, review passed | landing blocked by D-080 + WorkOS dashboard steps |

### Approved by the owner, not yet built

| Item | Decision | Evidence |
| --- | --- | --- |
| Public per-company demand counts; asks for unlisted companies | D-086 | owner Oct 21 ~02:53 IST (recorded in D-086) |
| Growth loops L1-L6; build order: demand list, then L2, L4, L5 | D-087 | owner Oct 21 02:53-03:02 IST |
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
- Pack ladder table view (#380) and the D-056 pricing-freeze lift (two-week baseline gate).

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
| New scope | none today - owner: "no new big scope, no spend" for priority 3 (phonemsg-01M5E422R3ZS8K9K0MCMEXZ5FV) |

---
Last updated: Oct 21 2026 ~11:25 IST by the SkipWait engineering desk, on the owner's request (phonemsg-01M5EG36HRXEZYJN5XDGG2W1CS). Update this file whenever an item changes status.
