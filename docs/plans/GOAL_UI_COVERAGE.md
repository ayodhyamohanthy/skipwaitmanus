# GOAL_UI_COVERAGE: every page and every component has exactly one goal-redesign row (D-167)

> Read `docs/BRIEF.md`, then `design/goal-ui/DOCTRINE.md`, then this file. It is the catalogue the D-048 rows are checked against, the packet for the rows it defines in §6, and the place a new route or component gets its owner. It never replaces a row's own packet.

| Field | Value |
|---|---|
| Decisions | D-150 (a real goal redesign, UI and UX, landing to admin; never a recolour), D-149 (in place only with a parity check and a Tier 1 review), D-120, D-071 (approved comps), D-134 (rows, lanes, owns), D-151, D-166, D-167 |
| Verified against | `main` `dd849c48` (Oct 23 2026): `client/src/App.tsx` routes, every `.tsx` under `client/src/components/` (goal and `ui` primitives excluded), and their importers under `client/src/pages/` |
| Rows defined here | `D-048-F-goal-check`, `D-048-F-shell-parts`, `D-048-F-coverage`, `D-048-p3-skippy`, `D-048-p3-agents` |

## 0. Where we are (measured Oct 23)
- **12 of 98 page files** import the goal components; **35 still import the kit** (`components/kit/*`), and the rest use their own legacy markup.
- `kit/button.tsx` is imported by 39 pages and `kit/preview-kit.tsx` by 19.
- Of the 94 routes, the pages redesigned to the doctrine are the signed-out landing (`/`, V9) and My asks (`/requests`, #533). Six more went live in place as recolours that D-150 says do not count yet (`/explore`, `/explore/:slug`, `/ask`, `/queue`, the seeker `/conversation`), and their redesign rows are queued.
- Seven routes had **no row anywhere** until this file: `/skippy`, `/agents`, `/reviewer-sign-in`, `/company/claim`, `/company/dashboard/:slug`, `/admin/money-check` and `/admin/skippie`. §2 gives each an owner. The three guide pages were already covered by `D-048-p3-policy`.

## 1. Definition of moved (D-150, made executable)
A page or component counts as moved only when **all** of these hold, on its own pull request.
1. **Goal line first.** The page opens with one `h1` in the user's words: what they are here to get done ("Get referred.", "Get referred at {Company}.", "Get your asks answered."). The goal line comes from its row in `docs/plans/GOAL_UI_MIGRATION.md`'s contract table, or the row proposes one there in the same PR and its captures go to the owner (D-150).
2. **One next step.** One "Your next step" block (`GoalNextStep`, §6.1) holds **exactly one** black commit (`GoalButton variant="primary"`, which renders `data-g-primary`). Everything else is ghost or a plain link.
3. **Status is a dot and text** (`GoalStatus`), and **the cost shows before every ask** (the shared cost line in `shared/moneyCopy.ts`).
4. **No kit, no recolour.** The page module and every component it renders import nothing from `components/kit/*`, `components/ui/*` or `styles/kit.css`. Goal tokens only (`node scripts/design-token-audit.mjs`).
5. **The flow is rebuilt, not repainted.** The PR states the user's steps to the goal before and after, in clicks or screens. It also lists every function of the old page as kept or consciously dropped with a reason (the D-149 parity list), and every behaviour test it ported. A PR whose step count, layout order and copy are unchanged, with only colours swapped, fails review (D-150).
6. **Proof.** Captures at 1280 and 390 from fictional fixtures, matching the approved comp where one exists (`design/goal-ui/pick/`), plus every state: loading, empty, error, offline (team rule 8).
7. **The test says so.** The page exports `GOAL_PAGE = { goalLine: "..." }`. Its test calls `assertGoalPage(container, GOAL_PAGE)` (§6.1), and `goalPagesBoundary.test.ts` (§6.1) checks its imports.
8. **Review.** Tier 1 surfaces (money, sign-in, identity, privacy, decisions, asks) get an independent review before landing (D-074, D-149, D-151), and reviewers check items 1-7 by name.

## 2. Every route and its owning row
Rows marked "to be added by its lane packet" exist in `docs/plans/D-048-phase-3-split.md` and enter `docs/plans/assignments.json` when their lane packet lands (D-134). Redirects and the DEV-only showcase have no UI to move.

| Route | Page | Owning row(s) | Row state |
|---|---|---|---|
| `/` | `pages/Home` | `D-048-p3-home`, `D-048-p3-home-signed-in` | D-048-p3-home: done; D-048-p3-home-signed-in: to be added by its lane packet |
| `/fast/:linkCode` | `pages/FastTrackLink` | `D-048-p3-links` | D-048-p3-links: to be added by its lane packet |
| `/refer/:companySlug/:vanityAlias` | `pages/VanityFastTrackLink` | `D-048-p3-links` | D-048-p3-links: to be added by its lane packet |
| `/share-card/:token` | `pages/ShareCard` | `D-048-p3-links` | D-048-p3-links: to be added by its lane packet |
| `/email-review/:linkToken` | `pages/EmailReviewAction` | `D-048-p3-email-review` | D-048-p3-email-review: todo |
| `/start` | `pages/Onboarding` | `D-048-p3-start` | D-048-p3-start: todo |
| `/request` | — | none: redirect to /ask | — |
| `/requests` | `pages/MyRequests` | `D-048-p3-live-review-requests` | D-048-p3-live-review-requests: done |
| `/verify` | `pages/Verify` | `D-048-p3-verify` | D-048-p3-verify: to be added by its lane packet |
| `/ask` | `pages/Ask` | `D-174-seeker-journey-build`, `D-048-p3-live-review-find` | D-174-seeker-journey-build builds the journey (D-189 packet), then D-048-p3-live-review-find does the doctrine acceptance (D-193 (5)) |
| `/explore` | `pages/Explore` | `D-174-seeker-journey-build`, `D-048-p3-live-review-find` | D-174-seeker-journey-build builds the journey (D-189 packet), then D-048-p3-live-review-find does the doctrine acceptance (D-193 (5)) |
| `/explore/:slug` | `pages/ExploreCompany` | `D-174-seeker-journey-build`, `D-048-p3-live-review-find` | D-174-seeker-journey-build builds the journey (D-189 packet), then D-048-p3-live-review-find does the doctrine acceptance (D-193 (5)) |
| `/alerts` | `pages/Alerts` | `D-048-p3-alerts` | D-048-p3-alerts: to be added by its lane packet |
| `/notifications` | — | none: redirect to /alerts | — |
| `/onboarding` | `pages/ProfileSetup` | `D-048-p3-onboarding` | D-048-p3-onboarding: todo |
| `/profile` | `pages/Profile` | `D-048-p3-profile` | D-048-p3-profile: to be added by its lane packet |
| `/work` | `pages/Work` | `D-048-p3-profile` | D-048-p3-profile: to be added by its lane packet |
| `/p/:handle` | `pages/PublicProfile` | `D-048-p3-public-profile` | D-048-p3-public-profile: to be added by its lane packet |
| `/referrer-home` | `pages/ReferrerHome` | `D-048-p3-referrer-home` | D-048-p3-referrer-home: todo |
| `/invite` | `pages/Invite` | `D-048-p3-invite` | D-048-p3-invite: todo |
| `/referrer-setup` | `pages/ReferrerSetup` | `D-048-p3-referrer-home` | D-048-p3-referrer-home: todo |
| `/safety` | `pages/Safety` | `D-048-p3-support` | D-048-p3-support: to be added by its lane packet |
| `/help` | `pages/Help` | `D-048-p3-support` | D-048-p3-support: to be added by its lane packet |
| `/landed` | `pages/Landed` | `D-048-p3-seeker-small` | D-048-p3-seeker-small: todo |
| `/sign-in` | `pages/SignIn` | `D-048-p3-signin` | D-048-p3-signin: to be added by its lane packet |
| `/reviewer-sign-in` | `pages/ReviewerSignIn` | `D-048-p3-signin` (D-167) | D-048-p3-signin: to be added by its lane packet |
| `/report` | `pages/Report` | `D-048-p3-support` | D-048-p3-support: to be added by its lane packet |
| `/suggest-company` | `pages/SuggestCompany` | `D-048-p3-seeker-small` | D-048-p3-seeker-small: todo |
| `/company/claim` | `pages/CompanyClaim` | `D-048-p3-for-companies` (D-167) | D-048-p3-for-companies: to be added by its lane packet |
| `/company/dashboard/:slug` | `pages/CompanyClaim` | `D-048-p3-for-companies` (D-167) | D-048-p3-for-companies: to be added by its lane packet |
| `/for-companies` | `pages/ForCompanies` | `D-048-p3-for-companies` | D-048-p3-for-companies: to be added by its lane packet |
| `/admin-review` | `pages/AdminReview` | `D-048-p3-admin` | D-048-p3-admin: to be added by its lane packet |
| `/app-states` | `pages/AppStates` | `D-048-p3-system` | D-048-p3-system: to be added by its lane packet |
| `/emails` | `pages/Emails` | `D-048-p3-system` | D-048-p3-system: to be added by its lane packet |
| `/developers` | `pages/Developers` | `D-048-p3-dev` | D-048-p3-dev: to be added by its lane packet |
| `/assistants` | `pages/Assistants` | `D-048-p3-assistants` | D-048-p3-assistants: todo |
| `/skippy` | `pages/Skippy` | `D-048-p3-skippy` (D-167) | D-048-p3-skippy: to be added by its lane packet |
| `/agents` | `pages/SeekerAgents` | `D-048-p3-agents` (D-167) | D-048-p3-agents: to be added by its lane packet |
| `/approve` | `pages/Approve` | `D-048-p3-assistants` | D-048-p3-assistants: todo |
| `/connect-assistant` | `pages/ConnectAssistant` | `D-048-p3-assistants` | D-048-p3-assistants: todo |
| `/developer-console` | `pages/DeveloperConsole` | `D-048-p3-dev` | D-048-p3-dev: to be added by its lane packet |
| `/forgot-password` | `pages/ForgotPassword` | `D-048-p3-signin` | D-048-p3-signin: to be added by its lane packet |
| `/reset-password` | `pages/ResetPassword` | `D-048-p3-signin` | D-048-p3-signin: to be added by its lane packet |
| `/wallet` | — | none: redirect to /plans | — |
| `/thread` | `ThreadListAlias` | `D-048-p3-inbox` | D-048-p3-inbox: todo |
| `/thread/:requestId` | `ThreadDetailAlias` | `D-048-p3-conversation`, `D-048-p3-live-review-conversation` | D-048-p3-conversation: todo; D-048-p3-live-review-conversation: todo |
| `/conversation/:requestId` | `pages/ReferralConversation` | `D-048-p3-conversation`, `D-048-p3-live-review-conversation` | D-048-p3-conversation: todo; D-048-p3-live-review-conversation: todo |
| `/messages` | `pages/Messages` | `D-048-p3-messages` | D-048-p3-messages: to be added by its lane packet |
| `/share` | `pages/ShareHub` | `D-048-p3-seeker-small` | D-048-p3-seeker-small: todo |
| `/inbox` | `pages/UnifiedInbox` | `D-048-p3-inbox` | D-048-p3-inbox: todo |
| `/queue` | `pages/MyCompanyInbox` | `D-048-p3-live-review-queue` | D-048-p3-live-review-queue: todo |
| `/settings` | `pages/Settings` | `D-048-p3-settings` | D-048-p3-settings: to be added by its lane packet |
| `/referrer` | `pages/Referrer` | `D-048-p3-referrer` | D-048-p3-referrer: todo |
| `/referrer/impact` | `pages/ReferrerImpact` | `D-048-p3-referrer` | D-048-p3-referrer: todo |
| `/premium` | `pages/Premium` | `D-048-p3-premium` | D-048-p3-premium: to be added by its lane packet |
| `/plans` | `?` | `D-048-p3-plans` | D-048-p3-plans: to be added by its lane packet |
| `/billing` | `pages/Billing` | `D-048-p3-plans` | D-048-p3-plans: to be added by its lane packet |
| `/privacy` | `pages/TrustPrivacy` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/terms` | `pages/Terms` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/refunds` | `pages/RefundPolicy` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/shipping` | `pages/ShippingPolicy` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/cancellations` | `pages/CancellationPolicy` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/about` | `pages/About` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/contact` | `pages/Contact` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/pricing` | `pages/Pricing` | `D-048-p3-pricing` | D-048-p3-pricing: to be added by its lane packet |
| `/support` | `pages/Support` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/guidelines` | `pages/Guidelines` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/job-referral-platforms` | `pages/GuidePage` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/choosing-a-job-referral-platform` | `pages/GuidePage` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/how-employees-refer-candidates` | `pages/GuidePage` | `D-048-p3-policy` | D-048-p3-policy: to be added by its lane packet |
| `/offline` | `pages/Offline` | `D-048-p3-system` | D-048-p3-system: to be added by its lane packet |
| `/wall` | `pages/OpportunityWall` | `D-048-p3-discovery` | D-048-p3-discovery: to be added by its lane packet |
| `/jobs` | `pages/JobExplorer` | `D-048-p3-discovery` | D-048-p3-discovery: to be added by its lane packet |
| `/employer` | `pages/EmployerDashboard` | `D-048-p3-employer` | D-048-p3-employer: to be added by its lane packet |
| `/employer/talent` | `pages/TalentDiscovery` | `D-048-p3-employer-talent` | D-048-p3-employer-talent: to be added by its lane packet |
| `/employer/billing` | `pages/EmployerBilling` | `D-048-p3-employer-billing` | D-048-p3-employer-billing: to be added by its lane packet |
| `/employer/opportunities` | `pages/EmployerOpportunities` | `D-048-p3-employer` | D-048-p3-employer: to be added by its lane packet |
| `/admin` | `pages/AdminOverview` | `D-048-p3-admin` | D-048-p3-admin: to be added by its lane packet |
| `/admin/partners` | `pages/AdminPartners` | `D-048-p3-admin-ops` | D-048-p3-admin-ops: to be added by its lane packet |
| `/post-opportunity` | `pages/PostOpportunity` | `D-048-p3-post` | D-048-p3-post: todo |
| `/admin/activity` | `pages/AdminActivity` | `D-048-p3-admin-ops` | D-048-p3-admin-ops: to be added by its lane packet |
| `/admin/approvals` | `pages/AdminApprovalQueue` | `D-048-p3-admin-approvals` | D-048-p3-admin-approvals: to be added by its lane packet |
| `/admin/approvals/:kind/:id` | `pages/AdminApprovalRecord` | `D-048-p3-admin-approvals` | D-048-p3-admin-approvals: to be added by its lane packet |
| `/admin/payments` | `pages/AdminPaymentsReview` | `D-048-p3-admin-money` | D-048-p3-admin-money: to be added by its lane packet |
| `/admin/catalog-sync` | `pages/AdminCatalogSync` | `D-048-p3-admin-money` | D-048-p3-admin-money: to be added by its lane packet |
| `/admin/privacy-requests` | `pages/AdminPrivacyRequests` | `D-048-p3-admin-people` | D-048-p3-admin-people: to be added by its lane packet |
| `/admin/flow-health` | `pages/AdminFlowHealth` | `D-048-p3-admin-ops` | D-048-p3-admin-ops: to be added by its lane packet |
| `/admin/token-recovery` | `pages/AdminTokenRecovery` | `D-048-p3-admin-money` | D-048-p3-admin-money: to be added by its lane packet |
| `/admin/users` | `pages/AdminUsers` | `D-048-p3-admin-people` | D-048-p3-admin-people: to be added by its lane packet |
| `/admin/schema` | `pages/AdminSchema` | `D-048-p3-admin-ops` | D-048-p3-admin-ops: to be added by its lane packet |
| `/admin/smoke` | `pages/AdminSmoke` | `D-048-p3-admin-ops` | D-048-p3-admin-ops: to be added by its lane packet |
| `/admin/money-check` | `pages/AdminMoneyCheck` | `D-048-p3-admin-money` (D-167) | D-048-p3-admin-money: to be added by its lane packet |
| `/admin/skippie` | `pages/AdminSkippie` | `D-048-p3-admin-ops` (D-167) | D-048-p3-admin-ops: to be added by its lane packet |
| `/components` | — | none: DEV-only showcase, never shipped | — |

## 3. Shared components (used by two or more pages) and their owners
A component is redesigned once, by its owner row; the other rows that use it wait for that row or keep the old one until it lands. They never edit it.

| Component | Used by | Owner row | Rule |
|---|---|---|---|
| `kit/button.tsx`, `kit/preview-kit.tsx`, `kit/status-pill.tsx` | 39, 19 and 2 pages | none: each page row replaces its own use with `GoalButton`, goal states and `GoalStatus` | Deleted by `D-048-K-kit` once its last importer moves; `D-048-F-coverage` prints how many importers remain |
| `AccountMenu.tsx`, `NotificationBell.tsx`, `BetaNotice.tsx`, `CookieConsent.tsx` | every signed-in page; the landing and `/settings` | `D-048-F-shell-parts` (new, §6.2) | Shell-wide, so they move before the surfaces that show them |
| `AdminNav.tsx`, `Brand.tsx` (in admin), `admin/AdminSignInCta.tsx`, `StatusBadge.tsx` | 13, 20, 6 and 4 admin pages | `D-048-p3-admin` (the admin goal frame) | The other admin rows depend on it |
| `PolicyPageShell.tsx` | 11 policy, about, contact, pricing and guide pages | `D-048-p3-policy` | The legal words stay the owner's (D-001's lasting rule) |
| `app-states/SystemStates.tsx` | 15 pages and `App.tsx` | `D-048-p3-system` (the `/app-states` gallery) | Each page row swaps its own loading, error and empty use to `GoalStates`; `SystemStates` retires in `D-048-K-kit` |
| `ActionErrorCard.tsx`, `LoadingSkeleton.tsx` | 3 pages each | none: replaced by `GoalStates` in each page row | Retire in `D-048-K-kit` |
| `SeekerSignIn.tsx`, `ReferrerOtpSignIn.tsx` | sign-in, the goal sign-in, `/referrer`, company claim | `D-048-p3-signin` | Login rule pins stay green (D-030, `loginRule.test.tsx`) |
| `WorkEmailSignIn.tsx` | `/email-review`, `/referrer` | `D-048-p3-verify` | Work-email code only (D-030) |
| `ask/PinnedWorkPicker.tsx` | `/ask`, the drawer, the composer | `D-048-p3-live-review-find` | |
| `OneTapShareActions.tsx` | `/wall`, `/referrer` | `D-048-p3-referrer` | `D-048-p3-discovery` adopts it after |
| `profile/ProfileLinkSheet.tsx`, `profile/VisibilityOptions.tsx` | `/profile`, `/work`, `/p/:handle` | `D-048-p3-profile` | `D-048-p3-public-profile` adopts after |
| `referrer/ReferrerSetupDialog.tsx`, `referrer/ReferrerWorkspace.tsx` | `/referrer`, `/referrer/impact` | `D-048-p3-referrer` | |
| `thread/ThreadDecisionPanels.tsx`, `thread/ThreadModal.tsx` | both sides of `/conversation` | `D-048-p3-conversation` (referrer side) | `D-048-p3-live-review-conversation` (seeker side) adopts after |
| `AppShell.tsx` | `App.tsx` and the system pages | `D-048-F-credits` (shell meta and credits) | W0 already moved its frame (#361) |

## 4. Single-page components move with their page's row
Each listed component is redesigned by the row that owns its page (§2), in the same PR, one component per commit where the row is large. A component not listed here or in §3 must get an owner in this file before anyone edits it.

- `App.tsx`: `ErrorBoundary.tsx`, `PwaStatus.tsx`
- `pages/AdminFlowHealth.tsx`: `admin/BaselineMetricsPanel.tsx`
- `pages/AdminOverview.tsx`: `admin/AdminOverviewView.tsx`, `admin/AdminSectionViews.tsx`, `admin/AdminShell.tsx`
- `pages/AdminPaymentsReview.tsx`: `admin/PaymentReviewRow.tsx`
- `pages/AdminReview.tsx`: `admin/ReviewCaseDetail.tsx`
- `pages/Alerts.tsx`: `alerts/NotificationGroups.tsx`, `alerts/SavedAlerts.tsx`
- `pages/AppStates.tsx`: `app-states/DeviceStates.tsx`
- `pages/Approve.tsx`: `assistants/ApprovalSheet.tsx`
- `pages/Assistants.tsx`: `assistants/AssistantPanels.tsx`
- `pages/Billing.tsx`: `plans/BillingPanels.tsx`, `plans/CancelPlanDialog.tsx`, `plans/KitDialog.tsx`
- `pages/CompanyClaim.tsx`: `explore/CompanyResponseSignal.tsx`
- `pages/ComponentShowcase.tsx`: `AIChatBox.tsx`
- `pages/DeveloperConsole.tsx`: `developers/AppDetails.tsx`, `developers/RegisterAppForm.tsx`
- `pages/EmployerDashboard.tsx`: `employer/EmployerFrame.tsx`, `employer/EmployerOverview.tsx`
- `pages/Home.tsx`: `VisualJourney.tsx`
- `pages/Invite.tsx`: `referrer-home/CompanyRequestPanel.tsx`, `referrer-home/InviteLinkPanel.tsx`
- `pages/Landed.tsx`: `requests/RequestStates.tsx`
- `pages/Messages.tsx`: `FollowButton.tsx`, `messages/ReferrerRuleCard.tsx`
- `pages/OpportunityWall.tsx`: `PartnerModuleCard.tsx`, `ZeroActivityShareCard.tsx`
- `pages/Plans.tsx`: `plans/PendingCheckoutReturn.tsx`, `plans/PlanCards.tsx`, `plans/PlansCredits.tsx`, `plans/PlansKitSections.tsx`, `plans/PlansReference.tsx`, `plans/UpgradeMoments.tsx`
- `pages/PostOpportunity.tsx`: `opportunities/MyOpenings.tsx`
- `pages/Profile.tsx`: `profile/PrivacyControls.tsx`, `profile/ProfileForm.tsx`
- `pages/PublicProfile.tsx`: `profile/PublicWorkGrid.tsx`
- `pages/ReferralConversation.tsx`: `thread/ShareWinCard.tsx`, `thread/ThreadMain.tsx`
- `pages/ReferralRequest.tsx`: `SeekerCreditsCard.tsx`
- `pages/Referrer.tsx`: `referrer/CapacitySettingsPanel.tsx`, `referrer/ClaimedReview.tsx`, `referrer/CoverageInviteBanner.tsx`, `referrer/ReferrerOverview.tsx`, `referrer/ReferrerSignInDialog.tsx`
- `pages/ReferrerHome.tsx`: `referrer-home/HomeAside.tsx`, `referrer-home/ReferrerSampleRows.tsx`, `referrer-home/ShareImpactCard.tsx`, `referrer-home/WaitingAsks.tsx`
- `pages/ReferrerSetup.tsx`: `referrer-home/SetupWizard.tsx`
- `pages/Settings.tsx`: `settings/AccountPanels.tsx`, `settings/AppPanel.tsx`, `settings/BlockedPeople.tsx`, `settings/NewAskEmailRow.tsx`, `settings/NotificationPanels.tsx`, `settings/PrivacyPanels.tsx`, `settings/RegionPanel.tsx`, `settings/SettingsNav.tsx`, `settings/SlackReviewAlerts.tsx`, `settings/TalentConsentPanel.tsx`, `settings/settingsUi.tsx`
- `pages/UnifiedInbox.tsx`: `inbox/InboxThreadList.tsx`
- `pages/Verify.tsx`: `verify/VerifyPanels.tsx`
- `pages/Work.tsx`: `profile/AddWorkSheet.tsx`, `profile/WorkCard.tsx`

## 5. Components nothing imports (retire, do not redesign)
`DisplayPrefsSync.tsx`, `ReferrerCreditsCard.tsx`, `ReferrerFastTrackCard.tsx`, `RequestStatusTimeline.tsx`, `requests/RequestRow.tsx` and `requests/RequestSummary.tsx` had no importer under `client/src/pages/` on `dd849c48`. `D-048-K-kit` re-checks each with `git grep`, including imports from `App.tsx`, `main.tsx` and tests, and deletes it only if it is still unused.

## 6. Rows defined here
### 6.1 `D-048-F-goal-check` (Tier 2, lane `design-check`, after `D-048-F-primitives`)
- **New** `client/src/components/goal/GoalNextStep.tsx`: the "Your next step" block (a `section` with `aria-labelledby` pointing to its heading "Your next step", a one-line reason and a single child slot for the commit). Promote it from the block in `client/src/pages/MyRequests.tsx` without editing that page. Export it from `client/src/components/goal/index.ts` (one line).
- **New** `client/src/test/goalPageContract.ts`: `assertGoalPage(container, { goalLine })` fails unless all of these hold:
  - there is exactly one `h1` and its text equals `goalLine`;
  - exactly one element carries `data-g-primary`, and it sits inside the `GoalNextStep` region;
  - no element carries a class defined in `client/src/styles/kit.css`. Read the class selectors from that file at test time; kit classes share no prefix (`.credit-…`, `.plan-…`, `.work-…`).
- **New** `client/src/test/goalPagesBoundary.test.ts`: it finds every page under `client/src/pages/` that exports `GOAL_PAGE` and fails if that file, or any component it imports from `client/src/components/` (one level deep), imports `components/kit/*`, `components/ui/*` or `styles/kit.css`. The test lives in its own file so it never edits `goalBoundary.test.ts`, which `D-048-F-flags` owns.
- **Tests first:** `goalPageContract.test.tsx` renders fixtures that pass, and fixtures that fail for each rule (two `h1`, two primaries, a primary outside the next-step block, a class from `kit.css`).
- **Owns:** the four files above, plus `client/src/components/goal/index.ts (switch only)`.

### 6.2 `D-048-F-shell-parts` (Tier 2, lane `design-shell`, after `D-048-F-credits` and `D-048-F-goal-check`)
- Redesign `AccountMenu.tsx`, `NotificationBell.tsx`, `BetaNotice.tsx` and `CookieConsent.tsx` with goal primitives and tokens only.
  - Behaviour is unchanged: the same menu entries and links; the bell's count, routing and polling as today; the beta notice's dismissal; and the cookie choices with `applyAnalyticsConsent` exactly as today.
  - Every existing test is kept, and captures are taken on a signed-in page and on the landing.
- **Owns:** the four components and their tests.

### 6.3 `D-048-F-coverage` (Tier 3, lane `design-check`, after `D-048-F-goal-check`)
- **New** `scripts/goalUiCoverage.test.ts`. It reads the routes in `client/src/App.tsx` and the route table in §2. It fails when:
  - a route has no line in the table;
  - a line names a row that is neither in `docs/plans/assignments.json` nor in the split's table;
  - a `.tsx` under `client/src/components/` (goal and `ui` excluded) appears in neither §3, §4 nor §5.
- It prints, without failing, the number of pages that still import `components/kit/*`.
- **Owns:** `scripts/goalUiCoverage.test.ts`. A PR that adds a route or a component must then add its line here, and this file becomes one of that PR's owned paths.

### 6.4 `D-048-p3-skippy` (Tier 1, lane `d048-skippy`)
- **Scope:** `/skippy`, the seeker's assistant chat (`client/src/pages/Skippy.tsx`, 234 lines, which imports no shared component).
- **Goal line (proposed, recorded in the contract table by the builder):** "Get your ask ready." **Next step:** "Send it", which uses the normal ask path and shows its cost first (D-144).
- **Holds:** behind `SKIPPIE_SEEKER_ENABLED` (off); the Skippy findings on #520 (`SKIPPY-fix`) land first. This row depends on `REGISTER-520`, and the CEO adds `SKIPPY-fix` to its `dependsOn` once that row exists on `main`.
- **Owns:** `client/src/pages/Skippy.tsx` and `client/src/pages/Skippy.test.tsx`.

### 6.5 `D-048-p3-agents` (Tier 1, lane `d048-agents`)
- **Scope:** `/agents`, the seeker's agent grants (`client/src/pages/SeekerAgents.tsx`, 197 lines).
- **Goal line (proposed):** "Let an assistant help, on your terms." **Next step:** "Grant access". Every limit, expiry, revoke and pause-all control stays visible (D-141); the key is shown once.
- **Holds:** behind `SKIPPIE_AGENT_ENABLED` (off).
- **Owns:** `client/src/pages/SeekerAgents.tsx` and a new `client/src/pages/seekerAgents.test.tsx`.

### 6.6 Gap pages folded into rows whose lane packets are not written yet
The split's row text now names them, so their lane packet writer adds them:
- `/admin/money-check` goes to `D-048-p3-admin-money`, and `/admin/skippie` to `D-048-p3-admin-ops`.
- `/reviewer-sign-in` goes to `D-048-p3-signin`. It stays behind `REVIEWER_LOGIN_ENABLED`, for the fixed demo accounts only.
- `/company/claim` and `/company/dashboard/:slug` go to `D-048-p3-for-companies`, already Tier 1. They stay aggregate-only and behind `COMPANY_CLAIM_ENABLED`, with the same-account single-use email link (D-107).
- The three guide pages already belonged to `D-048-p3-policy`: its row covers them through `GuidePage.tsx`.

## 7. How agents work on this together
- **One row, one surface (or a named group), one PR.** Inside a row, one component per commit, so a reviewer can follow it and a takeover can resume it.
- **Lanes run side by side.** Rows in different lanes with disjoint `owns` build at the same time (D-109, D-134). A shared component's owner row goes first, and rows that use it wait or keep the old one.
- **Order inside the program:**
  1. the foundation rows (`D-048-F-*`, with §6.1 and §6.2);
  2. the redesign rows of the live pages (`D-048-p3-live-review-*`);
  3. the lane rows, top down in `docs/plans/assignments.json`;
  4. `D-048-K-kit` last.
- **Every surface row depends on `D-048-F-goal-check`.** Lane packets add it to each row they add.
- **A new route or component** needs its line here (§2-§5) in the same PR (D-167). Ask the CEO with `--report blocked` when no row fits.

## Status
- D-048-F-goal-check: todo; waits for D-048-F-primitives.
- D-048-F-shell-parts: todo; waits for D-048-F-credits and D-048-F-goal-check.
- D-048-F-coverage: todo; waits for D-048-F-goal-check.
- D-048-p3-skippy: todo; waits for the foundation rows and REGISTER-520.
- D-048-p3-agents: todo; waits for the foundation rows.
