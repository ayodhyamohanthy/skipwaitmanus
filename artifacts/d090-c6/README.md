# D-090 local QA captures

These captures are synthetic, local-only evidence from the D-090 branch after integration with the latest `origin/main`. The exact branch SHA at capture time is recorded in `manifest.json`. The QA runner used `BILLING_ENV=test`, `BYOR_LINK_ENABLED=true`, and `VITE_BYOR_LINK=true`; it intercepted API calls with fixtures and inherited no database, payment-provider, WorkOS API, production-backend, or real-account credentials.

The focused run passed **21 test files / 241 tests**. Seven UI states were captured at both 1280px and 390px (14 images total). All reports show **0px horizontal overflow** and **no unmatched API calls**.

A full repository `LANG=en_US.UTF-8 pnpm vitest run` on source `83bd9a5f` initially reported 13 failures across two files. The 12 ask-expiry failures came from the legacy DB fixture not modeling `askInviteLinks`; after adding an empty-table fixture, `server/db.askExpiry.test.ts` passes **14/14**. The other failure is `scripts/seoRouteCoverage.test.ts`: `/r/:token` is routed in `client/src/App.tsx` but absent from `functions/_middleware.ts`, whose allowlist determines whether the route avoids an HTTP 404. D-090 packet §5 explicitly marks D-057 middleware out of scope; the owner directed us to leave D-090 blocked and skip, so no middleware change or draft PR was made. After the fixture correction, `pnpm check` and `pnpm build` passed; the full suite has not been rerun.

**This is not a complete QA pass.** Every browser capture records the expected server-session-only auth diagnostic because this environment has no non-production WorkOS test configuration. The reports and `manifest.json` mark the result `incomplete-auth-config`; the D-048 zero-console-error gate therefore remains open. No test/staging URL or seeded auth environment was configured. A temporary dummy-client probe emitted a browser CORS error and was stopped; no credentials were used and no account or product state changed. Do not treat these screenshots as proof of authenticated staging behavior or as authorization to enable the feature.

Run the bundle with:

```bash
BILLING_ENV=test BYOR_LINK_ENABLED=true VITE_BYOR_LINK=true node scripts/qa/d090-byor.mjs
```

The runner exits `2` when captures are produced but the local auth-config gate is incomplete, and `1` for actual test, API-mock, layout, or unexpected-console failures. Screenshots and per-state reports are grouped under this directory; the raw synthetic token is redacted in reports.
