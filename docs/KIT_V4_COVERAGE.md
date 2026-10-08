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

## Per-screen matrix (every PNG)

W = `screens/web` PNG exists, M = `screens/mobile` PNG exists. Status is the route's status above; a state screen also needs its state reachable in the real app (marked `state?` until checked). 1280 / 390 columns say whether I have compared that PNG against the built page.

| Group | State | W | M | Route | Route status | 1280 | 390 |
|---|---|---|---|---|---|---|---|
| 00 x (landing) | default | Y | Y | `/` | Verified | todo | todo |
| 01 ? | default | Y | Y | ? | ? | todo | todo |
| 02 explore-skipwait (+2 steps) | default | Y | Y | `/explore/:slug` | Built, unverified | todo | todo |
| 02 explore-skipwait (+2 steps) | step1-ask-for-a-referral | Y | Y | `/explore/:slug` | Built, unverified | todo | todo |
| 02 explore-skipwait (+2 steps) | step2-continue | Y | Y | `/explore/:slug` | Built, unverified | todo | todo |
| 03 sign-in | default | Y | Y | `/sign-in` | Built, unverified | todo | todo |
| 03 sign-in | step1-continue-with-email | - | Y | `/sign-in` | Built, unverified | todo | todo |
| 04 onboarding (+skip) | default | Y | Y | `/start`, `/onboarding` | Built, unverified | todo | todo |
| 04 onboarding (+skip) | step1-skip-for-now | Y | Y | `/start`, `/onboarding` | Built, unverified | todo | todo |
| 05 ask | default | Y | Y | `/ask` | Verified | todo | todo |
| 06 requests (closed, default, first-time, slots-full) | closed | Y | Y | `/requests` | Pushed direct, unreviewed | todo | todo |
| 06 requests (closed, default, first-time, slots-full) | default | Y | Y | `/requests` | Pushed direct, unreviewed | todo | todo |
| 06 requests (closed, default, first-time, slots-full) | first-time | Y | Y | `/requests` | Pushed direct, unreviewed | todo | todo |
| 06 requests (closed, default, first-time, slots-full) | slots-full | Y | Y | `/requests` | Pushed direct, unreviewed | todo | todo |
| 07 inbox (default, empty) | default | Y | Y | `/inbox` | Built, unverified | todo | todo |
| 07 inbox (default, empty) | empty | Y | Y | `/inbox` | Built, unverified | todo | todo |
| 08 thread (default, referrer-view, step1, step3) | default | Y | Y | `/conversation/:id` | Pushed direct, unreviewed | todo | todo |
| 08 thread (default, referrer-view, step1, step3) | referrer-view | Y | Y | `/conversation/:id` | Pushed direct, unreviewed | todo | todo |
| 08 thread (default, referrer-view, step1, step3) | step1-seeker-view | Y | Y | `/conversation/:id` | Pushed direct, unreviewed | todo | todo |
| 08 thread (default, referrer-view, step1, step3) | step3-accept-connect | Y | Y | `/conversation/:id` | Pushed direct, unreviewed | todo | todo |
| 09 alerts (default, empty, saved-alerts) | default | Y | Y | `/alerts` | Pushed direct, unreviewed | todo | todo |
| 09 alerts (default, empty, saved-alerts) | empty | Y | Y | `/alerts` | Pushed direct, unreviewed | todo | todo |
| 09 alerts (default, empty, saved-alerts) | saved-alerts | Y | Y | `/alerts` | Pushed direct, unreviewed | todo | todo |
| 10 landed (+2 steps) | default | Y | Y | `/landed` | Verified | todo | todo |
| 10 landed (+2 steps) | step1-thank-your-referrer | Y | Y | `/landed` | Verified | todo | todo |
| 10 landed (+2 steps) | step2-send-thanks | Y | Y | `/landed` | Verified | todo | todo |
| 11 referrer (default, impact, request-queue, setup-capacity) | default | Y | Y | `/referrer`, `/referrer/impact`, `/queue` | Pushed direct, unreviewed | todo | todo |
| 11 referrer (default, impact, request-queue, setup-capacity) | impact | Y | Y | `/referrer`, `/referrer/impact`, `/queue` | Pushed direct, unreviewed | todo | todo |
| 11 referrer (default, impact, request-queue, setup-capacity) | request-queue | Y | Y | `/referrer`, `/referrer/impact`, `/queue` | Pushed direct, unreviewed | todo | todo |
| 11 referrer (default, impact, request-queue, setup-capacity) | setup-capacity | Y | Y | `/referrer`, `/referrer/impact`, `/queue` | Pushed direct, unreviewed | todo | todo |
| 12 referrer-home (5 states) | at-capacity | Y | Y | `/referrer-home` | Pushed direct, unreviewed | todo | todo |
| 12 referrer-home (5 states) | default | Y | Y | `/referrer-home` | Pushed direct, unreviewed | todo | todo |
| 12 referrer-home (5 states) | new-referrer | Y | Y | `/referrer-home` | Pushed direct, unreviewed | todo | todo |
| 12 referrer-home (5 states) | paused | Y | Y | `/referrer-home` | Pushed direct, unreviewed | todo | todo |
| 12 referrer-home (5 states) | re-verify-due | Y | Y | `/referrer-home` | Pushed direct, unreviewed | todo | todo |
| 13 referrer-setup (+step) | default | Y | Y | `/referrer-setup` | Pushed direct, unreviewed | todo | todo |
| 13 referrer-setup (+step) | step1-continue | Y | Y | `/referrer-setup` | Pushed direct, unreviewed | todo | todo |
| 14 ? | default | Y | Y | ? | ? | todo | todo |
| 14 ? | step1-continue | Y | Y | ? | ? | todo | todo |
| 14 ? | step2-send-code | Y | Y | ? | ? | todo | todo |
| 15 invite | default | Y | Y | `/invite` | Built, unverified | todo | todo |
| 16 profile (default, referrer-profile) | default | Y | Y | `/profile` | Pushed direct, unreviewed | todo | todo |
| 16 profile (default, referrer-profile) | step2-referrer-profile | Y | Y | `/profile` | Pushed direct, unreviewed | todo | todo |
| 17 p-asha (public profile) | default | Y | Y | `/p/:handle` | Pushed direct, unreviewed | todo | todo |
| 18 work | default | Y | Y | `/work` | Pushed direct, unreviewed | todo | todo |
| 19 plans (+2 steps) | default | Y | Y | `/plans` | Built, unverified | todo | todo |
| 19 plans (+2 steps) | step1-yearly-2-mo-free | Y | Y | `/plans` | Built, unverified | todo | todo |
| 19 plans (+2 steps) | step2-upgrade-to-momentum | Y | Y | `/plans` | Built, unverified | todo | todo |
| 20 billing (cancelling, default, free, payment-issue) | cancelling | Y | Y | `/billing` | Pushed direct, unreviewed | todo | todo |
| 20 billing (cancelling, default, free, payment-issue) | default | Y | Y | `/billing` | Pushed direct, unreviewed | todo | todo |
| 20 billing (cancelling, default, free, payment-issue) | free | Y | Y | `/billing` | Pushed direct, unreviewed | todo | todo |
| 20 billing (cancelling, default, free, payment-issue) | payment-issue | Y | Y | `/billing` | Pushed direct, unreviewed | todo | todo |
| 21 settings | default | Y | Y | `/settings` | Verified | todo | todo |
| 22 assistants (4) | activity | Y | Y | none | Held | todo | todo |
| 22 assistants (4) | api-tokens | Y | Y | none | Held | todo | todo |
| 22 assistants (4) | default | Y | Y | none | Held | todo | todo |
| 22 assistants (4) | momentum-or-start | Y | Y | none | Held | todo | todo |
| 23 approve (6) | declined | Y | Y | none | Held | todo | todo |
| 23 approve (6) | default | Y | Y | none | Held | todo | todo |
| 23 approve (6) | editing | Y | Y | none | Held | todo | todo |
| 23 approve (6) | sent | Y | Y | none | Held | todo | todo |
| 23 approve (6) | slots-full | Y | Y | none | Held | todo | todo |
| 23 approve (6) | spend-credits | Y | Y | none | Held | todo | todo |
| 24 connect-assistant (7) | approved | Y | Y | none | Held | todo | todo |
| 24 connect-assistant (7) | declined | Y | Y | none | Held | todo | todo |
| 24 connect-assistant (7) | default | Y | Y | none | Held | todo | todo |
| 24 connect-assistant (7) | expired | Y | Y | none | Held | todo | todo |
| 24 connect-assistant (7) | not-on-land | Y | Y | none | Held | todo | todo |
| 24 connect-assistant (7) | signed-out | Y | Y | none | Held | todo | todo |
| 24 connect-assistant (7) | unverified-app | Y | Y | none | Held | todo | todo |
| 25 ? | default | Y | Y | ? | ? | todo | todo |
| 26 developer-console (6) | app-details | Y | Y | none | Held | todo | todo |
| 26 developer-console (6) | default | Y | Y | none | Held | todo | todo |
| 26 developer-console (6) | in-review | Y | Y | none | Held | todo | todo |
| 26 developer-console (6) | new-app | Y | Y | none | Held | todo | todo |
| 26 developer-console (6) | rejected | Y | Y | none | Held | todo | todo |
| 26 developer-console (6) | suspended | Y | Y | none | Held | todo | todo |
| 27 safety | default | Y | Y | `/safety` | Built, unverified | todo | todo |
| 28 help | default | Y | Y | `/help` | Verified at 1280 only | todo | todo |
| 29 report (+2 steps) | default | Y | Y | `/report` | Verified | todo | todo |
| 29 report (+2 steps) | step1-continue | Y | Y | `/report` | Verified | todo | todo |
| 29 report (+2 steps) | step2-submit-report | Y | Y | `/report` | Verified | todo | todo |
| 30 suggest-company | default | Y | Y | `/suggest-company` | Pushed direct, unreviewed | todo | todo |
| 31 forgot-password | default | Y | Y | none | N/A | todo | todo |
| 31 forgot-password | step1-send-reset-link | Y | Y | none | N/A | todo | todo |
| 32 reset-password | default | Y | Y | none | N/A | todo | todo |
| 32 reset-password | expired-link | Y | Y | none | N/A | todo | todo |
| 33 app-states (9) | default | Y | Y | partial | Mixed | todo | todo |
| 33 app-states (9) | install-iphone | Y | Y | partial | Mixed | todo | todo |
| 33 app-states (9) | loading | Y | Y | partial | Mixed | todo | todo |
| 33 app-states (9) | not-found | Y | Y | partial | Mixed | todo | todo |
| 33 app-states (9) | offline | Y | Y | partial | Mixed | todo | todo |
| 33 app-states (9) | payment-failed | Y | Y | partial | Mixed | todo | todo |
| 33 app-states (9) | push-permission | Y | Y | partial | Mixed | todo | todo |
| 33 app-states (9) | slow-connection | Y | Y | partial | Mixed | todo | todo |
| 33 app-states (9) | something-went-wrong | Y | Y | partial | Mixed | todo | todo |
| 34 for-companies | default | Y | Y | `/for-companies` | Verified | todo | todo |
| 35 ? | default | Y | Y | ? | ? | todo | todo |
| 35 ? | just-joined | Y | Y | ? | ? | todo | todo |
| 36 admin (+step) | default | Y | Y | `/admin` | Pushed direct, unreviewed | todo | todo |
| 36 admin (+step) | step1-review-company-submissions-validate-doma | Y | Y | `/admin` | Pushed direct, unreviewed | todo | todo |
| 37 ? | default | Y | Y | ? | ? | todo | todo |
| 38 ? | default | Y | Y | ? | ? | todo | todo |
| 39 guidelines | default | Y | Y | `/guidelines` | Built, unverified | todo | todo |
| 40 ? | default | Y | Y | ? | ? | todo | todo |
| 41 privacy | default | Y | Y | `/privacy` | Pushed direct, unreviewed | todo | todo |

Totals: 105 web PNGs, 106 mobile PNGs, 106 distinct (group, state) screens.

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
