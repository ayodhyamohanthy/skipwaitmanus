# /sign-in captures (D-285, row D-048-p3-signin)

Whole-page Chromium captures at 1280×900 and 390×844 (device scale 1), from a
local `pnpm dev` of commit `c9a78b5` (`sign-in` in `RELEASED`, so no
`VITE_GOAL_SURFACES` was set). The `kit-before-*` files are the same server
before the release commit, which renders today's kit page.

The code routes were answered by the capture script, never a real backend or
inbox: `/api/auth/workos/email-code/send` and `/api/auth/otp/send` return
`{ "sent": true }`, and for `seeker-error-*` a 429 with the server's own words.
The address typed is the fictional `asha@example.com`. Cookie consent was
pre-set to "essential" so the banner does not cover the form.

| File stem | Route | Persona | State |
|---|---|---|---|
| `seeker-email` | `/sign-in` | job seeker | email step, the default visit |
| `seeker-code` | `/sign-in` | job seeker | code step after a sent code |
| `seeker-error` | `/sign-in` | job seeker | a refused send shows the server's words |
| `referrer-email` | `/sign-in?intent=referrer` | referrer | work-email step |
| `referrer-code` | `/sign-in?intent=referrer` | referrer | code step after a sent code |
| `kit-before-seeker-email`, `kit-before-referrer-email` | same | same | the kit page this replaces |

Measured on every capture: horizontal overflow 0 px; the only console error is
the local-only `[auth] VITE_WORKOS_CLIENT_ID is not set` notice.
