# Pricing & credits spec (display values — source: `docs/PRICING_RECOMMENDATION.md`, code: `shared/planCatalog.ts`)

Referrals are always free. Money never buys queue position, referral access or acceptance odds.
If this file and `shared/planCatalog.ts` disagree, the code wins — change both together.

Paid plans are **passes paid once**: 30-day or 90-day. Keep warm is the only yearly plan.
A 90-day pass grants its plan credits in three cycles of about 30 days. A pass ends by itself;
Keep warm, Start, Momentum and Land Focus/Sprint may opt in to auto-extend at the same price
(INR: UPI AutoPay or card/netbanking e-mandate; USD auto-extend only once a recurring USD route is
confirmed — until then every USD pass is one-time). Concierge and every 90-day Land pass never
auto-renew: we send a reminder and a one-tap re-buy instead.

## Plans

| Plan | Price 30 days | Price 90 days | Plan credits / month | Rollover | Open asks |
|---|---|---|---|---|---|
| Free (never a card) | $0 | — | 2 (plus 3 welcome credits, once) | none | 3 |
| Keep warm | — (yearly $29 / ₹999) | — | 1 | 1 month | 5 |
| Start | $8 / ₹299 | $19 / ₹699 | 10 | 1 month | 8 |
| Momentum (recommended) | $24 / ₹999 | $59 / ₹2,499 | 30 | 3 months | 15 |
| Land Focus | $100 / ₹5,999 | $249 / ₹13,999 | 120 | while the pass is active | 30 |
| Land Sprint | $200 / ₹11,999 | $499 / ₹27,999 | 300 | while the pass is active | 50 |
| Land Concierge (by application) | $750 / ₹34,999 | $1,990 / ₹84,999 | 1,000 | while the pass is active | 75 |

- USD is the one global price. India sees the INR "India price"; GST wording appears only once a
  GSTIN exists (`INDIA_GST_REGISTERED`, off — Indian sole proprietorship, Udyam MSME; see D-007).
- Free includes a one-time 14-day reverse trial after the first ask: Momentum's 15 open asks and
  5 trial credits, no card, once per person.
- An open ask slot frees when the request is answered, passed or expires.
- Every plan holds at most **2 open asks at the same company**; Land Focus includes 1 written
  expert review, Land Sprint 1 written review + 1 live session, Concierge 6 human hours per cycle.

## Human time (sold as sessions, never for credits)

| Session | Price | Included |
|---|---|---|
| Written expert review | $49 / ₹799 | Returned within 48 hours; Land Focus and Land Sprint include one |
| Live 45-minute session | $99 / ₹1,499 | Mock interview or search strategy; Land Sprint includes one |

A reviewer is never an employee of, or a SkipWait referrer for, the seeker's target company.
Sessions go on sale only once reviewers are staffed and contracted (`HUMAN_REVIEWERS_STAFFED`).

## Credits

Credits buy AI-made finished work. Purchased credits never expire and never affect referral
access or queue position. Plan credits end with the pass that granted them (renewing passes
keep the rollover above, after a 3-day grace).

- Packs (one-time): USD 5/$5 (first), 25/$22, 60/$48, 150/$105.
  India: 2/₹99 (first), 25/₹1,199, 60/₹2,599, 150/₹5,999.
- Costs: Ask rewrite 1, Profile check 1, Thank-you pack 1, Ask One-Pager 2, extra open ask for
  30 days 2, Company research 3, Resume overhaul 3, Offer comparison 3, Interview dossier 4,
  AI mock interview 5, Salary coach 5.

## Employers (/for-companies)

Company page free · Referral programme from $199/mo · Enterprise talk to us.

## Pricing ethics

Honest anchoring only (yearly, packs, Land levels). No fake tiers, fake "was" prices or fake
scarcity. No hiring guarantees. Never sell referrals, priority, visibility or payments to referrers,
and never show a plan to a referrer.
