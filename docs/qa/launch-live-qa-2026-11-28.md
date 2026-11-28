# LAUNCH-live-qa evidence, November 28 2026

Session: Claude Code · 3770, branch `agent/queue/launch-live-qa-acceptance`. No password, hash, cookie or
authenticated response body appears here. Both runs used only the two demo accounts. No payment, checkout,
provider call or admin route was made; the journeys run spent and returned free sandbox allowance only (D-393).

## Release under test

| Surface | Commit | How read |
|---|---|---|
| Web (Pages) | `f9d4ff39016139a25c4283eb64ce5366314827be` | `git-commit` meta on `https://skipwait.me/`, and both runs' `summary.json` `release.web` |
| API (Containers) | `f02de526ad1dbb29fbfb5496980c64bf17f3d12e` | `GET /api/health/ready` `commitSha`, and both runs' `summary.json` `release.api` |

The two differ because web and API deploy on separate path filters (AGENTS.md invariant 6). The journeys run
checked that both stayed unchanged from start to finish (`release-stable` ok).

## Runs

| Run | What it is | Result |
|---|---|---|
| [46082469033](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46082469033) | Live QA (signed in, navigate) after the web release above | Seeker 22/24 captures clean, referrer 14/14; fails only on `/messages` (below) |
| [46085771891](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46085771891) | Live QA `mode=journeys`, dispatched from main `6df32ef60` (OPS-live-qa-journeys) | success, 39/39 steps |
| [46081971890 e2e journeys](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46081971890/job/140782771041) | CI `e2e journeys` on web commit `f9d4ff390` | success |
| [46039083827 e2e journeys](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46039083827/job/140641886811) | CI `e2e journeys` on API commit `f02de526` | success |

## What the navigate run proves (46082469033)

- Both demo accounts signed in (200).
- Seeker `/plans`, `/billing`, `/requests`, `/ask`, `/explore`, `/alerts`, `/inbox`, `/profile`, `/settings`,
  `/invite`, `/support` and referrer `/referrer-home`, `/queue`, `/referrer/impact`, `/inbox`, `/invite`,
  `/profile`, `/settings`, each at 1280 and 390: document 200, no sign-in redirect, no page error, no 5xx, no
  sideways scroll, and the account menu offers Sign out.
- Across all 38 captures: 0 failed requests, 0 console errors, 0 page errors. The Nov 24 WorkOS 400 on every
  page is gone.
- **Defect:** seeker `/messages` at 1280 and 390 renders 200 but has no account menu, so a signed-in person
  cannot sign out there. Issue #1708, row `P0-messages-account-menu`. **Fixed** by PR #1720 (`356a954b6`): the post-release signed-in run [46091325701](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46091325701) passed every seeker and referrer route, `/messages` included.

## What the journeys run proves (46085771891)

- Identity verified before every mutation; free-only allowance before the first send; no purchase.
- Privacy (D-019(e)): referrer preview and claimed view hold no name and no file link; the document answers
  404 before acceptance, 200 only after the referrer's own acceptance, 404 again after step-back; seeker
  reads of the referrer views answer 403 `work_email_code_required`; a non-owner withdrawal answers 404.
- Transitions: create → claim → accept → step-back → withdraw; withdraw before pickup; claim → decline →
  withdraw.
- Keyed ledger: request 25 `25#1` + `25#refund#1`, request 26 `26#1` + `26#refund#1`, request 27 `27#1` only
  (employee decline keeps the charge, D-147).
- Job-link preview: the reviewed fixture resolved fresh to its company.
- Captures inspected: `/queue` before claim (role, function, New only) and the accepted `/conversation` (the
  demo seeker's name and resume, Mark as referred) at 1280 and 390.
- Cleanup: 0 requests remain, 0 uncertain creates.

## Banded sales

Signed-out `GET /api/chargebee/banded/offer` at 2026-11-28 00:12 UTC answered 200 with `onSale: true` and the
three banded plans (BANDED-release). Read only; nothing was bought.

## Not covered here

BUGFREE_GATE 1.1–1.10 are owner tests (real inboxes, provider dashboards) outside this row. Real-money
payment legs stay owner-run (D-065).
