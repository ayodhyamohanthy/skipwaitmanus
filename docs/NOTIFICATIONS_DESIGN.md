# Task 21 design: notification kinds + preferences (design; part A live)

Status (Oct 18 2026): part A (kinds) is live (#238, migration 0087) and the Settings switch for the existing new-ask email is on `main` (client only, default unchanged; `client/src/components/settings/NewAskEmailRow.tsx`). D-060 decides the email for every action pending on a user's side (section below); each of those emails ships with its owning decision's slice (plan row D-060-pending-action-emails). The rest of the matrix and all user-facing copy still await founder approval; no other new email until approved.

## What exists today (read from main)
- In-app: `notifications` rows with a 4-value `category` (referral, message, status, system) and free-text title/body. ~17 insert sites in `server/db.ts` (accept/pass, new request, private referral messages, DMs, coverage credit, credits added, employer access). `/alerts` picks icon and destination from the category only.
- Email (ZeptoMail via `server/emailDelivery.ts`): referrer review email and Slack delivery (`referralReviewDeliveries`, consent-gated), seeker emails on accept/pass/claimed (`notifyEmail` in privateReferralRoutes), slot-opened alert, work-email OTP, error alerting. The referrer "Email when a new ask arrives" toggle lives in the setup wizard (the review-delivery grant).
- No per-user notification settings table, no quiet hours, no push, no digest.

## D-060: pending actions are emailed (owner, Oct 18 2026)
Owner, verbatim: "always email users if any action is pending from their side". Each pending action sends one transactional email with a direct link:
- Seeker: add a credit to release a held ask (D-047), set a password (D-049). D-174 suspends the D-061 day-30 confirmation of a waiting ask for launch; it was never built, so the runtime sends no such email. There is no "send again" after a pass (D-147 rejected D-035).
- Referrer: new or expiring asks, a claim about to lapse or an accepted ask to mark as referred (D-038), a new work email to verify (D-057).

Guardrails (changeable): reminders only as the owning decision names them; at most one such email per person per day (a digest beyond that); notification preferences respected (this task); truthful copy with no false urgency; sent from SkipWait's own sender.

## Part A: notification kinds (in-app only, low risk)
- Add nullable `kind` varchar(32) and `refId` int to `notifications` (guarded additive DDL in `drizzle/deploy/`, DESIRED_COLUMNS entries). Old rows stay null and render by category exactly as now.
- Kinds: ask_new, ask_accepted, ask_passed, ask_claimed, ask_expiring, message_new, credits_added, coverage_credit, safety_notice, system.
- Insert sites pass a kind and refId; `/alerts` maps kind to the kit icon (Clock3 for expiring) and destination (thread for accepted/message/expiring). Titles and bodies do not change in this part.
- Sends nothing new. Safe to ship first once approved.

## Part B: preferences (the decision-heavy part)
Table `notificationPreferences` (userId unique; emailNewAsk, emailExpiryReminder, emailDigest, pushNewAsk, quietStart, quietEnd, timezone, updatedAt). GET/PUT `/api/notification-preferences`, Settings > Notifications tab, "Manage notifications" footer link on /alerts.

Defaults must preserve today's behaviour: every user keeps exactly the email they get now. A new preference never turns on a new email by default. Exception: the D-060 pending-action emails are sent by default, each with its owning decision's slice; preferences still apply to them.

### Proposed matrix (founder to approve each row)
| Event | In-app | Email | Can the user turn email off? |
|---|---|---|---|
| New ask arrives (referrer) | yes | yes, today's review email, existing consent gate | yes (existing toggle, kept) |
| Ask accepted / passed / claimed (seeker) | yes | yes, today's emails | proposal: yes for passed/claimed, NOT for accepted (it spends or returns nothing but is the core outcome) - founder call |
| New message / DM | yes | no (stays in-app only) | n/a |
| Ask expiring in 1 day (runtime only, until `D-174-expiry-clock-removal` lands; D-174: asks do not expire) | yes | referrer who can act on it: yes, pending action (D-060); no seeker reminder | yes |
| Credits added / coverage credit | yes | no | n/a |
| Safety, account and payment notices | yes | yes | NO, always sent |
| OTP, sign-in, data export | n/a | transactional, always | NO |
| Any other action pending on the user's side (D-060 list above) | yes | yes, one transactional email with a direct link (D-060) | yes, preferences respected (D-060) |
| Daily digest | n/a | D-060: at most one pending-action email per person per day, a digest beyond that | yes, preferences respected (D-060) |

Quiet hours apply to push and digest timing only. Transactional and safety email ignore them. Credit and payment notices are never suppressed by any preference.

### Dispatcher
One `dispatchNotification(userId, kind, payload)` that writes the in-app row and then consults preferences for the email/push channel. Fail-open on a preferences read error: send the notification the user gets today. Safety/payment kinds bypass preferences by construction (a hard allowlist in code, with a test).

## Out of scope / needs other decisions
- Web push (task 24) needs the owner VAPID keys; not part of 21.
- Reminder and digest jobs (task 22 notification-reminder-jobs) are sends to real users: a separate design and approval each, except the pending-action reminders and digest D-060 approves, as their owning decisions name them (D-038: the 24 h claim reminder and the day-2 and day-4 "Referred" reminders).
- Email templates (task 22) and all copy: founder approves before any user-facing ship. Kit v4 is retired (D-120), so its notification copy is history, not a target; any change to server copy is a copy decision and uses referral wording (D-180).
- Unsubscribe link and legal footer for non-transactional email: legal batch.

## Ship plan
1. Part A (kinds, in-app only, API-affecting, own deploy).
2. Part B preferences table + settings tab with ONLY existing behaviours (new-ask email toggle moved/mirrored, always-sent note). No new email.
3. D-060 pending-action emails and their digest ship with each owning decision's slice.

## Questions for the founder
1. Approve the matrix above, especially: can a seeker turn off the "accepted" email?
2. Unsubscribe/footer wording for non-transactional email (legal).
