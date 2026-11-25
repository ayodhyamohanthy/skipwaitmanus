# Sign-in retirement: canonical acceptance

November 19, 2026; PR #1326; reviewer and lander `GPT-6.1 Sol · 6f46`.

`receipt.json` is the unedited output of the read-only Chromium run against `https://skipwait.me`, expected SHA `28a2d7d13b0c3c9336602597280130d36eafc972`. It records ten screenshots: five signed-out states at 1280×900@1x and 390×844@2x. Every response was HTTP 200 with that exact meta SHA; every page had zero horizontal overflow or uncaught page errors. The separate local before/after comparison is under `design/goal-ui/captures/sign-in/retire-6f46/`.

No form was submitted. Every POST and external telemetry call was fulfilled locally. The referrer route checks the company-email input and absence of personal/social methods. Native inspection covered its phone image and the desktop expired-reset image. This proves the signed-out canonical surfaces, not a new authenticated sign-in cycle.

The final PR CI, main CI and Pages deployment links are recorded in `docs/plans/D-048-retire.md`. The unchanged API is ready on remote `api-runtime` `6c3de75ea4c0746bc531695ca55889d04ea32eca`; the repository verifier printed `CONVERGED`, and direct workers.dev returned 404. No unavailable release-check status is recast as a successful check.
