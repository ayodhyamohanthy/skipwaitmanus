# Independent sign-in retirement comparison

Reviewer `GPT-6.1 Sol · 6f46`, November 19, 2026, PR #1326. This evidence closes the earlier builder's image-input and phone-capture gaps. It does not change product source or sign-in policy.

`receipt.json` binds 28 screenshots to baseline `2e4b83d2` and candidate runtime `ceed6901`. All 14 before/after PNG pairs have identical SHA-256 hashes. Seven states cover `/sign-in` (seeker and referrer), passkey management, `/forgot-password`, `/reset-password` (valid and absent synthetic token) and `/reviewer-sign-in` at 1280×900@1x and 390×844@2x. Clean contexts have zero page errors and horizontal overflow. Browser actions also verify work-email-only referrer entry and query-only navigation from passkey management back to sign-in.

The reviewer inspected phone seeker/forgot/reviewer and desktop referrer/reset images through native image input. Every other before/after pair is byte-identical. This is local production-build parity, not live signed-in acceptance.

The capture generator serves two existing production builds on separate loopback ports. Every API and external request is fulfilled locally; no login, OTP send, password change, provider call, payment or business mutation reaches a server. The passkey-options probe after returning to sign-in is also intercepted. No production credentials or sessions are used.

To reproduce, build the pinned sources in separate worktrees with the repository's existing packages, then run:

```sh
node design/goal-ui/captures/sign-in/retire-6f46/capture.mjs \
  /absolute/path/to/baseline /absolute/path/to/candidate /absolute/path/to/output
```

Later evidence-only commit `5198ef43` and clean main integration `32eb91f8` leave the captured auth source unchanged. Current main's additional runtime changes belong to other surfaces; the combined review snapshot `c7f05d79` was built separately.
