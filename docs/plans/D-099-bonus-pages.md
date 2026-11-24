# Packet D-099: public referral-bonus pages, one per company, every figure sourced (loop L5)

> **D-374 (owner, Nov 21): "Drop the bonus lead".** SkipWait never leads with an employer's referral bonus. Slice A keeps the sourced figures, admin entry and report path and drops the public `/bonuses` and `/bonuses/:slug` pages and their sitemap entries. Slice B keeps one neutral, sourced fact line on the company page (`/explore/:slug`) only, with no `/explore` list line and no link to a bonus page. Re-synced to D-378 on 2026-11-22: sections 1, 4 (rulings 6, 7, 8, 10), 5.3 (sitemap), 5.4, 5.5, 6, 7, 8 and 9 now follow D-374. Where older wording below still mentions `/bonuses` pages, the sitemap or a directory line, D-374 wins.

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it. Never open `server/db.ts` or `server/privateReferralRoutes.ts` whole; this packet needs neither.

| Field | Value |
|---|---|
| Queue rows | `D-099-bonus-pages` (slice A: data, admin entry and the report path; no public pages and no sitemap entries (D-374); Tier 1 because it adds a migration) and `D-099-bonus-line` (slice B: one neutral, sourced fact line on `/explore/:slug` only (D-374); Tier 2). There is no §3b row: status goes in this packet's Status section (D-134). |
| Decisions | D-099 (the spec), D-087 (L5 rules), D-089 (3) (build order 2, 1, 3, after the demand list), D-102 (every number is real), D-055 and D-063 (referrers are never paid by skipwait.me), D-097 (behind a flag), D-150 and the doctrine (one next step, one black commit), D-153 (plain intent first), D-149 (c) (money lines from `shared/moneyCopy.ts`), D-031 (no paid tools), D-068 and D-088 (docs and fullstack in the same push), D-163 |
| Size | A: L (four commits); B: S (one commit) |
| Implementer | any model; A gets an independent Tier 1 review by a model other than its builder (D-151) |
| Branches | A: `agent/claude/d099-bonus-pages`; B: `agent/queue/d099-bonus-line`, both from the latest `origin/main` |
| Depends on | A: `D-090-BYOR`, `D-089-request-inbox` and `D-086-demand-list` (the owner's order: ideas 2, then 1, then 3, after the demand list; D-162 waived the demand-list gate for BYOR only), plus `D-048-F-flags` and `D-048-F-routes`, which own `client/src/App.tsx` and `.env.example` first. B: `D-099-bonus-pages`, `D-048-p3-live-review-find` (B adds one line to the pages that row redesigns) and `D-048-F-primitives` (it owns `GoalListRow.tsx` first). The picker enforces all of them. |
| Verified against | `main` `06323e5c` on 2026-10-23 (CEO, Claude Code · e11c) |

## 1. Goal
Someone looking at a company page (`/explore/:slug`) can see, at most, one neutral fact line about the employer's own published referral programme: the figure, its source, the date we checked it, and that skipwait.me never pays referrers (D-374, D-055, D-087, D-323 (4)). SkipWait never leads with an employer's bonus and never offers it as a reason to refer: no `/bonuses` pages, no sitemap entries, no line in the `/explore` list, no title, heading, button, email subject, push or share text built on it. Every figure is real and sourced; with no checked figure there is no line at all.

## 2. Binding rules (quoted)
- D-099: "One crawlable page per company at /bonuses/{company}: mono figure, source and checked date, line that the employer sets and pays it and skipwait.me never does (D-055/D-063), seeker and referrer CTAs; index at /bonuses; "Report a wrong figure" on every page; directory and company pages gain a "Referral bonus: figure, source" line. Companies with no published figure show an honest "Not published" state; employer-published figures only at launch; employer currency only."
- D-087: "bonus lines name the employer's own programme and are never guaranteed; no seeker details exposed; referrers never charged"; "bonus figures only with source and date".
- D-102: "No fake counters ...; every number comes from the DB and may be zero."
- `docs/PRD.md:40`, the bonus honesty line (verbatim): "Most companies pay their own referral bonus when a referral they make is hired. That programme is your employer's and they pay it - skipwait.me never pays referrers."

## 3. Current behaviour (verified on `main` `06323e5c`)
1. **Companies.** `companies` is defined at `drizzle/schema.ts:166-179`: `slug` is `varchar(48)` and unique, and `status` is `listed`/`hidden`. `companyDomains` is at `:181-187`: lowercase `domain`, unique, `isPrimary`, and the FK cascades. The contracts are `shared/companies.ts` (`COMPANY_SLUG_PATTERN` :11, `publicCompanySchema` :32-44). The service is `server/companyDirectory.ts` (`list()` :64-67 returns listed companies only, `get(slug)` :68-71). The routes are in `server/companyDirectoryRoutes.ts`: `GET /api/companies` :75, `GET /api/companies/:slug` :80, cached `public, max-age=60` (:42). Admin gating is the local `requireAdmin` at `:63-73` (401 if signed out, 403 unless `role === "admin"`, logs `admin.companies_denied`). They are registered at `server/_core/index.ts:221`.
2. **Crawlability.**
   - The sitemap entries come from `shared/sitemap.ts`: `SITEMAP_STATIC_ROUTES` :7, and `companySitemapEntries` :57-62 lists `/explore/<slug>`. Two places build the sitemap: the container (`server/sitemapRoutes.ts:15`, registered at `server/_core/index.ts:225` with `listCompanyDirectory()`) and the Pages fallback (`functions/sitemap.xml.ts:50-57`, which fetches `/api/companies`).
   - Unknown paths get a 404 from `functions/_middleware.ts`, which lists `KNOWN_ROUTE_PATTERNS` at :22 (`/explore/:slug` is at :47). `scripts/seoRouteCoverage.test.ts` checks that list against `client/src/App.tsx`.
   - Head tags come from `applySeo` (`client/src/lib/seo.ts:28`), which `ExploreCompany.tsx:82` calls. Per-company pages are not prerendered.
   - The Worker serves only `/api/*` and `/sitemap.xml` (`src/worker.ts:76`).
3. **Client.** All routes are on one line of `client/src/App.tsx` (:121). The directory row is `GoalCompanyRow` (`client/src/components/goal/GoalListRow.tsx:71`, grid areas mark/name/fn/avail at :83-93), rendered at `client/src/pages/Explore.tsx:111-123`. The company page header is at `client/src/pages/ExploreCompany.tsx:124-148` (h1 :144, functions line :145). Its honest "Not enough …" state pattern is at :209. The mono numeral primitive is `GoalNum` (`client/src/components/goal/GoalNum.tsx:8`).
4. **Reports.** Every report route needs sign-in. `POST /api/safety-reports` (`server/safetyRoutes.ts:32`) allows 20 per 24 h per user (`server/db.ts:961`), and `POST /api/company-suggestions` (:61) allows 3 a day. No anonymous report endpoint and no generic rate limiter exist.
5. **Admin pages.** They are `client/src/pages/Admin*.tsx`. A 401 or 403 throws `AdminAccessError` (`client/src/components/admin/adminApi.ts:7`, :25). The small CRUD page to copy is `client/src/pages/AdminPartners.tsx` (list :28-41, create :44-54, toggle :56-62, denied state :35).
6. **Migrations.** `main` ends at `0108_landed_thank_you.sql`, and open branches hold more numbers. The lint (`scripts/lint-deploy-migrations.sh:8-23`) requires `NNNN_snake_case.sql`, `CREATE TABLE IF NOT EXISTS` only, guarded ALTER/INDEX and unique prefixes, with no DROP/TRUNCATE/RENAME/DELETE. `server/schemaReconcile.ts` mirrors a table in `DESIRED_TABLES` (:9), `DESIRED_COLUMNS` (:79), `DESIRED_INDEXES` (:198) and `DESIRED_FOREIGN_KEYS` (:290); copy the `landedJourney` entries (:76, :268-269, :328-330).
7. **Copy.** `shared/moneyCopy.ts:24` has `REFERRERS_NEVER_PAID` and `:29` has `REFERRER_MONEY_SENTENCE`. No shared constant holds the bonus honesty line yet.
8. **Analytics.** There is no `track()` helper and no product-event endpoint. Umami loads only when `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` are set (`client/index.html:55-69`), and only with consent (`client/src/components/CookieConsent.tsx:38-45`). The server activity log is `recordOperationalActivity` (`server/db.ts:1453`).
9. **Flags.** Copy the `COMPANY_RESPONSE_SIGNAL` pair: client `client/src/lib/flags.ts:5`, server `server/companyResponseSignal.ts:9-10`, which `companyDirectoryRoutes.ts:108` enforces as a 404 when off; it is declared in `.env.example:233-235`.
10. Nothing in `client/`, `server/` or `shared/` mentions a referral bonus today. "bonus credits" in `Premium.tsx` and `server/db.ts:4100` is a different thing; leave it alone.

## 4. Rulings (CEO, decided under D-074; changeable)
1. **A figure is entered by an admin who read it on the employer's own site.** There is no scraping, no AI extraction, and no referrer or seeker self-report at launch (D-102: every number real; D-099: employer-published only). An admin enters it at `/admin/bonuses`.
2. **The source must be on the company's own domain.** `sourceUrl` is `https:`, with no credentials and no port. Its host equals one of that company's `companyDomains.domain` values or ends with `.` + one of them. Anything else answers 400 "The source must be on {Company}'s own website." ATS-hosted pages wait for the owner's word; that is §11's stop.
3. **One current figure per company.** Store the amount in the currency's minor units, in the employer's currency (ISO 4217, no conversion). It may be marked "up to", with an optional plain-text scope note of at most 120 characters (for example "Engineering roles in India"). History lives in the activity log, not in a second table.
4. **Freshness.** A figure whose `checkedAt` is more than 365 days before now is treated as not published on every public surface; the admin list marks it "stale". Compute this in the app, never with MySQL `NOW()`.
5. **Formatting.** `Intl.NumberFormat` with `style: "currency"` and the stored currency, with locale `en-IN` for INR and `en-US` otherwise, and `maximumFractionDigits: 0` when the minor part is zero. The minor-unit divisor is the currency's default fraction digits (`resolvedOptions().maximumFractionDigits` of a plain currency formatter). So INR `5000000` shows "₹50,000", USD `200000` "$2,000" and JPY `100000` "¥100,000".
6. **No call to action rides on a bonus (D-374).** The fact line carries no button and no link to a bonus page; it never asks anyone to refer because of a bonus. The company page keeps its own existing next step, unchanged.
7. **Reports need sign-in,** like every report route today. Allow 5 per person per 24 hours, then one neutral 429 "You have sent several reports today. Thank you; we will look at them." A signed-out visitor sees "Sign in to report a wrong figure" (to `/sign-in?returnTo=<this page>`). The report link sits on the company-page fact line (slice B) and returns to `/explore/{slug}`. Reasons: `figure_changed`, `source_gone`, `not_this_company`, `other`. An optional note of at most 280 characters and an optional suggested `https:` source URL.
8. **No public bonus pages (D-374).** There is no `/bonuses` or `/bonuses/:slug` route, no `applySeo` page, no sitemap entry and no `functions/_middleware.ts` pattern for them. The only public surface is the one fact line on `/explore/:slug` (slice B).
9. **Flags, both off by default:** server `BONUS_PAGES_ENABLED`, where every new route answers 404 when off, and client `VITE_BONUS_PAGES`. Declare both in `.env.example`, forward the server key in `src/worker.ts`, and make the config contract test pass (FND-5).
10. **No new analytics infrastructure (D-031).** Measures: figures published (count), reports filed and resolved (DB), and the fact line's report-link opens (Umami, consent-gated, by path). Activity rows: `admin.company_bonus.upserted`, `admin.company_bonus.withdrawn`, `company_bonus.report_filed`, `admin.company_bonus_report.decided`. Never write the reporter's note into the activity log.

## 5. Target behaviour (testable)
### 5.1 Data (slice A)
Migration `drizzle/deploy/<next free>_company_referral_bonuses.sql`. Take the next free number on `main` and in plan §5 when you commit, and check again when you land. It holds two `CREATE TABLE IF NOT EXISTS` statements:
- `companyReferralBonuses`: `id` INT PK AI; `companyId` INT NOT NULL UNIQUE, FK `companies.id` ON DELETE CASCADE; `amountMinor` BIGINT NOT NULL; `currency` CHAR(3) NOT NULL; `upTo` BOOLEAN NOT NULL DEFAULT FALSE; `scopeNote` VARCHAR(120) NULL; `sourceUrl` VARCHAR(2048) NOT NULL; `checkedAt` DATETIME NOT NULL; `status` ENUM('published','withdrawn') NOT NULL DEFAULT 'published'; `updatedByUserId` INT NOT NULL; `createdAt`, `updatedAt` DATETIME NOT NULL.
- `companyBonusReports`: `id` INT PK AI; `companyId` INT NOT NULL, FK ON DELETE CASCADE; `reporterUserId` INT NOT NULL; `reason` ENUM('figure_changed','source_gone','not_this_company','new_source','other') NOT NULL; `note` VARCHAR(280) NULL; `suggestedSourceUrl` VARCHAR(2048) NULL; `status` ENUM('open','fixed','dismissed') NOT NULL DEFAULT 'open'; `createdAt` DATETIME NOT NULL; `reviewedAt` DATETIME NULL; `reviewedByUserId` INT NULL; index (`status`, `createdAt`); index (`reporterUserId`, `createdAt`).

Mirror both in `drizzle/schema.ts` and `server/schemaReconcile.ts` (all four arrays).

### 5.2 Contracts: `shared/referralBonus.ts` (new)
Zod schemas, strict, so unknown keys fail.
- **Public types.** `publicBonusSchema` is `{ amountMinor, currency, upTo, scopeNote: string | null, sourceUrl, sourceHost, checkedAt: ISO date string }`. `bonusListResponseSchema` is `{ bonuses: Array<{ company: { slug, name, initials }, bonus: publicBonus }> }`. `bonusDetailResponseSchema` is `{ company: { slug, name, initials }, state: "published" | "not_published", bonus: publicBonus | null }`.
- **Admin types.** The upsert input is `{ amountMinor: positive int ≤ 10^12, currency: /^[A-Z]{3}$/ and accepted by Intl, upTo, scopeNote ≤ 120 | null, sourceUrl, checkedAt: ISO date not in the future }`. The report input is `{ reason, note ≤ 280 | null, suggestedSourceUrl: https | null }`.
- **Pure functions:** `formatBonus(bonus)` (ruling 5, with "Up to " when `upTo`), `isFresh(checkedAt, now)` (ruling 4) and `sourceHostAllowed(url, domains)` (ruling 2).

### 5.3 Server (slice A)
- `server/referralBonusStore.ts` (new) holds the DB reads and writes; `server/db.ts` is not touched.
- `server/referralBonusRoutes.ts` (new) is registered next to `server/_core/index.ts:221`. Every route answers 404 while `BONUS_PAGES_ENABLED` is off.

| Route | Who | Answer |
|---|---|---|
| `GET /api/company-bonuses` | public, `public, max-age=300` | listed companies with a published, fresh figure, sorted by name |
| `GET /api/company-bonuses/:slug` | public, same cache | 404 for an unknown or hidden company; otherwise `state` + `bonus` |
| `POST /api/company-bonuses/:slug/reports` | signed in | 201 `{ ok: true }`; 401; 400 on a bad body; 429 neutral after 5 in 24 h |
| `GET /api/admin/company-bonuses` | admin | every company with its figure, `stale` and open report count |
| `PUT /api/admin/company-bonuses/:companyId` | admin | upsert (ruling 2 checked against that company's domains); 400 with the plain message |
| `POST /api/admin/company-bonuses/:companyId/withdraw` | admin | status `withdrawn` |
| `GET /api/admin/company-bonus-reports?status=open` | admin | reports with company slug and name, never the reporter's email |
| `POST /api/admin/company-bonus-reports/:id/decision` | admin | `{ decision: "fixed" \| "dismissed" }` |

- **Admin gating** copies `requireAdmin` from `companyDirectoryRoutes.ts:63-73`, and it is checked before any read.
- **Public payloads come from an allow-list:** no `id`, `updatedByUserId`, `status`, report data or counts of reports.
- **No sitemap entries (D-374).** `shared/sitemap.ts`, `server/sitemapRoutes.ts` and `functions/sitemap.xml.ts` are not changed by this packet.

### 5.4 Client (slice A): admin entry only (D-374)
- **Routes.** `client/src/App.tsx` gains `/admin/bonuses` only. No `/bonuses` or `/bonuses/:slug` route, page, `applySeo` call or middleware pattern. `client/src/lib/flags.ts` gains `BONUS_PAGES` from `VITE_BONUS_PAGES` (it gates the slice B fact line).
- **`/admin/bonuses`** (`client/src/pages/AdminBonuses.tsx`) is modelled on `AdminPartners.tsx`:
  - a company list with figure, `stale` and open reports;
  - an edit form for the upsert, showing the server's 400 message under the field;
  - withdraw, with a confirm;
  - the open reports with Fixed/Dismissed;
  - the denied state on 401/403.
  - Add one link in the admin navigation (`client/src/pages/AdminOverview.tsx`).
- **Report form** (`client/src/components/bonus/ReportBonusFigure.tsx`): ruling 7's form, opened from the slice B fact line; signed out it shows "Sign in to report a wrong figure" to `/sign-in?returnTo=/explore/{slug}`.
- **Copy constants.** Add `REFERRAL_BONUS_HONESTY` to `shared/moneyCopy.ts`, with the PRD text verbatim (§2). The fact line imports it, never retypes it (D-149 (c)).

### 5.5 Slice B: one fact line on the company page (D-374)
- **Company page only.** Only while `BONUS_PAGES` is on and a published, fresh figure exists, `/explore/:slug` shows one neutral line under its functions line: "{Company}'s own referral programme: {figure} · source {sourceHost} · checked {d MMM yyyy}", then `REFERRAL_BONUS_HONESTY`, then a plain "Report a wrong figure" link (ruling 7). No button, no link to a bonus page, no "Refer" or "Ask" wording tied to the figure.
- **Nothing elsewhere.** No line in the `/explore` list, no "not published" line on the company page (no figure means no line), and no title, heading, meta description, share text or email built on the bonus.
- **Data.** One `GET /api/company-bonuses` through React Query, mapped by slug. A failed or 404 fetch shows no line and never blocks or errors the page.

## 6. Steps (one commit each)
- A1: contracts, formatter and rules (`shared/referralBonus.ts`) with their tests; `REFERRAL_BONUS_HONESTY`.
- A2: the migration, `drizzle/schema.ts`, `server/schemaReconcile.ts`, `server/referralBonusStore.ts`, `server/referralBonusRoutes.ts` and its registration, the flag, `.env.example` and `src/worker.ts`, with route tests. No sitemap or middleware change (D-374).
- A3: the report form component and the client flag, with client tests (fictional fixtures only). No public pages (D-374).
- A4: `/admin/bonuses` plus the admin nav link, client tests, and docs (§9).
- B1: the one fact line on `/explore/:slug` only, client tests, captures at 1280 and 390.

## 7. Tests to write first (red before the code)
1. `shared/referralBonus.test.ts`:
   - `formatBonus` for INR, USD and JPY, plus "Up to";
   - `isFresh` at 365 days minus a second (fresh) and 365 days plus a second (stale);
   - `sourceHostAllowed`: the exact domain and a subdomain pass; another domain, a lookalike (`evilwipro.com` for `wipro.com`), `http:`, credentials and a port fail;
   - strict schemas reject unknown keys, a zero or negative amount, `usd` and `ABC`.
2. `server/referralBonusRoutes.test.ts`:
   - flag off: every route answers 404;
   - list: only listed companies with a published, fresh figure; a hidden company's slug answers 404; not published gives `state: "not_published"` and `bonus: null`;
   - the public payload keys equal the allow-list exactly; `Cache-Control` is set;
   - admin routes answer 401 and 403 before any store call;
   - the upsert refuses a source on another domain with the plain message; withdraw hides the figure from both public routes;
   - reports: 401 signed out, 400 on a bad body, the 6th in 24 h answers 429; an activity row is written for each mutation and carries no note text.
3. D-374 guards: `client/src/App.tsx` has no `/bonuses` route, `functions/_middleware.ts` no bonus pattern, and the sitemap builders emit no bonus entry with the flag on or off.
4. The existing `scripts/seoRouteCoverage.test.ts`, migration lint, schema reconcile contract and config contract tests pass with the new routes, tables and keys (they fail first if you forget one).
5. `client/src/components/bonus/reportBonusFigure.test.tsx`: the signed-out link to `/sign-in?returnTo=/explore/{slug}`; the signed-in form posts, shows success and shows the 429 message; reasons exclude `new_source`.
6. `client/src/pages/adminBonuses.test.tsx`: the denied state, the list, the 400 message shown under the field, withdraw with confirm, a report decision.
7. Slice B: the company-page line shows only with the flag on and a fresh figure, with the honesty line and the report link and no button or bonus-page link; nothing renders without a figure; the `/explore` list never shows a bonus line; a failed fetch shows nothing and the page still renders.

## 8. Edge cases
- A company renamed or hidden after a figure was entered: hidden means 404 everywhere, and the figure stays in admin.
- A company with several domains: any of them may host the source.
- A figure edited twice in one minute: the last write wins, and there are two activity rows.
- A report about a figure later withdrawn: it stays decidable in admin.
- A slug with characters that need encoding: the report link's `returnTo` encodes it once.

## 9. Definition of done
- [ ] Every §7 test was red first and is green now, and no existing assertion was weakened.
- [ ] Gate on your commit merged with the latest `origin/main` (`docs/BRIEF.md` "How to ship"); `node scripts/scope-check.mjs <task-id>` is clean.
- [ ] Slice A: an independent Tier 1 review passed (D-151); findings fixed red-first.
- [ ] Both flags off in production. A QA pass with them on, on a test environment, covers: an admin enters a figure for a fictional company → its company page shows the one fact line (and the `/explore` list does not) → a report → an admin decision → withdraw → the line disappears.
- [ ] Docs in the same push: this Status section; `docs/plans/assignments.json`; the `AGENTS.md` living-map row (add "Referral-bonus fact line (`/api/company-bonuses*`, `/api/admin/company-bonuses*`, one line on `/explore/:slug`)"); the `docs/PRD.md` roadmap row; the `docs/DECISIONS.md` D-099 sync cell; plan §5 (the migration number).
- [ ] Live after landing: API `verify-live-release.sh` CONVERGED, web `git-commit` meta matches, and `/bonuses` still answers the not-found page (no route exists).

## 10. Review checklist (for the independent reviewer of slice A)
1. Prove every public route answers 404 while the server flag is off, by a request in a test, not by reading code.
2. Prove the public payload is the allow-list exactly (§5.3), and that no reporter data reaches any public route.
3. Prove ruling 2 with a lookalike domain and a subdomain, and that the check reads that company's own `companyDomains`, never a client-supplied list.
4. Prove freshness and formatting use app time and the stored currency, with no conversion.
5. Prove the referrer commit uses `referrerSignInHref` and that no copy says or implies skipwait.me pays or guarantees a bonus (D-055, D-087).
6. Check the migration against the lint and the reconcile arrays, and that its number is free on `main` at landing.
7. Check the captures at 1280 and 390 against `DESIGN.md` and the doctrine: one black commit, the goal line first, no kit components.

## 11. Stop and ask (report blocked to the CEO) if
- the only published figure for a launch company is on an ATS or third-party page, not the employer's own domain (ruling 2 waits for the owner);
- a programme publishes only a range or per-level table that "up to" plus a 120-character scope note cannot state truthfully;
- any step would need a new dependency, a paid tool, scraping or a model call;
- the redesigned `/explore` row (slice B) has no place for one more line without breaking its one-next-step rule.

## Status
Two rows share this packet (D-134); each writes its own line.
- D-099-bonus-pages: in progress — DeepSeek V4.1 Flash · d158 — 2026-11-24 — branch agent/claude/d099-bonus-pages. A1-A4 are built and pushed (contracts, migration 0127 + store + eight routes, the report form, `/admin/bonuses`); both flags are off. The row is AHEAD OF ITS DEPENDENCIES (D-315): it opens a draft pull request and does not land or mark done until `D-089-request-inbox` and the other dependencies are done.
- D-099-bonus-line: todo; waits for `D-099-bonus-pages`, `D-048-p3-live-review-find` and `D-048-F-primitives`.
- D-099-bonus-pages and D-099-bonus-line: re-synced to D-378 — Claude Code · e969 — 2026-11-22. Entries naming them since D-227: D-219 and D-221 (pricing re-sync lists; this packet has no credit or price wording, and its honesty line agrees), D-366 (7) (the bonus hold) and D-374 (the owner's answer). Slice A keeps data, admin entry and the report path and drops the public pages and sitemap. Slice B is one neutral, sourced fact line on `/explore/:slug` only. Dependencies are unchanged.
