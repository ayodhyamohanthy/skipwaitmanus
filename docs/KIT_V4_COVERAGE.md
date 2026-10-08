# Kit v4 screen coverage

Source of truth for design: `screens/web` (1280) and `screens/mobile` (390), 105/106 PNGs, 42 screen groups (00 to 41).
Rule: web screens follow web designs, mobile screens follow mobile designs. Every row below is checked at BOTH widths.

Status key
- **Verified** - compared at 1280 against `screens/web` and at 390 against `screens/mobile`, matched, live.
- **Built, unverified** - route exists in `client/src/App.tsx`; no two-width compare on record yet. Being worked through (see "Audit queue").
- **Pushed direct, unreviewed** - changed tonight in direct-to-main commits (Oct 9, 02:00 to 02:44 IST) without a visual check.
- **Missing** - no route. Build candidate.
- **N/A** - cannot apply to the product as it exists.
- **Held** - needs a founder decision before any build.

Fixture note: signed-in screens are checked with route-interception fixtures, never a real account.

| # | Kit screen | Route | Status | Notes |
|---|---|---|---|---|
| 00 | x (landing) | `/` | Verified | Hero door, trust strip removed (founder call), side note kept. Live e2e6e0a. |
| 01 | explore | `/explore` | Built, unverified | |
| 02 | explore-skipwait (+2 steps) | `/explore/:slug` | Built, unverified | Direct pushes touched eyebrow and empty state. |
| 03 | sign-in | `/sign-in` | Built, unverified | Mobile has 2 variants in the kit. |
| 04 | onboarding (+skip) | `/start`, `/onboarding` | Built, unverified | Direct push changed the check icon. |
| 05 | ask | `/ask` | Verified | Footer strip added. Not built: "Improve my note" credit action and Role-location select (new paid action / field, needs founder). |
| 06 | requests (closed, default, first-time, slots-full) | `/requests` | Pushed direct, unreviewed | Open-slot meter and slots-full nudge added at 02:33. Earlier heading fix verified. |
| 07 | inbox (default, empty) | `/inbox` | Built, unverified | Full width fix earlier. Tab labels Title Case (#170). |
| 08 | thread (default, referrer-view, step1, step3) | `/conversation/:id` | Pushed direct, unreviewed | Countdown added on queue detail. |
| 09 | alerts (default, empty, saved-alerts) | `/alerts` | Pushed direct, unreviewed | Saved alerts tab built on a new backend at 02:44. Page width verified (#171). Free cap of 3 pending founder call. |
| 10 | landed (+2 steps) | `/landed` | Verified | #171 |
| 11 | referrer (default, impact, request-queue, setup-capacity) | `/referrer`, `/referrer/impact`, `/queue` | Pushed direct, unreviewed | Referrer record metrics added (02:00). |
| 12 | referrer-home (5 states) | `/referrer-home` | Pushed direct, unreviewed | Layout verified earlier, then the "Expiring within 24h" card replaced "In review with you" (22:53). Needs re-check vs 12. |
| 13 | referrer-setup (+step) | `/referrer-setup` | Pushed direct, unreviewed | Levels selector added (02:14). |
| 14 | verify (+2 steps) | `/verify` | Verified | |
| 15 | invite | `/invite` | Built, unverified | Not changed in #171. |
| 16 | profile (default, referrer-profile) | `/profile` | Pushed direct, unreviewed | Open-to roles field added (02:22). |
| 17 | p-asha (public profile) | `/p/:handle` | Pushed direct, unreviewed | Visibility selector and open-to chips (02:00 to 02:22). |
| 18 | work | `/work` | Pushed direct, unreviewed | Referrer-view toggle and thumbnails (02:05). Width verified (#171). |
| 19 | plans (+2 steps) | `/plans` | Built, unverified | Kit tiers (Start/Momentum/Land) NOT adopted: live pricing stays Pro/Max. QA payment battery passed 3:57 PM Oct 8. |
| 20 | billing (cancelling, default, free, payment-issue) | `/billing` | Pushed direct, unreviewed | Manage-plan page on the real ledger (02:11). Was 404 at the edge until #173. Kit tier names not adopted. |
| 21 | settings | `/settings` | Verified | #169. Kit Region tab not ported (no backend). |
| 22 | assistants (4) | none | Held | AI-assistant group C. Needs founder decision on product fit. |
| 23 | approve (6) | none | Held | Group C |
| 24 | connect-assistant (7) | none | Held | Group C |
| 25 | developers | `/developers` | Built, unverified | |
| 26 | developer-console (6) | none | Held | Group C |
| 27 | safety | `/safety` | Built, unverified | Footer stays "Safety" until the Guidelines decision. |
| 28 | help | `/help` | Verified at 1280 only | 390 still to compare. |
| 29 | report (+2 steps) | `/report` | Verified | #171 |
| 30 | suggest-company | `/suggest-company` | Pushed direct, unreviewed | Copy and submit button changed (17:51). |
| 31 | forgot-password | none | N/A | No password auth exists. |
| 32 | reset-password | none | N/A | No password auth exists. |
| 33 | app-states (9) | partial | Mixed | Real states built: offline, not-found, slow connection, update prompt. Install/push states and the gallery itself skipped. |
| 34 | for-companies | `/for-companies` | Verified | #167. Example pricing section NOT adopted. |
| 35 | employer (default, just-joined) | `/employer` | Built, unverified | |
| 36 | admin (+step) | `/admin` | Pushed direct, unreviewed | Operations overview added (02:18). Was 404 at the edge until #173. |
| 37 | admin-review | `/admin-review` | Built, unverified | |
| 38 | emails | `/emails` | Built, unverified | |
| 39 | guidelines | `/guidelines` | Built, unverified | Commitments text pending founder decision. |
| 40 | terms | `/terms` | Built, unverified | |
| 41 | privacy | `/privacy` | Pushed direct, unreviewed | Short-version summary card added (17:52). |

Out of scope by founder decision: `/wallet`, `/early-member`.

## Audit queue (order)
1. Pushed direct, unreviewed (user-visible, 14 routes).
2. Built, unverified.
3. Gaps: only missing items are group C (held) and the Ask additions that need founder sign-off. No other screen group lacks a route.

Verification results are recorded below as they land.

## Results
Oct 9, 03:50 IST (local build, fixture, signed-in shell):
- `/requests` at 1280 vs `06_requests__default`: layout matches (eyebrow, h1 with brand dot, New ask, three stat cards, open-slot segments). List and tabs not exercised: the fixture has no request data.
- `/referrer-home` at 1280 vs `12_referrer-home__default`: header, title, stat row and footer match. The kit's middle card is "Expiring within 24h", so the 22:53 direct push moved the card toward the kit. The fixture shows the unverified state only, so the verified layout (waiting list, thank-you wall, record) is not yet rendered.
- Still to compare in this pass: both widths for the other routes in the audit queue.
