# D-090 local QA captures

These captures are synthetic, local-only evidence from the D-090 branch after integration with the latest `origin/main`. The exact branch SHA at capture time is recorded in `manifest.json`. The QA runner used `BILLING_ENV=test`, `BYOR_LINK_ENABLED=true`, and `VITE_BYOR_LINK=true`; it intercepted API calls with fixtures and inherited no database, payment-provider, WorkOS API, production-backend, or real-account credentials.

The focused run passed **21 test files / 241 tests**. Seven UI states were captured at both 1280px and 390px (14 images total). All reports show **0px horizontal overflow** and **no unmatched API calls**.

The ask-expiry fixture was updated so `server/db.askExpiry.test.ts` passes **14/14**. Additionally, `/r/:token` was registered in `functions/_middleware.ts` (`KNOWN_ROUTE_PATTERNS`), and `scripts/seoRouteCoverage.test.ts` passes **11/11**. After merging latest `origin/main`, `pnpm check`, `pnpm build`, design-token audit and the 19 core/control suites pass cleanly (194/194 tests).

**This is not a complete QA pass.** Every browser capture records the expected server-session-only auth diagnostic because this environment has no non-production WorkOS test configuration. The reports and `manifest.json` mark the result `incomplete-auth-config`; the D-048 zero-console-error gate therefore remains open. No test/staging URL or seeded auth environment was configured. A temporary dummy-client probe emitted a browser CORS error and was stopped; no credentials were used and no account or product state changed. Do not treat these screenshots as proof of authenticated staging behavior or as authorization to enable the feature.

Run the bundle with:

```bash
BILLING_ENV=test BYOR_LINK_ENABLED=true VITE_BYOR_LINK=true node scripts/qa/d090-byor.mjs
```

The runner exits `2` when captures are produced but the local auth-config gate is incomplete, and `1` for actual test, API-mock, layout, or unexpected-console failures. Screenshots and per-state reports are grouped under this directory; the raw synthetic token is redacted in reports.
