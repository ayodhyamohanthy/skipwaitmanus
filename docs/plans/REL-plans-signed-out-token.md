# Packet REL-plans-signed-out-token: signed-out /plans never asks WorkOS for a token (release repair, incident #1439)

> Read `docs/BRIEF.md` first, then this packet. This row is the registered repair for the red live release (D-212): its note carries `Fixes incident: #1439`, so the picker hands it out first and it may land while other landings are held.

| Field | Value |
|---|---|
| Row | `REL-plans-signed-out-token` (Tier 1 by path: the `/plans` money surface) |
| Decisions | D-212 (a red live release holds every landing but its fix), D-019 (basics always work), D-370 (lands on green required CI) |
| Evidence | Incidents #1430, #1436 and #1439; release-verify runs 44910194170, 44913123688, 44915681235 and 44920842762; the investigation comment on #1439 (Nov 21, 15:34 UTC) |
| Registered by | Claude Code (session `ccr-f3a4e037-1voydq`), Nov 21 2026, against `main` `4feb94b9` |

## 1. The defect

Since 13:43 UTC on Nov 21, three releases in a row (`9aeffb7c`, `3d474982`, `5e7a3212`) failed live verification on one check only: `page /plans loads clean — console: Failed to load resource: the server responded with a status of 400 ()`. Every other page, API and health check passed. A red release holds every agent's landing (D-212), so this one console line stops the whole team.

The 400 comes from `https://api.workos.com/user_management/authenticate` (WorkOS error `invalid_request`), during a signed-out visit, intermittently. Cause: `useBandedSales` (`client/src/components/plans/bandedSales.ts`) runs `fetchBandedOffer(input.getToken)` for every visitor, and `fetchBandedOffer` always awaits `getToken()`. For a signed-out visitor the WorkOS SDK (0.20.2) answers `getAccessToken()` with a `refresh_token` request that WorkOS refuses with 400. The offer endpoint itself needs no token for an anonymous read; it answered `onSale: false`.

## 2. The fix

- Look up a bearer token only when the visitor is signed in. A signed-out offer read sends no `Authorization` header and never calls `getToken`. The query key already separates the two (`bandedOfferKey(signedIn)`).
- The signed-in offer read and both checkout POSTs keep the bearer token and the cookie exactly as today.
- Nothing else changes: no server, copy, switch or price change. `BANDED_SALES_ENABLED` stays as it is.

## 3. Tests (red first, `client/src/components/plans/bandedSales.test.tsx`)

- Signed out: rendering the plans sales hook makes one `GET /api/chargebee/banded/offer` with no `Authorization` header, and calls `getToken` zero times.
- Signed in: the offer read calls `getToken` and sends `Authorization: Bearer <token>` with `credentials: "include"`.
- Every existing checkout test still passes unchanged.

## 4. Done means

Green required CI on the pull request, landed, the Web deploy green. Then the next release-verify run on the live release passes `page /plans loads clean`. That run closes every open "Release not verified" incident by itself (`.github/workflows/release-verify.yml`). Record its run link here. If `/plans` still logs a 400 from another request, report the exact request and keep the row open.

**Owns:** `client/src/components/plans/bandedSales.ts`, `client/src/components/plans/bandedSales.test.tsx` and this packet. `bandedSales.ts` is also owned by `BANDED-ui`, which is in progress. Shared files hold no build (D-314): whoever lands second merges `main` and keeps both changes.

## Status

- REL-plans-signed-out-token: in review — Claude Code · a71e — 2026-11-21 — branch agent/queue/rel-plans-signed-out-token. Red first: the new signed-out test failed because the offer read sent an `Authorization` header (`expected true to be false`); the signed-in control passed. Fix: `useBandedSales` passes a no-token getter to the offer read when signed out. Green: plans components 12 files / 133 tests, plans pages 7 files / 71 tests, `tsc --noEmit` clean, design-token audit clean. Done after the next release-verify run passes `page /plans loads clean` and closes the incidents.
