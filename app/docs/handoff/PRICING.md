# Pricing & credits spec (design values — source: app/src/lib/monetization-data.ts)

Referrals are always free. Money never buys queue position, referral access or acceptance odds.

## Plans (display name / internal id)
| Plan | Monthly | Yearly | Included credits | Rollover | Open requests |
|---|---|---|---|---|---|
| Free (not shown as a card) | $0 | — | 3 one-time after profile | — | 3 |
| Start / go | $8 | $80 | 10/mo | 1 month | 8 |
| Momentum / plus ("Most chosen") | $20 | $200 | 30/mo | up to 3 months | 15 |
| Land Focus / pro | $100 | $1,000 | 120/mo | while subscribed | 30 |
| Land Sprint | $200 | $2,000 | 300/mo | while subscribed | 50 |
| Land Concierge | $500+ | $5,000+ | 1,000/mo | while subscribed | unlimited |

Yearly = "2 months free". Monthly/Yearly toggle lives inside each card, shared state. CTAs: "Upgrade to Start/Momentum/Land".
An open request slot frees when the request is answered or passed.

## Credits
- $1 = 1 credit = one finished unit of work. Purchased credits never expire.
- Packs: 5/$5, 25/$22 (Most chosen), 60/$48, 150/$105.
- Add credits opens a modal (pack → payment → confirmation), from top chip and credits bar.
- Costs: ask rewrite 1, profile check 1, company research 3, resume overhaul 3, mock interview 5, extra slot 30 days 2.
- Signature tools: Ask One-Pager 2 (Start+), Salary coach 5 (Momentum+), Human expert review 25 (Land), Interview dossier 4, Offer comparison 3 (Momentum+), Thank-you pack 1 (Start+).

## Employers (/for-companies)
Company page free · Referral programme from $199/mo · Enterprise talk to us.

## Pricing ethics
Honest anchoring only (yearly, packs, Land levels). No fake tiers, fake "was" prices or fake scarcity. No hiring guarantees.
