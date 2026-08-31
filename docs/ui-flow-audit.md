# skipwait.me — UI Flow Audit & Seamlessness Handoff
_Date: 2026-09-01 · Audit scope: all 24 routes, 3 roles (Job Seeker, Referrer, Admin)_

## 1. Flow inventory (entry → steps → exit)

| # | Flow | Entry | Steps | Exit / success state |
|---|------|-------|-------|----------------------|
| F1 | Seeker: post referral request | `/` → "I need a referral" or `/start` | 1. paste job URL (`/start`) → 2. resume upload (`/request`) → 3. sign-in at send → 4. credit spend + notify employees | `/requests` shows request card, status `pending` |
| F2 | Seeker: track & respond | `/requests` | status timeline, unread messages, open `/conversation/:id` | approved → next-step email draft; conversation handoff |
| F3 | Seeker: invite friends | `/settings` → `/api/personal-invites/me` | generate code `r#-xxxxxxxx` → share → invitee claims on signup | reward ledger row (action-gated) |
| F4 | Referrer: OTP sign-in & enroll | `/referrer` | company email → ZeptoMail OTP → verify | redirect to VERIFIED EMPLOYEE INBOX |
| F5 | Referrer: review & decide | `/inbox` → `/referrer?request=N` | read pitch/docs → optional note → approve / decline | status change + seeker notification + credits unlock |
| F6 | Referrer: hiring-manager email | review page (approved) | AI draft → editable plaintext → copy/download | email file / clipboard |
| F7 | Public share surfaces | `/wall`, `/share`, `/share-card/:token`, `/fast/:code`, `/refer/:slug/:alias` | view → share (WhatsApp/LinkedIn/X/email) → deep-link into F1/F4 | attribution carried (`?invite=`, fast-track codes) |
| F8 | Admin | `/admin/activity` (+ 3 sub-pages) | operational log, privacy requests, flow health, token recovery | admin-gated (403 for others) |
| F9 | Account & trust | `/settings`, `/privacy` | profile, data export, erasure, privacy doc | persisted via REST |

## 2. Findings (severity-ranked)

**CRITICAL — fixed this pass**
- C1. Lazy route chunks (`React.lazy`) failed to load intermittently on prod
  deploys; React 19 unmounts the tree on rejection → whole route blank with no
  recovery (verified: fresh-origin first load OK, subsequent loads blank).
  *Fix:* static route imports; error boundary added. Commit `234006e`.
- C2. Sign-in state invisible to UI for work-email-OTP users: compat `useAuth()`
  read only the AuthKit SDK context. Dashboards/inbox looked signed-out.
  *Fix:* compat provider hydrates from server session (tRPC `auth.me`), which
  serves both auth planes. Commit `cb525a3`.
- C3. Server-issued session cookies were unverifiable (`appId` empty in JWT).
  *Fix:* `VITE_APP_ID=skipwait` set at build + runtime.
- C4. Secrets lost on worker rename (`skipwait-api` → `skipwaitmanus`): OTP and
  auth broke. *Fix:* all secrets re-registered on the current worker; Pages
  Function proxy default updated.
- C5. PWA service worker cached-shell served stale HTML referencing purged
  chunks after deploys. *Fix:* SW disabled (self-destroying + unregister +
  cache purge on load); manifest kept for installability.

**MEDIUM — open (non-blocking, listed for follow-up)**
- M1. Token drift: brand blue `#0B57D0` hardcoded in ~40 JSX strings rather than
  a shared token; harmless today, migrate to Tailwind theme alias when touching
  those files.
- M2. Admin pages lack a distinct in-app visual marker beyond the eyebrow text.
- M3. `metadataAndRouteLoading` test now asserts static imports (updated with C1).

## 3. State coverage check (per live crawl)

| Screen | Loading | Empty | Error | Success |
|---|---|---|---|---|
| /requests | pulse skeleton | illustrated zero-state + share card | rose alert + retry | status timeline |
| /inbox | pulse skeleton | "no private requests" + guidance | role=alert | inbox cards |
| /notifications | inline spinner | "no updates yet" | role=alert | grouped unread/read |
| /start → /request | step skeleton | n/a | inline validation | step advance |
| /referrer | button busy states | n/a | role=alert on OTP errors | inbox redirect |
| /plans, /premium | spinner | n/a | checkout errors | plan table |
| /wall | pulse | "no internal openings" + share | alert | share row |

## 4. Interaction spec (current, verified)

- Navigation: wouter client-side routing; every page has Back (history -1) or
  explicit home link; dead-end pages none (audited §1 table).
- Focus: buttons/inputs are native elements; OTP input uses `inputMode=numeric`
  + Enter submit; file input is keyboard-accessible via visible label.
- Transitions: no SPA page transitions by design (System Clarity preset);
  active/hover/disabled states defined on all primary buttons.
- Route errors: `RouteErrorBoundary` renders a recovery card (message + Back to
  home) instead of a white screen.

## 5. Regression proof (before/after)

- Before: 4 of 5 loads of `/requests` blank on production (crawl log in
  session); after: 6/6 loads render (three origin, three repeat).
- Before: OTP sign-in ended on sign-in form (UI blind to session); after:
  redirect to inbox, bell shows unread count, review page reachable.
- Before: `/notifications` blank; after: renders (signed-out gate + signed-in list).

## 6. Acceptance checklist

- [x] Flow map documented (§1)
- [x] Issues ranked (§2)
- [x] Static imports remove chunk-loading failure class (C1)
- [x] Session plane unified (C2)
- [x] Every critical surface has loading/empty/error/success states (§3)
- [x] No dead ends (§1 nav graph, all pages have Back or home)
- [x] Live verification on desktop (1029px) and mobile (379px) crawls
- [x] Handoff: this doc + AGENTS.md invariants + component map in README

## 7. Known limitations / rollback

- PWA offline shell is disabled while the SW cached-shell bug class is open;
  restore `VitePWA` in `vite.config.ts` + `registerSW` in `main.tsx` only with a
  network-first navigation strategy and per-deploy cache purge (never precache
  `index.html`).
- Rollback: `git revert 234006e cb525a3` restores lazy routes + old auth bridge
  (NOT recommended — reintroduces C1/C2).
