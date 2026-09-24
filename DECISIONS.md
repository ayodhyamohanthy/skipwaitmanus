# DECISIONS.md — dated architecture and product decisions

Append-only. Each entry: date, decision, reason, alternatives rejected, approvals.

## 2026-09-24 — Keep the existing stack, full record (playbook §6.1/§10.1, V0-04)

**Decision:** Express 4 + Vite 7 + React 19 + wouter, Drizzle + mysql2 → Azure MySQL, WorkOS AuthKit + work-email OTP, Cloudflare Containers/Pages. No migration to Next.js/Supabase/Vercel.
**Reason:** Verified working in CURRENT_STATE.md (51 routes, 55 tables, live deploys, 187 test files). The playbook mandates keeping a working stack absent a documented reliability/cost/security/capability reason; none established.
**Approval:** standing repo rule (AGENTS.md §3); founder may override with a documented reason.

### Alternatives analysis (all rejected)

1. **Next.js App Router + Supabase (Postgres/Auth/Storage) + Vercel** — the playbook's greenfield default (§10.1). Rejected: this repo is not greenfield; migration would discard 55-table schema, two auth planes, and three-provider billing for zero validated gain. Also conflicts with AGENTS.md §3.
2. **Firebase** — playbook says fine for MVP, consider Supabase when relational queries are needed. We already have relational (MySQL + Drizzle) with transactional request/claim paths; Firebase would be a downgrade, not a migration.
3. **Render-only hosting** (drop Cloudflare) — `render.yaml` blueprint exists and `docs/DEPLOY.md` documents it as the free starting path, but Cloudflare deploys are live and working; no reliability or cost reason to consolidate. Keep both paths.
4. **PostHog analytics now** — deferred, not rejected: no analytics pipeline exists in tree and playbook §10 requires privacy-safe events; vendor choice (PostHog vs. alternatives) needs founder approval per §0.3 (new third-party data sharing). Recorded as V0-07 work.

### Verification notes (how the above was checked)

- Stack versions read directly from `package.json` (TS 5.9.3, Node ≥22, pnpm 10.4.1, Express 4.21.2, Vite 7, React 19, drizzle-orm, mysql2, @workos-inc/node).
- Deploy paths read from `wrangler.jsonc`, `Dockerfile`, `render.yaml`, `.github/workflows/deploy-api.yml`, `deploy-pages.yml`, `docs/DEPLOY.md`.
- Route/table/test counts counted from the tree (51 `<Route>`, 55 `mysqlTable`, 187 `*.test.*`), not estimated.
- Pricing/commercial-use: **not independently re-verified this session** (no vendor pages checked). No migration is proposed, so no approval is blocked. Before relying on any free tier (Cloudflare credits, Render free, Aiven free per DEPLOY.md), re-check current limits and business-use terms — flagged for V0-05/V0-06.
- Migration rule stands: any future stack change requires a DECISIONS.md proposal with cost, benefits, risks, data migration, and rollback + founder approval first.

## 2026-09-24 — Billing providers: Chargebee + Razorpay + PayPal (retain)

**Decision:** Keep the three-provider billing surface behind Chargebee-first checkout; no Stripe adoption.
**Reason:** Implemented, webhook-hardened, and Razorpay review was the India constraint that motivated it. No validated demand for Stripe presented.
**Approval:** provider changes need founder sign-off per playbook §0.3.

## 2026-09-24 — PROGRESS/DECISIONS/CHANGELOG discipline adopted

**Decision:** All agent sessions coordinate via GitHub issue #23, feature branches, reviewed PRs, atomic commits, and these files updated in the same change as the work.
**Reason:** Prevents the multi-session overwrite and untracked-work failures seen previously.
