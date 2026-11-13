# D-048-F-app-wrapper evidence

Synthetic local evidence, not production proof. No real account, payment, person or provider is involved; every API call is answered locally and every https request is blocked.

## What changed
The app-wide wrapper states render a goal variant where the current route's goal surface is on (`goalSurfaceOn` for the surface in `GOAL_SURFACES` that declares the route; `goalSurfaces.ts` unchanged, no new flag, `RELEASED` unchanged). Everywhere else the legacy variant renders exactly as before.

- **`/` shows the goal variants once this lands**, because `home` is already released. This applies to signed-in visitors on `/` too (they still get the legacy Home page, but the wrapper states follow the route's surface, as the packet specifies).
- Offline and slow-connection notices: same triggers, `role="status"` `aria-live="polite"`; goal variant (`GoalNotice`) is a floating status pill, `position: fixed`, so it takes no layout space and the page does not move when it appears or goes (fix for the 37-57px layout shift found on 29ed507d; pinned by `goalNotice.layout.test.tsx`). Phone: centred above the bottom bar (`--g-bottombar-h` + 12px + safe area). Desktop: bottom-right corner, at most 20rem wide, clear of centred footers and primary actions. It is `pointer-events-none`, `z-30` (below sheets and drawers at z-40/50 and the cookie banner at z-60), and never covers the top bar or rail. Trade-off: as an overlay it can sit over page content near the bottom edge while it shows, and below the cookie banner it is hidden until the banner is answered (see Captures).
- Copy (PR #877 review 6529007802 / 6531091228): the goal offline notice says only "You're offline." (navigator's flag does not prove saved data exists); the slow notice keeps "Slow connection. Pages may take a moment to load." The legacy `StatusBanner` keeps its words (read-only here).
- Update: unchanged and silent (posts `SKIP_WAITING`, renders nothing) on both variants.
- Error fallback (app-wide `ErrorBoundary` and `RouteErrorBoundary`): goal copy "Something went wrong." / "Try again, or come back in a moment." (no cause, blame or data-safety promise; PR #877 review), same Try again (reset, or reload on a chunk-load failure), same Go home to `/`, same `captureClientError` names; goal variant is `GoalErrorFallback` (brand mark, one h1, one black commit).
- Toaster: one sonner instance stays mounted for the app's whole life (a remount would drop toasts already in flight); on a goal route the same instance takes goal token colours (`GOAL_TOASTER_PROPS`). Position `top-center`, 72px desktop and mobile offsets and default durations unchanged.

## Reproduce
```sh
JWT_SECRET=synthetic-local VITE_APP_ID=skipwait BILLING_ENV=test CHARGEBEE_SITE=dummy \
CHARGEBEE_API_KEY=dummy CHARGEBEE_WEBHOOK_SECRET=dummy VITE_GOAL_SURFACES=start \
PORT=3017 NODE_ENV=development npx tsx server/_core/index.ts
node design/goal-ui/captures/app-wrapper/capture.mjs 390
node design/goal-ui/captures/app-wrapper/capture.mjs 1280
```

`/` is the released `home` surface; `/start` is the `start` surface, turned on in this dev build only. States: `page` (reference), `offline`, `slow`, `update` (proves nothing renders: the manifest records the posted `SKIP_WAITING` and zero status regions), `route-error`, `app-error`, `toast`. 28 full-page images in `images/` at 390x844 DPR 2 (PNG 780px wide) and 1280x900 DPR 1. `manifest-390.json` and `manifest-1280.json` record source, command, viewport, DPR, the wrapper element's box and colours, overlaps with the shell, bottom bar, header and cookie banner (none in every capture), status-region count, toaster count, h1 count and console errors.

How the error states are triggered (synthetic): `app-error` makes `navigator.connection` throw, so the slow-connection notice (outside the router) fails while rendering; `route-error` on `/start` blocks the lazy `Onboarding` module (a real chunk-load failure); `route-error` on `/` makes the landing's reduced-motion `matchMedia` query throw inside the route. Toast: the app's own sonner module is imported from the dev server and `toast("Link copied.")` is called.

## Captures
All 28 images and both manifests were re-captured on `c56febbb` (the layout fix plus the copy repair; the commit after it changes only this folder), so they show the floating notice and the new words. Every capture has 0 horizontal overflow, one h1, at most one toaster and one status region. The manifests' overlap check measures the notice's full-width fixed status region, not the pill: on `/` (cookie banner open, no consent stored) that region intersects the cookie dialog at both widths. At 1280 the pill sits bottom-right, visibly clear of the centred banner. At 390 the pill sits under the banner (z-30 below z-60), so it is hidden until the banner is answered; on `/start` (no banner) it shows above Continue at 390 and bottom-right at 1280. This is the overlay's intended z-order, recorded here for the reviewer, not changed by the copy repair. Console errors on every page (WorkOS client id unset, a 403 resource) come from the local setup and are retained in the manifests. Webfonts load from https, which is blocked, so captures render with the fallback face.

## Tests
Copy repair (PR #877): `goalWrapperCopy.test.tsx` (10 tests: exact goal error heading and body, no cause/blame/data-safety/retired wording, both boundaries, exact goal offline words with role/aria-live, and preserved slow, legacy offline, legacy error and `/queue` legacy-route words) was red 6 failed / 4 passed at `9ef72c0f` and is green after; the three `appWrapper.goal.test.tsx` assertions that pinned the old goal copy now pin the new words. `red-tests.log`: the two new test files failed before implementation (modules missing; 1 boundary assertion failed, the behaviour file could not resolve `./routeSurface`). After: `appWrapper.goal.test.tsx` (behaviour, surface on and off) and `appWrapperBoundary.test.ts` (transitive import walk, shadcn and kit.css class scan, negative control on today's `StatusBanner` and `ErrorScreen`) pass, with `pwaStatus.test.tsx`, `systemStates.test.tsx`, `metadataAndRouteLoading.test.ts`, `goalBoundary.test.ts`, `goalPagesBoundary.test.ts` and `goalUiCoverage.test.ts` unchanged and green.

## Wiring note for the reviewer
`PwaStatus.tsx` and `ErrorBoundary.tsx` import the goal wrapper modules by relative path (`./goal/wrapper/...`). `goalBoundary.test.ts` (owned by D-090-BYOR, untouched here) matches the text `components/goal`, so these two files do not need a `MOVED_SURFACES` entry; the same relative shape is how `pages/Approve.tsx` reaches `pages/goal/`. If a reviewer holds that these files must be registered in `MOVED_SURFACES` instead, that edit belongs to the boundary test's owner row.
