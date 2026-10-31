# Packet: paid-referrer priority, routing design (Oct 25 2026)

Design only. No implementation yet, and no paid activation until this design
passes review and tests and the owner turns the flag (D-056, D-111, D-123).
Money surface: plans stay unsold (D-146 flags off). Related: banded pricing
replacement (PR #666), poster first-look 24h repair (PR #672), decision log
item 4 (PR #668, docs/IMPLEMENTATION-BACKLOG-oct25.md).

## 1. Authority and scope limits (frozen)

- Founder grant: phonemsg-01M5SFYFY54D3VAEDAEA3591SS (Oct 25 2026, 17:48 IST,
  author=user). Referring stays free; referrers may opt in to level plans
  (early, mid, senior career), and plan members get priority access to
  job-seeker requests of their level over free-pool referrers. The same
  message sets the poster's first look at 24 hours, after which the ask moves
  to the next referrers.
- Bounded approval: user like (Oct 25 2026, 20:25:26 IST, provider reaction
  f6e042d9-3422-4297-b20d-b6d3319e391a) on the explicit question
  phonemsg-01M5SR6J0RQ9PWQ0YSJ71Z7WK1: paid priority fits inside the existing
  first day; NO additional waiting period before free referrers get a turn;
  the poster's first look stays protected. That answer does NOT settle the
  exact routing; this packet is the routing design for review.
- Fairness mapping (D-157 newest word wins): the 17:48 grant is newer than
  the D-006/D-040 blanket ban on selling priority. This packet defines what
  may be sold: the order and discovery speed of asks in a referrer's own
  view. What stays banned under D-006/D-040 and is not touched here: selling
  referrals, selling a ranking of people, seeker-to-referrer payments, and
  selling visibility to seekers. Nothing in this packet is sold to seekers.
- D-055 stands: referrers are never paid and referring is never charged.
  D-119 anticipated opt-in paid extras later; the 17:48 grant is the owner's
  newer word opening that door. A referrer plan buys discovery of asks, never
  payment for a referral, and non-members refer exactly as today.

## 2. What the code does today (verified on main, 216066dd)

- Poster first look: an ask created from an opportunity post sets
  firstLookReferrerId and firstLookUntil (server/db.ts ask creation,
  shared/companyOpportunities firstLookUntilFrom). Main's constant still says
  48 hours; the founder's 17:48 word sets 24; repair is PR #672.
- Poster PASS (server/db.ts pass transition): the patch nulls
  firstLookReferrerId and firstLookUntil, so the ask is open to ALL eligible
  referrers immediately. Only the seeker is notified; colleagues get no
  notification on a pass.
- LAPSE (releaseFirstLookForRequest): after the first-look window, every
  eligible colleague (verified for the company, not the poster, not already
  passed, not blocked with the seeker) gets one in-app notification, eventKey
  first_look_released, at the same moment.
- Consequence: today there is NO stage where free referrers wait while others
  browse. Any design that inserts an exclusive paid stage after the poster's
  first look ADDS a wait for free referrers versus legacy. That mechanic was
  considered and is DROPPED on this evidence.

## 3. Design (timeline-neutral)

Paid members get discovery advantages at the SAME release moments that exist
today; free-pool access moments do not move.

1. Instant notification: when an ask opens to the pool (poster pass OR
   lapse), paid members whose level band matches the ask are notified
   immediately. The pass case notifies nobody but the seeker today, so this
   is new discovery for members only; the lapse case notifies everyone in-app
   today, and that stays. Free referrers keep exactly today's notification
   behavior.
2. Ask-ordering: in a paid member's own request list, open asks in their
   level band sort ahead of other asks. Ordering is per-viewer; nobody else's
   list changes.
3. Overlap sharing: at every moment, every ask open to the pool is visible to
   every eligible referrer, free or paid. A paid member never sees an ask
   that is not also open to free members at that moment. The poster's own
   first look is unchanged and still excludes everyone else.

Never: a paid-only exclusive window; moving the pass or lapse release
moments; revealing seeker identity earlier (D-012(3), D-019(e) unchanged);
any ranking of referrers shown to seekers; anything sold to seekers.

## 4. Level bands

- Bands are the founder's early / mid / senior career levels. Use the level
  model from the banded pricing work (PR #666, docs/PRICING.md, D-146) and
  the JOB-LEVELS registry row; do not invent a second level taxonomy.
- An ask with no level resolves to free-pool treatment for everyone (no
  member advantage). A paid member outside the ask's band gets no advantage
  on that ask.

## 5. Not settled here (needs owner or review)

- Notification channel for members (in-app vs email) and cadence limits
  (D-060 at most one email a day).
- Duration: there is none. Priority is per release moment and continuous; the
  bounded approval explicitly rejected added waiting periods.
- Exact level mapping inside #666's frozen model is #666's to own; this
  packet references it and must not restate it.

## 6. Red-first tests and acceptance (for the implementer)

- Poster pass: an in-band paid member is notified immediately; a free member
  gets no new notification beyond today's behavior; both see the ask open at
  the same moment.
- Lapse: paid and free members are notified at the same moment; only
  per-viewer ordering differs.
- Flag off (default): zero behavior change for anyone; all priority logic is
  behind the plan flag that stays off until the owner's word.
- No regression: firstLookExcludesViewer behavior is unchanged for everyone;
  blocked pairs are still excluded from every notification (P0-block-delivery);
  D-055 pins stay green (accepting an ask pays the referrer nothing).
- pnpm check, the design-token audit and the existing referral suites green
  on the exact head; one review by a model other than the builder (D-200)
  before merge.

## Status

Design packet under review. No implementation. Paid activation remains
blocked on review, tests and the owner's flag word.
