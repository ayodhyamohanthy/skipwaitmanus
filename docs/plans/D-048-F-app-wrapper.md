# D-048-F-app-wrapper: the app-wide wrapper states on the goal system

Docs-only registration. No runtime change, flag change or acceptance waiver is made by registering this row.

| Field | Value |
|---|---|
| Task | `D-048-F-app-wrapper` |
| Parent / row | `D-048` / epic `D-048-p3` |
| Tier | 2: visual and wiring only; no money, sign-in, identity, privacy or migration effect |
| Branch / lane | `agent/queue/d048-f-app-wrapper` / `d048-app-wrapper` |
| Depends on | `D-048-F-goal-check`, `D-048-F-primitives` (both done) |
| Decisions checked | D-243, newest entry on `main` `94720d30` at registration. D-150 (every screen, landing to admin, on the goal doctrine), D-167 (every component has one owner row), D-223 (1) (one row, disjoint `owns`, behaviour-preserving or behind a switch that starts off), D-241 (left as is, below). Recheck later entries before building. |
| Found by | `D-048-p3-discovery` (PR #852): `client/src/App.tsx` mounts legacy UI around every route, and no route-only capture showed it. |

## Why this row
`App.tsx` wraps every route in five app-wide states that no row owns. `GOAL_UI_COVERAGE.md` §4 lists `ErrorBoundary.tsx` and `PwaStatus.tsx` under `App.tsx`, which has no page row, and the toaster is `components/ui/sonner.tsx`, which the catalogue excludes. On `main` `94720d30`:

| State | Where | Today |
|---|---|---|
| Offline notice | `OfflineNotice`, `client/src/components/PwaStatus.tsx` | kit `StatusBanner` (`app-states/SystemStates.tsx`): `bg-muted`, `role="status"`, `aria-live="polite"`, hidden on `/offline`, follows `online`/`offline` events |
| Slow connection notice | `SlowConnectionNotice`, same file | same banner; shown only for a `slow-2g`/`2g` link while online; follows `connection` `change` |
| Update notice | `PwaUpdatePrompt`, same file | renders nothing: on `skipwait:sw-update` it posts `SKIP_WAITING` to the waiting worker; no banner, no reload |
| Error boundary fallback | `client/src/components/ErrorBoundary.tsx` (app-wide) and `RouteErrorBoundary` in `App.tsx` | kit `ErrorScreen` (`bg-primary` and `border-border` buttons, `wordmark`), Try again (resets, or reloads when `needsReload`), Go home; `captureClientError` with the boundary name |
| Global toaster | `<Toaster position="top-center" offset={{ top: "72px" }} mobileOffset={{ top: "72px" }} />` from `components/ui/sonner.tsx` | shadcn colours (`--popover`, `--border`) through `next-themes` |

## Scope
1. Goal-native offline and slow-connection notices, update notice, error boundary fallback (both boundaries) and global toaster, built with goal primitives and goal tokens only, in new files under `client/src/components/goal/wrapper/`.
2. Wired through `App.tsx` as a switch (at most 12 changed lines, the scope-check limit) and through `ErrorBoundary.tsx` and `PwaStatus.tsx`.
3. **Which variant renders (no flag changes).** The goal variant renders only where the current route's existing goal surface is on (`goalSurfaceOn` for the surface in `GOAL_SURFACES` that declares the route, read-only); everywhere else today's legacy variant renders unchanged. `client/src/lib/goalSurfaces.ts` is read-only: no new id, no `RELEASED` change, no env change. `home` is already released, so the PR must say that `/` will show the goal variants once it lands and capture `/` for every state. If a reviewer or the owner holds that this needs its own switch, stop and `--report blocked`; do not add a flag.
4. Exactly one toaster is mounted at a time, and every existing `toast()` call works unchanged on both variants.

## Behaviour that must not change
- Triggers: `online`/`offline` window events, `navigator.onLine` at mount, `connection.effectiveType` 2G-class only, `connection` `change`, no slow notice while offline, no offline notice on `/offline`, `skipwait:sw-update` with `SKIP_WAITING`.
- Timings: the update stays silent (no banner, no reload, no new copy); toasts keep sonner's default durations, `top-center` and the 72px top offset on desktop and mobile.
- Actions: Try again resets the boundary, or reloads when `needsReload(error)` is true; Go home goes to `/`; the raw error is never shown; `captureClientError` is called with the same boundary names and fields.
- ARIA: both notices stay `role="status"` with `aria-live="polite"`; the error fallback keeps one `h1`; sonner's live region stays.
- Copy: the existing sentences stay word for word. Adding a visible update notice is new behaviour and needs the owner's word; it is not in this row.
- Every existing test stays unchanged and green, including `client/src/components/pwaStatus.test.tsx` and `client/src/components/app-states/systemStates.test.tsx` (read-only; they pin the legacy variant).

## Owns
- `client/src/components/ErrorBoundary.tsx`
- `client/src/components/PwaStatus.tsx`
- `client/src/components/goal/wrapper/**` (new: the goal notices, error fallback, toaster, the route-to-surface lookup, and their tests)
- `client/src/App.tsx (switch only)`
- `design/goal-ui/captures/app-wrapper/**` (fixtures, recipe, manifest, images)
- This packet's Status section.

Read-only: `components/app-states/SystemStates.tsx` (owned by the done `D-048-p3-system`; it retires in `D-048-K-kit`), `components/ui/sonner.tsx`, `lib/goalSurfaces.ts`, `components/goal/index.ts`, `contexts/ThemeContext.tsx`, every other component and page, both existing boundary tests.

## Not this row (held or owned elsewhere)
- `D-048-F-shell-parts` (owner hold, D-231): `AccountMenu`, `NotificationBell`, `BetaNotice`, `CookieConsent` and `shellParts.goal.test.tsx`. Untouched here.
- `D-048-dark-mode` (owner hold, D-230): `goalDark.css`, `ThemeContext.tsx`, `GoalMoreMenu`, `index.css`, `index.html`. Use goal tokens only so dark mode applies later; add no dark styles here. Its `App.tsx (switch only)` claim and this one are both switch-only, which `validateAssignments` allows.
- `D-090-BYOR` and its rows: `components/goal/goalBoundary.test.ts`, `lib/flags.ts`, `lib/sentry.ts`, `GOAL_UI_COVERAGE.md` and the rest of its `owns`. Untouched here.
- `D-048-p3-discovery` and D-241: `client/src/test/goalPagesBoundary.test.ts` and its audited list stay exactly as D-241 rules; this row adds its own boundary test instead.
- `REL-client-capture` (`client/src/main.tsx`), `P1-client-error-boundary` (server error formatting). Untouched.
- Out of scope, reported for a later row: the Suspense route-loading fallback (`LoadingScreen` in `App.tsx`).

## Red-first tests (in `client/src/components/goal/wrapper/`)
1. **Behaviour (goal surface on):** offline shows and hides on the events and stays hidden on `/offline`; slow shows only for 2G-class while online; the update posts `SKIP_WAITING` and renders nothing; the error fallback's Try again resets, or reloads on a chunk-load error, and Go home links to `/`; `captureClientError` is called; both notices are `role="status"` `aria-live="polite"`; a `toast()` call renders in the goal toaster; exactly one toaster is mounted. With the surface off, the legacy variant renders (the existing tests stay as they are).
2. **Goal boundary (`appWrapperBoundary.test.ts`):** each wrapper module, and every module it imports by alias, relative path, barrel or transitive import, imports nothing from `components/kit/*`, `components/ui/*`, `app-states/SystemStates` or `styles/kit.css`; the rendered goal states carry no class defined in `styles/kit.css` and no shadcn token class (`bg-muted`, `bg-primary`, `border-border`, `text-foreground`, `text-muted-foreground`). A negative control proves the test fails on today's `StatusBanner` and `ErrorScreen`.
3. Tests fail first for the reason above; commit the red run log in the capture folder.

## Proof
- Captures at 1280 and 390 CSS pixels of offline, slow, update (proving nothing renders), error boundary (app-wide and route) and toast, on `/` and on one goal surface turned on in test mode, each inspected over the whole page: no overlap with the shell, the cookie banner or the tab bar; no clipping; readable contrast. Fictional fixtures only; a manifest with source head, viewport, DPR, command and result.
- Gate: `pnpm check`, `node scripts/design-token-audit.mjs`, focused tests, `LANG=en_US.UTF-8 pnpm vitest run`, `pnpm build`, `VITE_GOAL_SURFACES=all pnpm build`, scope-check inside `owns`, then green required CI on the exact head and a merge commit (never squash).

## Status
- D-048-F-app-wrapper: todo; registered Oct 30 2026, synced to D-243.
