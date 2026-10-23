# Packet D-099: public referral-bonus pages, one per company, every figure sourced (loop L5)

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it. Never open `server/db.ts` or `server/privateReferralRoutes.ts` whole; this packet needs neither.

| Field | Value |
|---|---|
| Queue rows | `D-099-bonus-pages` (slice A: data, admin, public pages, sitemap; Tier 1 because it adds a migration) and `D-099-bonus-line` (slice B: one line on `/explore` and `/explore/:slug`; Tier 2). There is no §3b row: status goes in this packet's Status section (D-134). |
| Decisions | D-099 (the spec), D-087 (L5 rules), D-089 (3) (build order 2, 1, 3, after the demand list), D-102 (every number is real), D-055 and D-063 (referrers are never paid by skipwait.me), D-097 (behind a flag), D-150 and the doctrine (one next step, one black commit), D-153 (plain intent first), D-149 (c) (money lines from `shared/moneyCopy.ts`), D-031 (no paid tools), D-068 and D-088 (docs and fullstack in the same push), D-163 |
| Size | A: L (four commits); B: S (one commit) |
| Implementer | any model; A gets an independent Tier 1 review by a model other than its builder (D-151) |
| Branches | A: `agent/claude/d099-bonus-pages`; B: `agent/queue/d099-bonus-line`, both from the latest `origin/main` |
| Depends on | A: `D-090-BYOR`, `D-089-request-inbox` and `D-086-demand-list` (the owner's order: ideas 2, then 1, then 3, after the demand list; D-162 waived the demand-list gate for BYOR only), plus `D-048-F-flags` and `D-048-F-routes`, which own `client/src/App.tsx` and `.env.example` first. B: `D-099-bonus-pages`, `D-048-p3-live-review-find` (B adds one line to the pages that row redesigns) and `D-048-F-primitives` (it owns `GoalListRow.tsx` first). The picker enforces all of them. |
| Verified against | `main` `06323e5c` on 2026-10-23 (CEO, Claude Code · e11c) |

## 1. Goal
Someone searches "<Company> referral bonus" and lands on `skipwait.me/bonuses/<company>`. They see the bonus the employer itself publishes, with its source and the date we checked it. They also see one plain next step: an employee is asked to refer people there (referrer supply is the bottleneck, D-087), and a seeker can ask for a referral. Every figure is real and sourced, or the page says plainly that the employer has published none. skipwait.me never pays it and never says or implies it does.

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
6. **The next step on a bonus page is the referrer's.** There is one black commit, "Refer people at {Company}", to `referrerSignInHref()` (`client/src/lib/referrerSignIn.ts:7`; its default return, `/referrer-setup`, is the right first stop for a new referrer; never `SignInButton`, D-030). The seeker's "Ask for a referral at {Company}" is a ghost link to `/explore/{slug}`. Why: L5 pulls search traffic from employees looking up their own bonus, and verified employees are the supply the product lacks (D-087).
7. **Reports need sign-in,** like every report route today. Allow 5 per person per 24 hours, then one neutral 429 "You have sent several reports today. Thank you; we will look at them." A signed-out visitor sees "Sign in to report a wrong figure" (to `/sign-in?returnTo=<this page>`). Reasons: `figure_changed`, `source_gone`, `not_this_company`, `new_source` (the only reason offered on a "Not published" page), `other`. An optional note of at most 280 characters and an optional suggested `https:` source URL.
8. **Crawlable to the same standard as `/explore/:slug`.** Client-rendered with `applySeo` (title, description, canonical) and listed in the dynamic sitemap only while the server flag is on and only for companies with a published, fresh figure. `/bonuses` is listed while the flag is on. Do not add them to `shared/publicRoutes.ts` or `SITEMAP_STATIC_ROUTES` (those are prerendered and listed even while off). `functions/_middleware.ts` lists both patterns. With the client flag off, both routes render the app's existing not-found page.
9. **Flags, both off by default:** server `BONUS_PAGES_ENABLED`, where every new route answers 404 when off, and client `VITE_BONUS_PAGES`. Declare both in `.env.example`, forward the server key in `src/worker.ts`, and make the config contract test pass (FND-5).
10. **No new analytics infrastructure (D-031).** Measures: figures published (count), reports filed and resolved (DB), `/bonuses*` page views and the referrer sign-in starts from them (Umami, consent-gated, by path), and referrers verified at a bonus-page company within 30 days (DB, aggregate only). Activity rows: `admin.company_bonus.upserted`, `admin.company_bonus.withdrawn`, `company_bonus.report_filed`, `admin.company_bonus_report.decided`. Never write the reporter's note into the activity log.

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
- **Sitemap.** `shared/sitemap.ts` gains `bonusSitemapEntries(origin, list)` (`/bonuses` plus `/bonuses/<encoded slug>`). `server/sitemapRoutes.ts` appends them only while the flag is on. `functions/sitemap.xml.ts` fetches `/api/company-bonuses` and treats a 404 as "none".

### 5.4 Client (slice A)
- **Routes.** `client/src/App.tsx` gains `/bonuses`, `/bonuses/:slug` and `/admin/bonuses`. `functions/_middleware.ts` gains `/bonuses` and `/bonuses/:slug`. `client/src/lib/flags.ts` gains `BONUS_PAGES` from `VITE_BONUS_PAGES`.
- **`/bonuses/:slug`** (`client/src/pages/BonusCompany.tsx`). It uses React Query (no `useEffect` fetching) and the goal primitives only (`client/src/components/goal/`), at 1280 and 390.
  - Goal line h1: "{Company} referral bonus".
  - Published: the figure in `GoalNum`, then "Source: {sourceHost} · checked {d MMM yyyy}" (the source is a link with `rel="nofollow noopener noreferrer"`, `target="_blank"`), then the scope note if set, then the honesty line.
  - Not published: "{Company} has not published a referral bonus we could check.", then the honesty line.
  - "Your next step" block: the black "Refer people at {Company}" plus a ghost "Ask for a referral at {Company}".
  - Footer link "Report a wrong figure" (on a not-published page: "Know where {Company} publishes it? Tell us"). It opens the report form (ruling 7).
  - `applySeo`:
    - title "{Company} referral bonus";
    - description "{figure} referral bonus at {Company}, from {sourceHost}, checked {date}." when published, else "{Company} has not published a referral bonus we could check.";
    - path `/bonuses/{slug}`.
  - States: loading, unknown company (the not-found page), error and offline with a retry, each explicit.
- **`/bonuses`** (`client/src/pages/Bonuses.tsx`).
  - Goal line h1: "Find a company's referral bonus."
  - The list of published companies, each row a link to its page, with the figure in `GoalNum` and the source host.
  - The count line "{N} companies with a checked figure." uses the real N, which may be 0. When N is 0: "No company figures are checked yet." Below: "Don't see your company? It has not published a figure we could check."
  - The same next-step block with no company named: black "Refer people at your company", ghost "Ask for a referral".
- **`/admin/bonuses`** (`client/src/pages/AdminBonuses.tsx`) is modelled on `AdminPartners.tsx`:
  - a company list with figure, `stale` and open reports;
  - an edit form for the upsert, showing the server's 400 message under the field;
  - withdraw, with a confirm;
  - the open reports with Fixed/Dismissed;
  - the denied state on 401/403.
  - Add one link in the admin navigation (`client/src/pages/AdminOverview.tsx`).
- **Copy constants.** Add `REFERRAL_BONUS_HONESTY` to `shared/moneyCopy.ts`, with the PRD text verbatim (§2). Pages import it, never retype it (D-149 (c)).

### 5.5 Slice B: the directory and company line
- **Directory.** Only while `BONUS_PAGES` is on and a published, fresh figure exists, add one line in the directory row: "Referral bonus: {figure} · {sourceHost}". It goes in the row's `fn` slot (`GoalListRow.tsx:92`) or a new grid area, whichever the redesigned row from D-048-p3-live-review-find has.
- **Company page.** Add the same line under its functions line, linking to `/bonuses/{slug}`. With no figure, the company page shows "Referral bonus: not published" linking to the bonus page; the directory shows nothing.
- **Data.** One `GET /api/company-bonuses` through React Query, mapped by slug. A failed or 404 fetch shows no line and never blocks or errors the page.

## 6. Steps (one commit each)
- A1: contracts, formatter and rules (`shared/referralBonus.ts`) with their tests; `REFERRAL_BONUS_HONESTY`.
- A2: the migration, `drizzle/schema.ts`, `server/schemaReconcile.ts`, `server/referralBonusStore.ts`, `server/referralBonusRoutes.ts` and its registration, the flag, `.env.example` and `src/worker.ts`, the sitemap (both builders) and the middleware patterns, with route tests.
- A3: `/bonuses` and `/bonuses/:slug`, the report form and the flag, with client tests and captures at 1280 and 390 (fictional fixtures only).
- A4: `/admin/bonuses` plus the admin nav link, client tests, and docs (§9).
- B1: the line on `/explore` and `/explore/:slug`, client tests, captures.

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
3. `shared/sitemap` test: bonus entries only for published, fresh figures, slugs URL-encoded. `server/sitemapRoutes` includes them only with the flag on. `functions/sitemap.xml.ts` tolerates a 404.
4. The existing `scripts/seoRouteCoverage.test.ts`, migration lint, schema reconcile contract and config contract tests pass with the new routes, tables and keys (they fail first if you forget one).
5. `client/src/pages/bonusCompany.test.tsx` and `bonuses.test.tsx`:
   - loading, error and offline with retry;
   - published (figure, source link attributes, checked date, honesty line from the constant);
   - not published;
   - exactly one black commit, going to `referrerSignInHref`, plus the ghost seeker link;
   - the signed-out report link, and the signed-in form posts, shows success and shows the 429 message;
   - flag off renders the not-found page;
   - N = 0 copy on the index.
6. `client/src/pages/adminBonuses.test.tsx`: the denied state, the list, the 400 message shown under the field, withdraw with confirm, a report decision.
7. Slice B: the line shows only with the flag on and a fresh figure; a failed fetch shows nothing and the page still renders; "not published" only on the company page.

## 8. Edge cases
- A company renamed or hidden after a figure was entered: hidden means 404 everywhere, and the figure stays in admin.
- A company with several domains: any of them may host the source.
- A figure edited twice in one minute: the last write wins, and there are two activity rows.
- A report about a figure later withdrawn: it stays decidable in admin.
- A slug with characters that need encoding: the sitemap encodes it, and the client route decodes it once.

## 9. Definition of done
- [ ] Every §7 test was red first and is green now, and no existing assertion was weakened.
- [ ] Gate on your commit merged with the latest `origin/main` (`docs/BRIEF.md` "How to ship"); `node scripts/scope-check.mjs <task-id>` is clean.
- [ ] Slice A: an independent Tier 1 review passed (D-151); findings fixed red-first.
- [ ] Both flags off in production. A QA pass with them on, on a test environment, covers: an admin enters a figure for a fictional company → the public page, the index and the sitemap show it → a report → an admin decision → withdraw → the not-published state.
- [ ] Docs in the same push: this Status section; `docs/plans/assignments.json`; the `AGENTS.md` living-map row (add "Referral-bonus pages (`/api/company-bonuses*`, `/api/admin/company-bonuses*`, `/bonuses*`)"); the `docs/PRD.md` roadmap row; the `docs/DECISIONS.md` D-099 sync cell; plan §5 (the migration number).
- [ ] Live after landing: API `verify-live-release.sh` CONVERGED, web `git-commit` meta matches, and `/bonuses` shows the not-found page while the flag is off.

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
- D-099-bonus-pages: todo; waits for `D-090-BYOR`, `D-089-request-inbox`, `D-086-demand-list`, `D-048-F-flags` and `D-048-F-routes`.
- D-099-bonus-line: todo; waits for `D-099-bonus-pages`, `D-048-p3-live-review-find` and `D-048-F-primitives`.
