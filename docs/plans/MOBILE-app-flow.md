# Packet MOBILE-app-flow: one goal per screen, both roles captured, an app on the phone

Ruling: D-414 (owner, Nov 27 2026). Mocks reviewed by the owner in session: landing role choice, seeker and referrer sign-in (A + C), the "Where do you work now?" sheet (B) and the two-lane flow (`.review/flow-both-roles.png` in that session; the screens are described below so the packet stands alone).

## 1. Why (measured on skipwaitmanus main `b0442f087`, live web `524b944`, iPhone 13 390x664)
- Landing `/`: 7,070 px tall (about 11 screens), 698 words; the search, its one action, is below the first screen and the cookie card covers the bottom third.
- Sign-in `/sign-in`: 1,268 px (2 screens); the role choice sits mid-page and the five social buttons are below the fold.
- Referrer supply is the bottleneck ("No referrers yet"); most seekers are employed and could refer at their current employer.

## 2. Standing mobile rules (apply to every screen from now on; DESIGN.md carries them)
1. One goal per screen: each mobile screen fits one viewport (100dvh at 390x664 and 320x568) with one primary action in thumb reach; longer content moves to a sheet or the next screen.
2. Signed-in people never see the marketing landing: `/` and the installed app open their home (seeker home, or Queue for a verified referrer).
3. The installed app stays `display: standalone` with `start_url` `/` (already true in `client/public/manifest.webmanifest`).
4. The cookie notice is a slim one-line bottom bar; its wording is unchanged (privacy text is the owner's).
5. Proof content (mass applying vs referral, the hiring-time figures with their source, how it works, fair rules, FAQ) lives on one indexable "How it works" page linked from the landing and the footer; desktop keeps its layout until a later row.
6. Every change ships behind a switch that starts off, with 1280 and 390 captures, and the switch flips only after landing → search-start and sign-in completion are compared with the old version.

## 3. Rows (each lands on its own; switches start off)
### PRIVACY-own-employer-guard (Tier 1) - first
A person never sends a referral request to their own current employer. In `createCompanyReferralRequest` (`server/db.ts`), before any wallet lock or spend, if the requesting person (any alias of the canonical person) holds an active verified work email at the target company domain, refuse with a typed error `own_employer`; nothing is created, reserved or spent, and no notice is sent. The composer shows: "You work at <Company>. We don't send requests to your own employer, so colleagues never see you're looking. Nothing was used." with "Find another company". Waiting/held asks created before the guard are left alone. Owns `server/db.ts` (guard call only), `server/ownEmployerGuard.ts`, `server/ownEmployerGuard.test.ts`, `shared/ownEmployer.ts`, `client/src/pages/explore/useAskComposer.tsx` (the refusal state only), this packet. Tests: canonical-person aliases, unverified or lapsed work email does not block, other companies unaffected, no ledger row on refusal, cross-user isolation.

### MOBILE-landing-choice (Tier 2)
Behind `MOBILE_LANDING_V2` (off): the mobile landing is one screen. Headline "Referrals, straight from people inside."; one line "Verified employees, private requests, no application pile."; "What brings you here?" with two cards: **I want a referral** (black) holding the search field inline ("Company, job title or job link") and "3 free requests a month"; **I can refer someone** ("Help good people in through your company's own process. Always free.") opening the referrer work-email sign-in with the role carried. Small print: "A referral is an introduction, never a promise of a job." Signed-in visitors are routed to their home (rule 2). The long sections move to `/how-it-works` (rule 5) with their figures and sources unchanged. Owns `client/src/pages/Home.tsx`, `shared/landingContent.ts`, `client/src/pages/goal/how-it-works/**`, `client/src/App.tsx` (one route), `scripts/prerender-public-pages.tsx` (the new page), `client/src/components/CookieConsent.tsx` (layout only, rule 4), landing tests, this packet.

### MOBILE-signin-onescreen (Tier 1, sign-in surface; methods unchanged)
Behind `MOBILE_SIGNIN_V2` (off). A: the role chosen on the landing arrives selected ("You chose I want a referral · Switch"), never asked twice; the header Sign in shows both role cards first. C: seeker screen = "Sign in to get referred.", email field, one black "Email me a sign-in link", "Continue with Google" visible, Microsoft/GitHub/LinkedIn/Slack/password under "More ways to sign in", one line of small print. Referrer screen = "Sign in with your work email.", work email, "Send my code", "We'll send a code to confirm you work there. We use it only for that.", "Always free. Referrers are never paid." The login rule is unchanged (D-030/D-049/D-406/D-408): referrer surfaces offer only the work-email code; `loginRule.test.tsx` and `signIn.test.tsx` keep every pin. Owns `client/src/pages/goal/sign-in/GoalSignInPage.tsx`, `GoalSeekerForm.tsx`, `GoalReferrerCodeForm.tsx`, `GoalAuthFrame.tsx`, `client/src/pages/goal/sign-in/mobileSignIn.test.tsx`, this packet.

### MOBILE-both-prompt (Tier 1) - after PRIVACY-own-employer-guard
Behind `BOTH_ROLES_PROMPT` (off). Once per person, right after their first request is sent, a bottom sheet: "Where do you work now?" / "Verify your work email and you can refer good people at your company too." / "Your colleagues never see that you're looking. Requests never go to your own employer." / work email / "Verify my work email" / "Not now". It uses the existing in-portal work-email verification (D-057); a dismissal or a verification is stored on the account so it never shows again. Verified people get the Queue tab (existing behaviour). A referrer signed in with only a work email who opens Find is first asked to add a personal login (D-057) so their job search is not tied to their work identity. Owns `client/src/components/requests/BothRolesSheet.tsx`, its test, the mount in `client/src/pages/explore/useAskComposer.tsx` (sent state only), `shared/bothRolesPrompt.ts`, the account-preference read/write it needs, this packet.

### D-089.ui (existing row) - placement approved by D-414 (2)
Built as packet `docs/plans/D-089-request-inbox.md` §4.8, §4.9 and §5.2 specify.

## 4. Not changed
Prices, plan contents, money rules, legal text (Terms, Privacy, Refund wording, cookie wording), the login rule's methods, referrer fairness. No switch goes on without its comparison and real-phone check.

## Status
- MOBILE-app-flow: Claude Code · 33aa, 2026-11-27 — packet written from the owner-approved mocks; rows registered (D-414); nothing built.
- PRIVACY-own-employer-guard: in progress — GPT-6.1 Sol · 6425 — 2026-11-27 — branch `agent/queue/privacy-own-employer-guard`; current-employer guard and proof pending.
