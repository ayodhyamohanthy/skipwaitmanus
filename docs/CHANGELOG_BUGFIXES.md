# Changelog — Bug-fix release 2026-09-03

## Fixed
- **BUG-1 (MEDIUM)** — Payment gateway labels are now honest: "Razorpay (INR)" / "PayPal (USD)" with "Secure hosted checkout via Chargebee" descriptor on /premium and /plans. No more misleading processor claims.
- **BUG-2 (LOW)** — Chargebee returns 503 "not configured" (not 502) when env keys are missing.
- **BUG-3 (LOW)** — Admin refund button only appears on status='credited' rows.
- **BUG-4 (LOW)** — Referral claim errors are classified (403/404/409/500) instead of all-409.
- **BUG-5 (MEDIUM)** — Unknown /api/* paths return JSON 404 instead of 200 SPA HTML.
- **BUG-6 (LOW)** — Removed dead ManusDialog component with stale branding.

## Files changed (commit 94cb16f)
- client/src/lib/paymentRoute.ts + paymentRoute.test.ts
- client/src/pages/Plans.tsx, Premium.tsx, tokenRecovery.routes.test.tsx, plans.paymentRoute.test.tsx
- client/src/pages/AdminPaymentsReview.tsx
- server/chargebeeRoutes.ts
- server/privateReferralRoutes.ts
- server/_core/index.ts
- client/src/components/ManusDialog.tsx (deleted)

## Verification
- Full test suite: 261 passed / 5 skipped
- Typecheck clean, build exit 0
- Deployed to skipwait.me via CI (self-verifying pipeline)
