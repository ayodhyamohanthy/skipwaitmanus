# DECISIONS.md — dated architecture and product decisions

Append-only. Each entry: date, decision, reason, alternatives rejected, approvals.

## 2026-09-24 — Keep the existing stack (playbook §6.1/§10.1 V0-04 seed)

**Decision:** Express 4 + Vite 7 + React 19 + wouter, Drizzle + mysql2 → Azure MySQL, WorkOS AuthKit + work-email OTP, Cloudflare Containers/Pages. No migration to Next.js/Supabase/Vercel.
**Reason:** Verified working in CURRENT_STATE.md (48 routes, 55 tables, live deploys, ~186 test files). The playbook mandates keeping a working stack absent a documented reliability/cost/security/capability reason; none established.
**Rejected:** Next.js App Router + Supabase (playbook's greenfield default) — would discard a working product for fashion; also conflicts with repo rule AGENTS.md §3.
**Approval:** standing repo rule; founder may override with a documented reason.

## 2026-09-24 — Billing providers: Chargebee + Razorpay + PayPal (retain)

**Decision:** Keep the three-provider billing surface behind Chargebee-first checkout; no Stripe adoption.
**Reason:** Implemented, webhook-hardened, and Razorpay review was the India constraint that motivated it. No validated demand for Stripe presented.
**Approval:** provider changes need founder sign-off per playbook §0.3.

## 2026-09-24 — PROGRESS/DECISIONS/CHANGELOG discipline adopted

**Decision:** All agent sessions coordinate via GitHub issue #23, feature branches, reviewed PRs, atomic commits, and these files updated in the same change as the work.
**Reason:** Prevents the multi-session overwrite and untracked-work failures seen previously.
