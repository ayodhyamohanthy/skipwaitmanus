# skipwait.me — Handover Pack

> Everything a new maintainer needs to operate and extend this project.

---

## 1. Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Cloudflare account with Workers + Pages + Containers
- MySQL database (Azure MySQL recommended)
- WorkOS account (auth)
- Razorpay + PayPal accounts (payments)

### Local Development
```bash
git clone https://github.com/ayodhyamohanthy/skipwaitmanus.git
cd skipwaitmanus
pnpm install
cp .env.example .env  # Fill in DATABASE_URL, WORKOS_*, etc.
pnpm dev               # Starts both API and client
```

### Running Tests
```bash
pnpm test              # Full suite (~400 tests)
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests
pnpm check             # TypeScript type check
pnpm build             # Production build
```

---

## 2. Architecture

### Stack
- **Frontend**: React 18 + Vite + Tailwind CSS + wouter (routing)
- **Backend**: Express.js running in Cloudflare Container
- **Database**: MySQL via Drizzle ORM
- **Auth**: WorkOS AuthKit (JWT sessions)
- **Payments**: Razorpay (INR) + PayPal (USD) + Chargebee (billing)
- **Hosting**: Cloudflare Pages (frontend) + Cloudflare Containers (API)
- **CI/CD**: GitHub Actions (3 workflows: Design Gate, Deploy API, Deploy Web)

### Key Directories
```
client/src/pages/       # React page components
client/src/components/  # Reusable UI components
client/src/lib/         # Utilities, API helpers, SEO
server/                 # Express API routes
server/_core/           # Auth, DB connection, route registration
drizzle/                # Database migrations
functions/              # Cloudflare Pages Functions (sitemap, API proxy)
docs/                   # Documentation
docs/leap/              # This handover pack
docs/design/            # Style guide
```

### Request Flow
```
Browser → Cloudflare Pages → functions/api/[[path]].ts (proxy) → Worker → Container (Express)
                                       ↓
                              /sitemap.xml.ts (dynamic)
```

---

## 3. Deployment

### Automatic (GitHub Actions)
Every push to `main` triggers:
1. **Design Gate** — checks for design violations (kicker labels, contrast, text size)
2. **Deploy API** — builds Docker image, deploys to Cloudflare Containers
3. **Deploy Web** — builds Vite, deploys to Cloudflare Pages

### Manual Deploy
```bash
# Deploy API
npx wrangler deploy

# Deploy Web
pnpm build
npx wrangler pages deploy dist/public --project-name=skipwait
```

### Container Cold Start
The container sleeps after 10 minutes of inactivity. First request after sleep takes ~1.6s. To mitigate:
- Keep-warm cron (not yet implemented) pings /api/health every 5 min
- Or accept the latency for low-traffic periods

---

## 4. Database

### Schema Management
- Migrations in `drizzle/` directory (numbered: 0030_xxx.sql, 0031_xxx.sql, etc.)
- Schema reconciler runs at boot: `server/schemaReconcile.ts`
- If ALTER TABLE fails (Azure MySQL privileges), use admin UI: `/admin/schema` → "Run reconcile"
- Or use Azure Query Editor to apply DDL manually (see `docs/B2B_MONETIZATION_HANDOFF.md` §4)

### Key Tables
- `users` — all user accounts (seekers + referrers + admins)
- `jobs` — published job listings
- `referralRequests` — core referral workflow
- `companyOpportunities` — employee-shared openings
- `partnerModules` — sponsored partner content
- `userFollows` — follow graph (mutual follow unlocks DMs)
- `dmThreads` / `dmMessages` — direct messaging
- `paymentFulfillments` — payment records

---

## 5. SEO & Discoverability

### What's In Place
- **robots.txt**: Real file at `/robots.txt` with Sitemap directive
- **sitemap.xml**: Dynamic at `/sitemap.xml` — includes all public routes + live job pages
- **JSON-LD**: Organization + WebSite + SearchAction in index.html; per-route JobPosting on /jobs
- **Meta tags**: OG + Twitter cards on all pages
- **Per-route SEO**: `applySeo()` helper in `client/src/lib/seo.ts`

### Adding New Pages to Sitemap
Edit `functions/sitemap.xml.ts` — add to `STATIC_ROUTES` array.

---

## 6. Payments

### Razorpay (INR)
- Webhook: `POST /api/webhooks/razorpay`
- Creates `paymentFulfillments` records
- Admin review: `/admin/payments`

### PayPal (USD)
- Webhook: `POST /api/webhooks/paypal`
- Same fulfillment flow

### Chargebee
- Billing portal for seekers
- Plans: Free, Pro, Premium

---

## 7. Admin Features

### Key Admin Routes
- `/admin/users` — user management, suspend/unsuspend
- `/admin/approval` — referrer verification queue
- `/admin/payments` — payment review
- `/admin/partners` — partner module management
- `/admin/schema` — database schema reconciliation
- `/admin/activity` — audit log
- `/api/admin/referrals/export.csv` — referral ledger CSV export

### Admin Access
- Email: `ayodhya@skipwait.me` (configured via `SKIPWAIT_ADMIN_EMAIL` env var)
- Role: `admin` in users table

---

## 8. Monitoring & Alerts

### Health Endpoint
```
GET /api/health
{
  "ok": true,
  "commitSha": "5dea680...",
  "schemaReconciled": false,
  "schemaReconcileError": "..."
}
```

### Key Metrics to Watch
- `schemaReconciled` — should be `true`; if `false`, run admin reconcile
- `commitSha` — should match latest deploy; if stale, container hasn't recycled
- API TTFB — should be <1s warm, <2s cold

---

## 9. Rollback Procedures

### Frontend (Cloudflare Pages)
```bash
# List deployments
npx wrangler pages deployment list --project-name=skipwait

# Rollback to specific deployment
npx wrangler pages deployment rollback --project-name=skipwait --deployment-id=<id>
```

### API (Cloudflare Containers)
```bash
# Rollback requires redeploying previous commit
git checkout <previous-commit>
npx wrangler deploy
git checkout main
```

### Database
- Migrations are forward-only in production
- To revert: write a new migration that reverses the change
- Schema reconciler is idempotent — safe to re-run

---

## 10. Common Tasks

### Add a New Page
1. Create `client/src/pages/NewPage.tsx`
2. Add route in `client/src/App.tsx`
3. Add to sitemap in `functions/sitemap.xml.ts`
4. Call `applySeo()` for per-route title/description

### Add a New API Endpoint
1. Create route file in `server/` (e.g., `server/newRoutes.ts`)
2. Register in `server/_core/index.ts` → `registerAllRoutes()`
3. Add DI deps in the route file's `Deps` interface
4. Wire deps in `_core/index.ts`

### Add a Database Migration
1. Create `drizzle/00XX_description.sql`
2. Update `drizzle/meta/_journal.json` with new index
3. Add table/column to `drizzle/schema.ts`
4. Add to `server/schemaReconcile.ts` DESIRED_TABLES/DESIRED_COLUMNS
5. Test: `pnpm test` + `pnpm check`

---

*Generated: 2026-09-12 · skipwait.me Handover Pack v1.0*
