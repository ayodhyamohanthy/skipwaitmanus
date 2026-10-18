# Packet D-048 phase 3: every signed-in surface moves to the goal UI, one surface per session

> Read `docs/BRIEF.md` first, then this packet, then `DESIGN.md` (the visual contract). You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `D-048` (phase 3); one sub-row per surface in §4 below |
| Decisions | D-048, D-070, D-071, D-077, D-079; D-030 as amended by D-049/D-057 (referrer surfaces), D-006/D-040, D-055, D-063 |
| Risk tier | per surface (§4): 1 for money, sign-in, identity and privacy surfaces; 2 for flows; 3 for static pages |
| Size | S–M per surface; never two surfaces in one session |
| Implementer | any model; Tier 1 surfaces need the independent review (`docs/DELEGATION.md` §6) |
| Branch | `agent/<model>/d048-p3-<surface>` from the latest `origin/main` |
| Depends on | per surface (§4) |
| Do not run at the same time as | another phase-3 surface that edits the same files; the lanes named per surface |
| Verified against | `agent/claude/goal-ui` at `39e43702` (Oct 18 2026), merged to `main` with this packet |

## 1. Goal
Every page a signed-in person sees already sits inside the goal shell (`client/src/components/AppShell.tsx`). Four surfaces are fully moved: the shell, Find a referral with the ask drawer (`/explore`, `/ask`), the Referral queue (`/queue`) and My asks (`/requests`). The rest still render their Kit v4 content inside the new shell. This packet moves them one at a time, so the product reads as one system, without changing what any flow does.

## 2. Binding rules (quoted)
- `DESIGN.md` "Binding rules" 1–17 apply to every moved surface. The ones most often broken: "Exactly one solid black element per screen, and it is the commit action"; "`#1d4ed8` (`g-trust`) appears only as lucide `badge-check` plus its text, rendered by `GoalVerifiedMark`"; "Status is a dot plus text, coloured by role … Crimson … never in the referrer queue"; "Every number on screen comes from the server; no invented numbers"; "Money lines say what the code does (`shared/moneyCopy.ts`, D-063)".
- D-048: "key-screen designs at 1280 and 390 go to the owner for approval before any rollout". D-071 approved the three comps and the system. A surface whose layout is a **new pattern** that the comps and `DESIGN.md` do not cover (a message thread, a pricing table, a long settings form) is composed only from the primitives in `client/src/components/goal/`; if it needs a new primitive or a new layout idea, stop (§11).
- D-030/D-049: referrer surfaces sign in with the work-email code only, through `referrerSignInHref()` — never `SignInButton`, `openSignIn` or `auth/workos` (pinned by `client/src/pages/loginRule.test.tsx`; add every new referrer file to its list).
- Privacy: "A referrer sees no seeker name or resume, and no seeker can message a verified referrer, until that referrer accepts" (BRIEF).

## 3. Current state (verified)
1. Moved and live with this packet: `client/src/components/AppShell.tsx` (route-derived place and title; `shellRouteInfo`), `client/src/pages/goal/{FindReferral,AskDrawer,MyAsks,ReferralQueue,PersonalLinkPanel}.tsx` with their models (`findModel.ts`, `askSend.ts`, `myAsksModel.ts`, `queueModel.ts`) and APIs (`myAsksApi.ts`, `queueApi.ts`). Primitives: `client/src/components/goal/` (import from `@/components/goal`; merge classes with `gcn`, never `cn`).
2. Server additions used by moved surfaces: `server/displayRef.ts` (D-077(5), on `/mine`, the inbox and the preview), `shared/roleTitle.ts` (role names from the job link; stored titles are a placeholder), `shared/whyMe.ts` (three-line notes, D-077(4)).
3. Capture harness: `node scripts/kit-screens/capture.mjs --route <path> --name <name> --fixture scripts/goal-ui/fixtures/<file>.json --base http://localhost:3100 --out .goal-captures --viewport both` against the dev server (`PORT=3100`, `BILLING_ENV=test`, placeholder Chargebee keys, no database: every API call is mocked by the fixture). Fixtures use fictional companies; the comps' sample names never ship (audit rule R6).
4. Not moved yet — Kit v4 content inside the goal shell (lines, tests at `main` today):

| Surface | Route(s) | Page | Lines | Tests | Main APIs |
|---|---|---|---|---|---|
| Inbox | `/inbox` | `UnifiedInbox.tsx` | 77 | 2 | `/api/company-referrals/mine`, `/inbox?scope=completed` (via `inboxThreads`) |
| Ask thread | `/conversation/:id`, `/thread/:id` | `ReferralConversation.tsx` (+ `components/thread/*`) | 162 | 2 | `/api/company-referrals/:id`, `/:id/conversation`, `/:id/withdraw`, `/:id/one-click-review`, `/:id/progress` |
| Referrer home | `/referrer-home` | `ReferrerHome.tsx` | 95 | 2 | `/api/referrer/home-bundle` |
| Impact | `/referrer/impact` | `ReferrerImpact.tsx` | 114 | 2 | `/api/referrer/impact-summary` |
| Alerts | `/alerts` | `Alerts.tsx` | 171 | 3 | `/api/notifications`, `/api/seeker-alerts` |
| Company page | `/explore/:slug` | `ExploreCompany.tsx` (+ `components/explore/RequestDialog.tsx`) | 75 | 1 | `/api/companies/:slug`, `/api/companies/:slug/opportunities` |
| Referrer onboarding | `/referrer`, `/referrer-setup`, `/verify` | `Referrer.tsx`, `ReferrerSetup.tsx`, `Verify.tsx` | 175, 65, 224 | 6 | work-email OTP, `/api/referrer-preferences` |
| Plans and billing | `/plans`, `/billing` | `Plans.tsx`, `Billing.tsx` (+ `components/plans/*`) | 221, 98 | 7 | Chargebee checkout, `/api/credits/summary`, receipts |
| Account | `/settings`, `/profile`, `/work`, `/onboarding` | `Settings.tsx`, `Profile.tsx`, `Work.tsx`, `ProfileSetup.tsx` | 48, 144, 183, 126 | 11 | `/api/profile/me`, `/api/work-items`, `/api/profile/setup` |
| Assistants | `/assistants`, `/approve` | `Assistants.tsx`, `Approve.tsx` | 163, 176 | 4 | `/api/assistants/*`, `/api/credits/summary` |
| Static and small | `/help`, `/safety`, `/invite`, `/landed`, `/report`, `/suggest-company` | one page each | 41–158 | 7 | `/api/safety-reports`, `/api/blocks`, `/api/company-suggestions` |

Out of scope for phase 3 (no goal shell; they need their own approved designs first): `/`, `/sign-in` (D-033 role cards), `/start`, `/wall`, `/jobs`, `/messages`, `/employer*`, `/admin*`, policy and guide pages.

## 4. Target behaviour, in order
Each surface is its own session and its own push. Recommended order (core loop first, money and identity after their lanes land):

1. **Inbox + ask thread** — Tier 1 (accept, pass, withdraw and names after acceptance live in the thread). Depends on nothing. The thread is a new pattern (messages): compose it from `GoalDetailPane` (header, stepper for the seeker side, `GoalDecisionBar` for a pending referrer decision with the same seven pass reasons and ethics confirmation as the queue) and a plain message list; show the owner the 1280/390 captures in the weekly review (D-064) before pushing.
2. **Referrer home + Impact** — Tier 2. Impact stays private: no ranking, no public numbers ("Never ranked. Never public.").
3. **Alerts** — Tier 2. Saved company alerts reuse the seeker-alerts API the Find drawer already calls.
4. **Company page** — Tier 2. Its "Ask for a referral" opens `/explore?company=<slug>` (the drawer) instead of `RequestDialog`. Wait for the seeker-password lane (it edits `RequestDialog.tsx`), then delete `RequestDialog` and `requestDialog.test.tsx` with this move.
5. **Referrer onboarding (`/referrer`, `/referrer-setup`, `/verify`)** — Tier 1. After the seeker-password lane and the D-057 session gate land. Every file goes into the `loginRule.test.tsx` lists.
6. **Plans and billing** — Tier 1 (money). After D-067, D-069 and GO-LIVE-1 land; never before (they rewrite these files). Prices and plan contents come only from `shared/planCatalog.ts`; no new copy about money that `shared/moneyCopy.ts` does not hold.
7. **Account (`/settings`, `/profile`, `/work`, `/onboarding`)** — Tier 2.
8. **Assistants (`/assistants`, `/approve`)** — Tier 1 for `/approve` (an approved assistant ask spends a credit), Tier 2 for `/assistants`.
9. **Static and small pages** — Tier 3; Terms/Privacy-style legal text is never reworded (BRIEF).

For every surface:
- a. The page moves to `client/src/pages/goal/<Surface>.tsx` (allowed to import `@/components/goal`) and renders `<AppShell active=… title=…>` itself; the route in `client/src/App.tsx` drops its `<AppShell>` wrapper.
- b. Behaviour is unchanged: the same endpoints, request bodies, idempotency keys, error copy from the server, and loading, empty, error and offline states in plain words (`GoalSkeletonRows`, `GoalEmptyState`, `GoalErrorState`, `useOnlineStatus`).
- c. The old page and the components only it used are deleted in the same push, with their tests, after their behaviours are re-proven by new tests. A component another page still imports stays.
- d. Captures at 1280 and 390 from a goal fixture; no horizontal overflow at 390; 44px targets on phones.

## 5. Files
- **In scope (per surface):** its page, its new `client/src/pages/goal/` files and tests, the route line in `client/src/App.tsx`, a fixture in `scripts/goal-ui/fixtures/`, the components only that page used (delete), and the docs in §9.
- **Read only:** `client/src/components/goal/*` (a new primitive needs a `DESIGN.md` "Components" entry and its own tests, in its own commit, and must pass `node scripts/design-token-audit.mjs`), `DESIGN.md`, `shared/moneyCopy.ts`, `shared/passReasons.ts`.
- **Out of scope:** server routes and money logic (a surface move changes presentation only), `client/src/styles/kit.css` and the Kit v4 block of `client/src/index.css` (removed only after the last surface moves), legal page text.

## 6. Steps (one commit each, per surface)
1. Red: write the new page's behaviour tests (port every behavioural assertion of the old page's tests; drop only assertions about Kit v4 layout or copy that the design replaced).
2. Build `client/src/pages/goal/<Surface>.tsx` from primitives; green the tests; `pnpm check`; `node scripts/design-token-audit.mjs`.
3. Route it in `App.tsx`; delete the old page, its exclusive components and their tests; re-run the focused tests and `client/src/components/goal/goalBoundary.test.ts`.
4. Captures at 1280 and 390; fix overflow, targets, focus rings.
5. Docs (§9) and the full gate.

## 7. Tests to write first
Per surface: the page's API calls and bodies (stub `fetch`, assert URL, method and JSON body), each state (loading, empty, error with retry, offline disabling network actions with a reason), the one-primary rule (`document.querySelectorAll("[data-g-primary]")` has length 1 when the screen has a commit action), and every privacy rule the surface carries. Controls that must stay green: `client/src/components/goal/*.test.ts(x)`, `client/src/components/appShell.test.tsx`, `client/src/pages/loginRule.test.tsx`, `scripts/designTokenAudit.test.ts`, `scripts/briefContract.test.ts`.

## 8. Edge cases
- A page wrapped by both the route and itself renders two shells: drop the route's `<AppShell>` in the same commit.
- Phone sub-views (an opened item) hide the bottom bar (`hideBottomBar`) and use `GoalPhoneSubheader`.
- Never use the native `disabled` attribute on goal buttons; pass `disabledReason` (it is announced) or `inactive`.

## 9. Definition of done
- [ ] Every §7 test red first, now green; controls green.
- [ ] Full gate on the commit merged with the latest `origin/main` (`docs/BRIEF.md`, "How to ship").
- [ ] Tier 1: independent review passed.
- [ ] Docs in the same push (D-068): this packet's §3 table (move the row to "moved"), the §3b row, `docs/ARCHITECTURE.md` §3 code map, `AGENTS.md` living-map row if routes or modules changed.
- [ ] Live: skipwait.me serves the `git-commit` meta with your SHA; the surface checked at 1280 and 390.

## 10. Review checklist
- Does any number on the screen not come from the server? Any sample or placeholder name?
- Is there more than one solid black element? Any blue outside `GoalVerifiedMark`? Any crimson on a referrer surface?
- Referrer surfaces: is every sign-in path `referrerSignInHref()`? Is the file in `loginRule.test.tsx`?
- Did any request body, idempotency key or error path change? (It must not.)

## 11. Stop and ask if
The surface needs a layout or primitive that `DESIGN.md` does not describe; a money or identity rule seems to conflict with the register; a test you ported fails for a reason other than layout; you would need a server change, a migration, a dependency or an env key.

## 12. Owner questions
- New patterns (message thread, plans page, settings forms) are composed from the approved primitives and shown to the owner as captures in the weekly review before they ship (recommended 8/10: the system is approved, the layouts are new). Until the owner answers, implement this default.
