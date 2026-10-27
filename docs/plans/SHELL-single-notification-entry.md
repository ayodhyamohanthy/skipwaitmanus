# SHELL-single-notification-entry

## Current defect and bounded evidence

Source at 86c141da: AppShell supplies AccountMenu to GoalShell; AccountMenu contains NotificationBell; GoalShell also adds its own Alerts bell. On mobile this gives two visible notification controls. Desktop also needs inspection because AccountSlot is in the rail. Designer's referrer-overview fixture showed both icons; source does not prove current production or released-home reachability. This is pre-existing, not a #743/#575 recovery regression. Keep those lanes separate.

Current route contract: App.tsx redirects /notifications to /alerts. /alerts defaults to Notifications and reads /api/notifications, as does NotificationBell. Preserve this convergence and redirect; no new destination based on a visual suggestion. Qualify behavior against current source before implementation.

## Ownership and order

Wait for D-048-F-shell-parts and D-222-referral-count-shell (which waits on pricing). Existing shell-parts owns goal-token cleanup of AccountMenu and NotificationBell; this row owns the integrated wiring and single-control outcome. Avoid parallel writers.

Owns: client/src/components/AppShell.tsx, client/src/components/goal/GoalShell.tsx, client/src/components/AccountMenu.tsx, client/src/components/NotificationBell.tsx, client/src/components/singleNotificationEntry.test.tsx, design/goal-ui/captures/single-notification/**.

## Acceptance

- One visible notification entry in the signed-in shell at 390 and 1280. Preserve the existing menu entries unless current decisions explicitly change them; do not conflate the open account-menu entry with duplicate always-visible bells.
- Use goal tokens, no literal-color reintroduction. Preserve unread count and its capped visual/accessibility labeling, current notification fetch/refresh behavior, signed-out hiding, keyboard access, account/sign-out functionality, privacy clearing and role-aware destinations inside Alerts.
- Red-first integrated test proves duplicate visible controls before the correction and one afterward. Cover signed-in seeker/referrer, signed-out/auth-loading, unread/zero/load-error states, canonical route plus /notifications redirect. Failure must not falsely claim zero unread merely to hide a control.
- Verify remaining-referral count from D222 stays visible and no purchase affordance appears on referrer surfaces.
- Capture and inspect actual pixels at 390 and1280, account-menu closed/open and unread/error states. Check current released home when it actually uses these components; otherwise record non-reachability and a real shell route. Live impact requires live proof, not source inference.
- Run existing account-menu, notification, shell and goal-boundary tests, typecheck and required CI. Independent functional review and designer pixels before acceptance. No flags, billing/auth rules, production writes, OTP or notification sends.
