# D-048-F-app-wrapper evidence

Synthetic local evidence, not production proof. No real account, payment, person or provider is involved; every API call is answered locally and every https request is blocked.

## What changed
The app-wide wrapper states render a goal variant where the current route's goal surface is on (`goalSurfaceOn` for the surface in `GOAL_SURFACES` that declares the route; `goalSurfaces.ts` unchanged, no new flag, `RELEASED` unchanged). Everywhere else the legacy variant renders exactly as before.

- **`/` shows the goal variants once this lands**, because `home` is already released. This applies to signed-in visitors on `/` too (they still get the legacy Home page, but the wrapper states follow the route's surface, as the packet specifies).
- Offline and slow-connection notices: same triggers and words, `role="status"` `aria-live="polite"`; goal variant (`GoalNotice`) is a floating status pill, `position: fixed`, so it takes no layout space and the page does not move when it appears or goes (fix for the 37-57px layout shift found on 29ed507d; pinned by `goalNotice.layout.test.tsx`). Phone: centred above the bottom bar (`--g-bottombar-h` + 12px + safe area). Desktop: bottom-right corner, at most 20rem wide, clear of centred footers and primary actions. It is `pointer-events-none`, `z-30` (below sheets and drawers at z-40/50 and the cookie banner at z-60), and never covers the top bar or rail. Trade-off: as an overlay it can sit over page content near the bottom edge while it shows. The offline/slow images in `images/` predate this fix and must be re-captured on the repaired head.
- Update: unchanged and silent (posts `SKIP_WAITING`, renders nothing) on both variants.
- Error fallback (app-wide `ErrorBoundary` and `RouteErrorBoundary`): same words, same Try again (reset, or reload on a chunk-load failure), same Go home to `/`, same `captureClientError` names; goal variant is `GoalErrorFallback` (brand mark, one h1, one black commit).
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

Every capture has 0 horizontal overflow and no overlap. Console errors on every page (WorkOS client id unset, a 403 resource) come from the local setup and are retained in the manifests. Webfonts load from https, which is blocked, so captures render with the fallback face.

## Tests
`red-tests.log`: the two new test files failed before implementation (modules missing; 1 boundary assertion failed, the behaviour file could not resolve `./routeSurface`). After: `appWrapper.goal.test.tsx` (behaviour, surface on and off) and `appWrapperBoundary.test.ts` (transitive import walk, shadcn and kit.css class scan, negative control on today's `StatusBanner` and `ErrorScreen`) pass, with `pwaStatus.test.tsx`, `systemStates.test.tsx`, `metadataAndRouteLoading.test.ts`, `goalBoundary.test.ts`, `goalPagesBoundary.test.ts` and `goalUiCoverage.test.ts` unchanged and green.

## Wiring note for the reviewer
`PwaStatus.tsx` and `ErrorBoundary.tsx` import the goal wrapper modules by relative path (`./goal/wrapper/...`). `goalBoundary.test.ts` (owned by D-090-BYOR, untouched here) matches the text `components/goal`, so these two files do not need a `MOVED_SURFACES` entry; the same relative shape is how `pages/Approve.tsx` reaches `pages/goal/`. If a reviewer holds that these files must be registered in `MOVED_SURFACES` instead, that edit belongs to the boundary test's owner row.
