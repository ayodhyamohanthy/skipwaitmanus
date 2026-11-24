# LAUNCH-live-qa evidence, November 24 2026

Session: Claude Code · c2ed, branch `agent/queue/launch-live-qa-acceptance` (D-388).
No password, hash, cookie or authenticated response body appears here. No money moved; no
state-changing request was made by this session or by the runner.

## Release under test

| Surface | Commit | How read |
|---|---|---|
| Web (Pages) | `16f2a2bef5ec12c50c08784967fcbdbf40a0f58c` | `git-commit` meta on `https://skipwait.me/`, and `summary.json` `release.web` |
| API (Containers) | `ba99d626fd247649ea3d2d22808daa44101c322c` | `GET /api/health` `commitSha`, and `summary.json` `release.api` |

The two differ because web and API deploy on separate path filters (AGENTS.md invariant 6).

## Runs

| Run | What it is | Result |
|---|---|---|
| [45361666119](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45361666119) | Deploy API with the reviewer reset (D-388) | success; log: "Secrets uploaded with this release: REVIEWER_SEEKER_PASSWORD_HASH, REVIEWER_REFERRER_PASSWORD_HASH, DATABASE_URL" |
| [45364628436](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45364628436) | Live QA (signed in), first signed-in run | success; both roles signed in; 38/38 captures 200; one console 400 per page, URL not yet recorded |
| [45372954261](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45372954261) | Live QA (signed in) on the release above, with OPS-live-qa-hardening's 4xx recording | success; artifact `14910890585`; details below |
| [45369231838 e2e journeys](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45369231838/job/138358864005) | CI `e2e journeys` on web commit `16f2a2be` | success |
| [45360866437 e2e journeys](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45360866437/job/138330297871) | CI `e2e journeys` on API commit `ba99d626` | success |

## What run 45372954261 proves

- **Demo seeker sign-in:** `POST /api/auth/reviewer/sign-in` answered 200.
- **Demo referrer sign-in:** answered 200.
- **Seeker routes, each at 1280 and 390 (24 captures):** `/plans`, `/billing`, `/requests`, `/ask`, `/explore`, `/alerts`,
  `/inbox`, `/messages`, `/profile`, `/settings`, `/invite`, `/support`: every document 200, no
  redirect to sign-in, no uncaught page error, no 5xx, no sideways scroll.
- **Referrer routes, each at 1280 and 390 (14 captures):** `/referrer-home`, `/queue`, `/referrer/impact`, `/inbox`,
  `/invite`, `/profile`, `/settings`: same results.
- **Banded sales off:** signed-out `GET /api/chargebee/banded/offer` answered 200 `{"onSale":false}` (read 2026-11-24 ~10:20 UTC).

## Defect found (filed separately, not fixed here)

All 38 captures record exactly one client error: `400 POST https://api.workos.com/user_management/authenticate`,
shown in the console as "Failed to load resource: the server responded with a status of 400".
Signed out, `/`, `/plans` and `/sign-in` make no such call. The pages still render. Likely cause
(not confirmed in code): `WorkOSAuthKitProvider` in `client/src/_core/auth.tsx` attempts a token
refresh for a session that the server cookie established (the reviewer sign-in), which WorkOS
refuses. It needs its own row; this packet changes no code.

## Not proven by these runs (gaps, never passes)

The runner is navigation-only: it clicks nothing and sends no form. So the following acceptance
items from the packet stay open:

1. **Wallet unchanged by QA.** No before/after `GET /api/credits/summary` read is taken. Would be
   proven by adding that read to `scripts/live-qa-signed-in.mjs` for the demo seeker.
2. **Document isolation / cross-user denial on the live release.** Not exercised. Would be proven
   by a read-only check that the demo referrer's `GET /api/documents/<seeker document id>` and the
   demo seeker's view of another account's request both answer 404, with ids taken from the demo
   accounts only.
3. **Safe transitions (create, withdraw, claim, accept) on the live release.** Not executed; the
   no-wallet-risk scope for these demo accounts is not established (packet step 2). CI `e2e
   journeys` passes on both released commits against a disposable database, which proves the code
   paths, not the live release.
4. **Job-link previews** (packet step 4) were not exercised by the runner.
5. **WorkOS SSO, password and work-email OTP sign-in** (BUGFREE_GATE 1.1-1.10) were not re-run:
   the demo accounts sign in through the reviewer endpoint only.
