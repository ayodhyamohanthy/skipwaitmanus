# Task 21 design: notification kinds + preferences (DESIGN ONLY, nothing built)

Status: awaiting founder approval of the email-vs-in-app matrix and all user-facing copy. No migration, no sender change, no email until approved.

## What exists today (read from main)
- In-app: `notifications` rows with a 4-value `category` (referral, message, status, system) and free-text title/body. ~17 insert sites in `server/db.ts` (accept/pass, new request, private referral messages, DMs, coverage credit, credits added, employer access). `/alerts` picks icon and destination from the category only.
- Email (ZeptoMail via `server/emailDelivery.ts`): referrer review email and Slack delivery (`referralReviewDeliveries`, consent-gated), seeker emails on accept/pass/claimed (`notifyEmail` in privateReferralRoutes), slot-opened alert, work-email OTP, error alerting. The referrer "Email when a new ask arrives" toggle lives in the setup wizard (the review-delivery grant).
- No per-user notification settings table, no quiet hours, no push, no digest.

## Part A: notification kinds (in-app only, low risk)
- Add nullable `kind` varchar(32) and `refId` int to `notifications` (guarded additive DDL in `drizzle/deploy/`, DESIRED_COLUMNS entries). Old rows stay null and render by category exactly as now.
- Kinds: ask_new, ask_accepted, ask_passed, ask_claimed, ask_expiring, message_new, credits_added, coverage_credit, safety_notice, system.
- Insert sites pass a kind and refId; `/alerts` maps kind to the kit icon (Clock3 for expiring) and destination (thread for accepted/message/expiring). Titles and bodies do not change in this part.
- Sends nothing new. Safe to ship first once approved.

## Part B: preferences (the decision-heavy part)
Table `notificationPreferences` (userId unique; emailNewAsk, emailExpiryReminder, emailDigest, pushNewAsk, quietStart, quietEnd, timezone, updatedAt). GET/PUT `/api/notification-preferences`, Settings > Notifications tab, "Manage notifications" footer link on /alerts.

Defaults must preserve today's behaviour: every user keeps exactly the email they get now. A new preference never turns on a new email by default.

### Proposed matrix (founder to approve each row)
| Event | In-app | Email | Can the user turn email off? |
|---|---|---|---|
| New ask arrives (referrer) | yes | yes, today's review email, existing consent gate | yes (existing toggle, kept) |
| Ask accepted / passed / claimed (seeker) | yes | yes, today's emails | proposal: yes for passed/claimed, NOT for accepted (it spends or returns nothing but is the core outcome) - founder call |
| New message / DM | yes | no (stays in-app only) | n/a |
| Ask expiring in 1 day | yes | NEW email reminder, opt-IN (default off) | yes |
| Credits added / coverage credit | yes | no | n/a |
| Safety, account and payment notices | yes | yes | NO, always sent |
| OTP, sign-in, data export | n/a | transactional, always | NO |
| Daily digest | n/a | NEW, opt-IN (default off), replaces individual new-ask emails when on | yes |

Quiet hours apply to push and digest timing only. Transactional and safety email ignore them. Credit and payment notices are never suppressed by any preference.

### Dispatcher
One `dispatchNotification(userId, kind, payload)` that writes the in-app row and then consults preferences for the email/push channel. Fail-open on a preferences read error: send the notification the user gets today. Safety/payment kinds bypass preferences by construction (a hard allowlist in code, with a test).

## Out of scope / needs other decisions
- Web push (task 24) needs the owner VAPID keys; not part of 21.
- Reminder and digest jobs (task 22 notification-reminder-jobs) are sends to real users: a separate design and approval each.
- Email templates (task 22) and all copy: founder approves before any user-facing ship. Kit copy ("Your ask was accepted", "A verified referrer at <company> accepted") differs from current server copy; changing it is a copy decision.
- Unsubscribe link and legal footer for non-transactional email: legal batch.

## Ship plan
1. Part A (kinds, in-app only, API-affecting, own deploy).
2. Part B preferences table + settings tab with ONLY existing behaviours (new-ask email toggle moved/mirrored, always-sent note). No new email.
3. Expiry reminder and digest only after founder approval of copy, schedule, and opt-in default.

## Questions for the founder
1. Approve the matrix above, especially: can a seeker turn off the "accepted" email?
2. Expiry reminder and digest: ship at all now? Opt-in default off OK?
3. Kit notification copy vs current server copy: switch to kit copy?
4. Unsubscribe/footer wording for non-transactional email (legal).
