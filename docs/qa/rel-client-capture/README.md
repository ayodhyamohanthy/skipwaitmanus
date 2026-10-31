# REL-client-capture: 1280/390 sign-in captures (packet Done item 4)

Packet: `docs/plans/REL-production-watch.md` § REL-client-capture.
Task branch: `agent/queue/rel-client-capture`, code head `9d3cc7cb` (merge of `origin/main` `5a0ca702`).
Captured 2026-10-31 by Qoder · 83b9 (make-green session; not a review).

- `before-*`: `origin/main` `5a0ca702`, unmodified.
- `after-*`: task branch head `9d3cc7cb` (apiFetch adoption in `WorkEmailSignIn`, `ReferrerOtpSignIn`, `PendingCheckoutReturn`).
- Both served by the repo's local dev server on the same machine, Chromium via Playwright 1.62.1,
  deviceScaleFactor 1, reduced motion, after `document.fonts.ready` and a 1.2 s settle.
- Screens: `/sign-in?intent=referrer` (work-email OTP form) and `/email-review/<48-char token>` signed out
  (`WorkEmailSignIn` compact).

Every before/after pair is byte-identical (sha256 prefix):

| screen | viewport | sha256 (both files) |
|---|---|---|
| referrer-otp | 1280 | `3099c5de5f4d79fa…` |
| referrer-otp | 390 | `1c41833bf27d2f60…` |
| work-email | 1280 | `f3a9d627da7d89ef…` |
| work-email | 390 | `8dd620008affff93…` |

The row's diff changes only which fetch wrapper the submit handlers call; no markup or style changed.
These files are kept on this evidence branch because capture paths are outside the row's declared `owns`.
