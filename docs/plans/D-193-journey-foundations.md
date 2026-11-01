# Packet D-193: the server foundations and fixes the D-174 seeker journey needs

> Read `docs/BRIEF.md` first, then this packet. Each row below is its own task: claim it with the picker, build only that row, and edit only the paths its row lists in `owns` (scope-check fails anything else).

| Field | Value |
|---|---|
| Queue rows | `D-174-fix-post-binding`, `D-174-sample-job-removal`, `D-174-held-ask-reconfirm`, `D-174-company-search`, `D-174-job-catalog`, `D-176-public-claims`, `D-174-job-sources-more`, `D-174-ask-from-job`, `D-174-pool-nudges`, `D-175-coverage-study` (status lives in `docs/plans/assignments.json`; each row writes its line in the Status section at the end) |
| Decisions | D-174, D-175, D-176, D-180, D-193 (binding text quoted in §2); also D-006, D-022, D-034, D-040, D-042, D-047, D-060, D-061, D-062, D-097, D-101, D-110, D-132, D-170, D-189 |
| Companion | D-189 (#620) returns `D-174-seeker-journey-build` (the journey UI) to a packet on `agent/queue/d174-seeker-journey`; that packet takes §6 below as its server dependency list. `D-174-expiry-clock-removal` keeps its own scope (its row note) and now waits for `D-174-held-ask-reconfirm` (§4.5). |
| Verified against | `main` `02a8a028` on Oct 24 2026; production API `26a35834`, web `1c14dfef`. Three independent critics (code accuracy, decisions and money, executability) checked this packet before it was published; their confirmed findings are folded in. |
| Migrations | Reserved here and in `docs/KIT_V4_BUILD_PLAN.md` §5: **0120** `job_catalog` (`D-174-job-catalog`), **0121** `remove_sample_job` (`D-174-sample-job-removal`). No other row adds a migration. |

## 1. Goal
The owner's journey (D-174) is: type a company, pick it, see its live jobs, filter, pick a job, request a referral, answer a few questions, add a resume, send. If someone at the company can refer, it goes to them; if not, it waits in the company's pool for whoever verifies later. Today the first half of that journey has no server behind it: no code anywhere fetches a company's jobs, search is a client-side filter over 39 hand-seeded companies, and a request cannot carry a picked job. This packet defines the contracts and server rows, plus fixes for defects found while mapping the journey. The UI steps stay with `D-174-seeker-journey-build` (§6).

## 2. Binding rules (quoted, not paraphrased)
- D-174: "pick a company from the maintained directory, see that company's live jobs, filter, pick a job, ask, answer the questions, add a resume, send - and an ask never expires". "The company pool is the existing waiting-for-coverage queue (D-061/D-062) ... (capacity rules unchanged)". "No new debit, refund or ledger behavior is created by this entry."
- D-175: "a company's own careers page is the source of truth for its verified current jobs." "Never show an invented opening, never call an incomplete list complete, and where a company's jobs cannot be fetched reliably the product says so plainly. No paid data source, no bulk scraping that risks a user or platform account".
- D-176: "referrer availability is backend routing, never a browse gate or a visible status." "coverage data is not exposed through the directory."
- D-180: user-facing surfaces use referral vocabulary; "a request is never displayed as a submitted or completed referral". New copy in these rows says "referral request" or "request a referral", never "find a referral" or "get referred".
- D-170: "Source coverage is added only when verified ... every further source joins after its own verification, and no unverified listing is ever shown."
- D-110: every job always shows a level; "level unread" never shows.
- D-060: "reminders only as the owning decision names them, at most one such email per person per day (a digest beyond that)".
- D-097: every new feature ships behind a switch that is off until QA verifies it. These rows use an exported `const ... = false` in their own module, the repository's existing pattern (`PASS_SALES_ENABLED`, `REFERRER_PURCHASES_ENABLED`), so turning one on is a reviewed one-line change.
- D-193 (this change): the rulings summarized in §4 and recorded in `docs/DECISIONS.md`.

## 3. Current behaviour (verified Oct 24; find each function by name, line numbers drift)
1. **No job ingestion exists.** No file on `main` or on any open branch calls `boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com` or `api.smartrecruiters.com`. D-170's "Greenhouse boards are live-verified" refers only to the job-link preview (`server/jobLinkPreview.ts`), which previews a link a seeker pasted. Its pinned-DNS helper `pinnedDispatcher` is module-private, and `fetchPublicJobLink` refuses API hosts (`allowedHostedApi` allows only `boards.` and `job-boards.`) and returns an empty body above 512,000 bytes, so a catalog fetcher cannot reuse `fetchPublicJobLink`.
2. **The `jobs` table is not a feed.** `listJobs` (`server/db.ts`) reads one table that also holds a placeholder row per company request (`companyAskJobRow`, title `PLACEHOLDER_JOB_TITLE` "Role from shared job link"), hidden from `/api/jobs` only by string matching. `/jobs` publishes up to 50 rows as schema.org `JobPosting` markup (`jobsJsonLd` in `client/src/lib/seo.ts`). `referralRequests.jobId` and `savedRoles.jobId` reference `jobs` with `ON DELETE CASCADE`.
3. **A fabricated listing is public.** Production `GET /api/jobs` returns one row: "Senior Frontend Engineer", company `acme.com`, description "Test role for loop verification", also in `/sitemap.xml` and the `JobPosting` markup. It is production data, not a seed in the repo. The Oct 14 audit flagged it (`docs/GOAL_ALIGNMENT_AUDIT_2026-10-14.md`).
4. **Company search** is `findModel.ts`'s client substring filter over name, industry and functions, using `GET /api/companies` (`server/companyDirectoryRoutes.ts`), which returns the whole directory unpaginated, with `openToReferrals` per company and a top-level `openCount`. There are no name aliases. `normalizedEmployerKey` (`server/employerRouting.ts`) deletes accented letters instead of folding them, so "Société" keys as "socit".
5. **Unlisted companies.** `createCompanyReferralRequest` (`server/db.ts`) does not require a directory company: a pasted careers-page link at an unlisted company already creates a request that waits by domain. Only the search path dead-ends ("No matching companies yet" → the `/invite` vote panel, which says it creates no request).
6. **A picked job does not reach the request.** The send body is cast, not parsed by one Zod schema. URL-domain resolution and `CompanyLinkMismatchError` run before an `opportunityId` is read, and `companyAskJobRow` ignores the post's `roleTitle` and `location`. **Pricing reads the job row:** with `ASK_LEVEL_COST` on, `askPriceAtCreate` classifies the stored job row's title, description and URL, and `GET /api/company-referrals/quote` classifies only the normalized link. They agree today only because every job row carries the same placeholder title and description.
7. **#612 regressions (live in web `1c14dfef`; latent because production has zero posted roles at all 39 companies):** (a) a signed-out seeker who picks a posted role and taps sign-in loses the post: `askPrefillSchema` (`client/src/lib/askPrefill.ts`) is a `z.strictObject` with no `opportunityId`, and the return path is a bare `/ask`; (b) on `/explore/:slug` (`ExploreCompany.tsx`), `postSelection` in `useAskComposer.tsx` survives the hero "Ask for a referral", "Ask anyway" and closing the drawer, so a later generic request can carry the earlier post's `opportunityId` (on `/explore`, `resetForm` clears it).
8. **False availability claims, live:** the signed-in Home (`client/src/pages/Home.tsx`, the "OPEN DOORS AT LAUNCH" block) falsely promises referral availability at the five launch companies, and the `/explore` description (`shared/publicRoutes.ts` and `exploreDescription` in `client/src/lib/companyDirectory.ts`) makes the same unsupported promise for companies including Wipro and TCS. Production `/api/companies` marks only skipwait and go-neutrinos open.
9. **The pool hands off one at a time, through one function.** A waiting request is invisible until a verified employee is available; then `deliverWaitingAskTx` (`server/db.ts`) spends the seeker's credit and allocates it to one referrer (capacity 3, D-062). It is reached from `deliverWaitingAsksToReferrer` (called after `completeWorkEmailOtpEnrollment` and `saveVerifiedWorkEmail`), from `openCompanyReferralAvailability`, and from the hourly `coverage-delivery-retry` sweep (`server/coverageDeliverySweep.ts` → `tryDeliverWaitingAsk`). A held request (no credit at first visibility) is retried only by that sweep, so it is delivered and charged at the first hourly run after any credit lands (D-047), however old it is. Colleagues see a request only after a pass or the 48 h allocation lapse. Delivery writes the referrer notice and the review links, and sends no email: the review email is fire-and-forget from the send route (`privateReferralRoutes.ts`, `referralReviewDispatch.ts`), which needs a request origin. There is no outbox for it.
10. **Expiry also fires on reads** (`reconcileExpiredPendingReferrals`), not only in the sweep, and client countdowns use the creation-based `getAskExpiresAtMs` (`shared/referral.ts`). This matters to `D-174-expiry-clock-removal`, whose runtime list should include both.
11. **Job sources (live GETs, Oct 24).** Free, documented, no-key public endpoints: Greenhouse (`boards-api.greenhouse.io/v1/boards/{token}/jobs`, `?content=true` for descriptions), Lever (`api.lever.co/v0/postings/{site}?mode=json`; README: published postings "may be scraped by third parties"), Ashby (`api.ashbyhq.com/posting-api/job-board/{name}`). About 15 of the 39 directory companies answer on one of these (for example stripe, mongodb, coinbase, pinterest, discord on Greenhouse; openai, snowflake, 1password on Ashby). None of the three carries a standard seniority field. An unknown token returns 404 (Greenhouse), `[]` (Lever) or 200 with 0 results (SmartRecruiters): never proof of zero jobs. SmartRecruiters' API host `robots.txt` disallows every crawler but LinkedInBot. Workday, SuccessFactors, Oracle, Taleo, iCIMS, Eightfold and Phenom have no licensed public read API. TCS, Infosys and Cognizant block scripted requests (403).

## 4. Rulings this packet builds on (D-193)
1. **Sources at launch:** Greenhouse first (`D-174-job-catalog`), then Ashby and Lever (`D-174-job-sources-more`). A company's board is used only after it is verified by a link from the company's own careers domain, recorded as `evidenceUrl` with `verifiedAt` by an admin. A 404, `[]` or zero result is "unverified", never "0 jobs". Nothing else is fetched until the owner answers §7.
2. **Display:** fetched jobs live in their own table, never in `jobs`. Show title, location, level, a short description snippet and the canonical apply link, with a source line ("From {Company}'s careers site, updated {date}"). Never say "all jobs" unless the source returned a complete list. No `JobPosting` markup for fetched jobs. Order: employee-posted roles (D-022) first, then careers-site jobs newest first; a sponsored item only as a labelled Featured listing (D-040).
3. **Seniority is the price's level.** No launch provider has a standard level field, so every catalog job's level is `assignJobLevel` (`shared/jobLevel.ts`, D-110: always a level, leaning lower) on exactly the three fields a request from that job will carry: the job's title, its snippet as the description, and its apply link as the URL. The level a seeker filters by, the level quoted and the level charged under D-132 are therefore one computation. No "level not stated" bucket.
4. **Pool:** D-174 keeps the capacity rules, so the D-062 one-at-a-time hand-off stays. The owner's words are "whoever sign-up they will be able to see" (D-174). This packet narrows that, as a CEO reading within the capacity rules, to what costs nobody anything: a verified employee sees how many requests wait at their company (a count, no seeker data), a pool delivery sends the referrer the same review email a fresh request gets (at most one a day, D-060), and a lapse or pass tells the colleagues who can now see it. Charging at pickup so every employee sees every request is §7 question 1. D-196 (owner, Oct 24) gives paid referrer plans level-matched first access before the free pool. It is unbuilt and changes who is handed a request first, which its own build owns; these nudges do not change the hand-off order.
5. **Reconfirmation prevents an old held request from spending without the seeker.** D-061 already requires reconfirmation before a request sent more than 30 days earlier spends at first visibility; it was never built. D-174 removes expiry closures as launch direction. `D-174-held-ask-reconfirm` implements reconfirmation without closure: an unconfirmed request remains waiting. Without that safeguard, removing the old waiting closure could let hourly delivery charge a months-old held request as soon as a credit lands; `D-174-expiry-clock-removal` therefore waits for this row, and goes live only with `ASK_RECONFIRM_ENABLED` on.
6. **Ownership:** the journey UI on `/explore`, `/explore/:slug` and `/ask` is `D-174-seeker-journey-build`'s (`docs/plans/GOAL_UI_COVERAGE.md` §2 names it; `D-048-p3-live-review-find` does the doctrine acceptance after it). New server work never rides a UI row. Dropping `openToReferrals` and `openCount` from the public `GET /api/companies` payload (D-176) waits for the D-189 journey packet, because the composer's cost line and the drawer read them today; that packet rules how the pre-send state squares with D-176 and adds the row.

## 5. The rows
Every row: claim through the picker, red tests first, one commit per step, `pnpm check` plus its focused tests green on each commit, the full gate on the merged result. Tier 1 rows open a draft PR and get an independent review by a model that neither built nor fixed the work (D-151). Each row's **Stop if** list is in addition to the general ones: a cited function or contract has changed on `main`, a test fails for a reason you cannot explain, or the work needs a file outside `owns`. Stopping means: push your work, `--report blocked` with the question, and wait for the CEO.

### 5.1 `D-174-fix-post-binding` (Tier 1, S)
- **Waits for:** `D-132-audit` (#547 edits `useAskComposer.tsx` and `ExploreCompany.tsx`).
- **Do:** carry the picked post across sign-in: add optional `opportunityId` (positive integer) to `askPrefillSchema`, and make `askSignInReturnTo` (`client/src/pages/explore/signInHandoff.ts`) return to the company door with the drawer open and the post selected. Clear `postSelection` whenever the drawer closes, and whenever it opens from anything other than a post row (hero ask, "Ask anyway"). While a post is selected, the drawer's job-link field (`AskDrawer.tsx`) shows the post's link read-only with a "Change role" control that clears the selection.
- **Tests (red first):** `client/src/lib/askPrefill.test.ts`: `opportunityId` round-trips and a non-integer is rejected. `client/src/pages/exploreDrawer.test.tsx`: signed-out pick → sign in → the send body carries the same `opportunityId`; pick a post, close the drawer, open the hero ask, send → no `opportunityId`; the link field is read-only while a post is selected, and "Change role" clears it.
- **Owns:** `client/src/lib/askPrefill.ts`, `client/src/lib/askPrefill.test.ts`, `client/src/pages/explore/signInHandoff.ts`, `client/src/pages/explore/useAskComposer.tsx`, `client/src/pages/explore/AskDrawer.tsx`, `client/src/pages/ExploreCompany.tsx`, `client/src/pages/explore.test.tsx`, `client/src/pages/exploreDrawer.test.tsx`.
- **Done when:** the tests pass, every existing explore and ask test stays green, captures at 1280 and 390 show the read-only link state, and the independent review passes.
- **Stop if:** keeping the post across sign-in needs a server change.

### 5.2 `D-174-sample-job-removal` (Tier 2, S; no migration; amended Oct 25 by the #649 ruling)
- **Why amended:** the original mechanism, a guarded `DELETE FROM jobs` in data migration 0121, can never deploy. `scripts/lint-deploy-migrations.sh` rejects every `DELETE FROM` as destructive, and it runs in CI and in `scripts/apply-deploy-migrations.sh`. The lint protects production data on every deploy and stays as it is (#649, CEO ruling under D-200 (2)). The 0121 reservation is no longer needed.
- **Do:**
  - Port #104's read filter into a new module, `server/testCatalogJobs.ts`. It exports:
    - `isTestCatalogJob(row)`, true for a `company` or `targetRoleUrl` host in `acme.com`, `example.com`, `example.net` or `example.org` (or a subdomain), or in the `.test`, `.example`, `.invalid` or `.localhost` TLDs, and for a description that starts with "Test role";
    - `publicCatalogJobs(listJobs)`, which returns a `listJobs` that drops those rows.
  - Wrap every public job list in `publicCatalogJobs`:
    - in `server/_core/index.ts`, the private referral routes' `listJobs` (`/api/jobs`), the sitemap's `listJobs` and `searchJobs`;
    - in `server/routers.ts`, the tRPC `jobs.list` resolver.
  - Nothing is deleted. The filter also hides any future fixture, and removing the wrapper reverses it.
- **Tests (red first):** `server/testCatalogJobs.test.ts` covers:
  - #104's three cases: the live acme.com row is dropped, reserved and test hosts are dropped, real roles are kept (including "Acme Logistics" and a non-URL `targetRoleUrl`);
  - `publicCatalogJobs` dropping `{id:1, company:"acme.com", description:"Test role for loop verification"}` from a stubbed `listJobs` while keeping a real row.
- **Owns:** `server/testCatalogJobs.ts`, `server/testCatalogJobs.test.ts`, `server/_core/index.ts (switch only)`, `server/routers.ts (switch only)`. The two wiring files take at most 12 changed lines each, and the scope check enforces that. `D-174-job-catalog` also holds `server/_core/index.ts (switch only)`; two switch-only claims on one file no longer wait for each other. The row does not touch `server/db.ts` or `server/privateReferralRoutes.ts`.
- **Done when:** after the API deploy, `https://skipwait.me/api/jobs` and `/jobs` no longer show the row. Paste both responses in the report.
- **Stop if:** a wired list still returns the row after the deploy. Report it blocked with the response, and do not write a migration.

### 5.3 `D-174-held-ask-reconfirm` (Tier 1, M; money path)
- **Waits for:** `D-048-fix-post-copy`, `POSTMERGE-oct22-fixes` (the #619 money-path fixes) and `D-132-audit` (D-197). All three edit `server/db.ts`; the audit also owns `server/privateReferralRoutes.ts` and `shared/moneyCopy.ts`. Build on the audit's `deliverWaitingAskTx`: the reconfirm check sits before the spend and never changes the amount.
- **Do:**
  - New `shared/askReconfirm.ts`: `export const ASK_RECONFIRM_ENABLED = false` and `export const RECONFIRM_AFTER_DAYS = 30`, plus the Zod schema of the confirm response.
  - In `deliverWaitingAskTx`, under the request's row lock and before any spend, allocation or notice: when the switch is on, the request was created more than 30 days before `nowMs`, and it has no `reconfirmed` transition event, it is not delivered. If it has no `reconfirm_requested` event yet, write one (`referralTransitionEvents.action` is `varchar(40)`: no migration) and one in-app notice to the seeker, keyed once per request. Return a new `CoverageDeliveryOutcome` variant `{ outcome: "awaiting_reconfirm"; requestId }` (`server/coverageDelivery.ts`). No credit moves, no referrer is allocated, the request keeps its waiting or held state, and nothing closes it. Every delivery entry point (§3.9) goes through this one function, so this one check covers all of them.
  - `POST /api/company-referrals/:id/reconfirm` (`server/privateReferralRoutes.ts`): the signed-in seeker who owns the request only (any other caller gets the same 404 as a missing request). If the request is not awaiting reconfirm, return 409. Otherwise write one `reconfirmed` event, idempotently, then call `tryDeliverWaitingAsk`, which spends exactly as today under `ask-delivery:<requestId>` if a referrer is available, and otherwise leaves the request waiting. One confirmation lasts until delivery.
  - The seeker's request list (the payload `/requests` reads) gains `awaitingReconfirm: boolean`. On `/requests` (`client/src/pages/MyRequests.tsx`), such a request shows "Still want this referral request sent? Confirm to send it." with a Confirm control. Withdraw stays available. New copy keys go in `shared/moneyCopy.ts` as additions only; no existing line changes (D-173, #598).
  - **No email in this row.** D-061 names one email at day 30, but no seeker pending-action email exists yet (D-060's sends are unbuilt). The in-app notice is the channel until a D-060 email row lands. Nothing is lost if the seeker never sees it: the request just waits, uncharged.
- **Tests (red first):** `server/askReconfirm.test.ts`:
  - A 31-day-old held request plus a new credit → the sweep does not spend; it writes one `reconfirm_requested` event and one notice. A second sweep writes neither again.
  - Confirm → exactly one spend under the same idempotency key. A double confirm spends once.
  - Withdraw while awaiting → no spend.
  - A 29-day-old request → delivered exactly as today.
  - With the switch off, everything is exactly as today.
  - Another seeker's confirm → 404.

  `client/src/pages/myRequests.reconfirm.test.tsx`: the Confirm control shows only for `awaitingReconfirm`, and a failed confirm says so in plain words.
- **Owns:** `shared/askReconfirm.ts`, `server/db.ts`, `server/coverageDelivery.ts`, `server/privateReferralRoutes.ts`, `shared/moneyCopy.ts`, `server/askReconfirm.test.ts`, `client/src/pages/MyRequests.tsx`, `client/src/pages/myRequests.reconfirm.test.tsx`.
- **Done when:** tests pass, the existing coverage-delivery, D-034/D-047 and money-check suites stay green, captures at 1280 and 390 show a request awaiting reconfirm, and the independent review passes. The switch stays off; QA turns it on, and it is on before `D-174-expiry-clock-removal` goes live.
- **Stop if:** a delivery path exists that does not go through `deliverWaitingAskTx`.

### 5.4 `D-174-company-search` (Tier 2, M)
- **Do:** `GET /api/companies/search?q=` returns at most 10 directory companies, Zod-validated, `Cache-Control: public, max-age=60`. Register it in `server/companyDirectoryRoutes.ts` **before** `/api/companies/:slug`, or "search" is read as a slug.
  - **Match order:** normalized name prefix, then alias, then name-contains. Never match on industry or functions.
  - **Normalizer** (`server/companySearch.ts`): NFKD fold, lowercase, strip punctuation, and drop legal suffixes (Ltd, Pvt, Private Limited, Inc, LLC, GmbH, Corp). Do not reuse or change `normalizedEmployerKey`: that one routes employers.
  - **Aliases:** a static map `shared/companyNameAliases.ts` keyed by directory slug, for example `tcs: ["Tata Consultancy Services"]` and `go-neutrinos: ["Go Neutrinos", "Neutrinos"]`. Cover every one of the 39 directory companies that has a common long or short name. No table and no migration; moving aliases to the database is a later row if admins need to edit them.
  - The response carries no availability field (D-176).
- **Tests (red first):** `server/companySearch.test.ts` (normalizer and matcher): "tata" finds TCS; "Societe Generale" matches "Société Générale"; "Data" does not return every company; at most 10 results; prefix ranks before contains. `server/companyDirectoryRoutes.test.ts`: `/api/companies/search` is not swallowed by `/:slug`; unknown query keys are refused; the payload has no availability field.
- **Owns:** `server/companySearch.ts`, `server/companySearch.test.ts`, `shared/companyNameAliases.ts`, `shared/companies.ts`, `server/companyDirectoryRoutes.ts`, `server/companyDirectoryRoutes.test.ts`.
- **Done when:** tests pass, and after the deploy `https://skipwait.me/api/companies/search?q=tata` returns TCS (paste the response).

### 5.5 `D-174-job-catalog` (Tier 1, L; migration 0120)
- **Contracts first,** in `shared/jobCatalog.ts`, with Zod and inferred types:
  - `export const JOB_CATALOG_ENABLED = false`.
  - `companyJobSources`: `id`, `companyId` FK, `provider` (`varchar(20)`; the Zod enum is `greenhouse` in this row), `boardToken`, `evidenceUrl`, `verifiedAt`, `lastFetchedAt`, `lastCount`, `status` (`verified` / `unverified` / `failing`), unique (`provider`, `boardToken`).
  - `catalogJobs`: `id`, `companyId` FK, `sourceId` FK, `externalId`, unique (`sourceId`, `externalId`), `title`, `rawLocation`, `locations` (normalized JSON array), `workMode` (`onsite` / `hybrid` / `remote` / `unknown`), `department`, `jobFunction` (`classifyJobFunction` from `shared/jobFunctionClassifier.ts` on title and department; null when unknown), `level` (1–10, §4.3), `applyUrl`, `snippet` (plain text, at most 400 characters), `publishedAt`, `updatedAt`, `firstSeenAt`, `lastSeenAt`, `closedAt`. Indexes on (`companyId`, `closedAt`) and (`companyId`, `level`).
  - The output of `GET /api/companies/:slug/jobs?q=&location=&level=&function=&cursor=`: jobs (at most 50 a page), facet counts, `source` (`null` when unverified), `syncedAt`, and `completeness` (`complete` / `partial` / `unavailable`).
- **Migration** `drizzle/deploy/0120_job_catalog.sql` (forward-only), the matching `drizzle/schema.ts` tables, and a `server/schemaReconcile.ts` entry.
- **Fetcher:** export `pinnedDispatcher` and `isPublicAddress` from `server/jobLinkPreview.ts` (the `export` keyword only; no behaviour change there). `server/jobSources/fetch.ts` allows exactly the host `boards-api.greenhouse.io`, uses the pinned dispatcher, follows no redirects, has a 20 s timeout and a 25 MB cap (above it the source becomes `failing`, never a truncated list), and parses every response with Zod.
- **Greenhouse adapter** in `server/jobSources/greenhouse.ts`: use `?content=true` for the snippet, with HTML stripped. Add a deterministic location parser with fixtures from real Greenhouse strings: split multi-city strings, detect Remote and Hybrid, and alias names such as Bangalore/Bengaluru and NYC.
- **Refresh:**
  - Add the daily job `job-catalog-sync` to `SCHEDULED_JOB_NAMES` (`shared/scheduledJobs.ts`), `server/scheduledJobRegistry.ts`, and the pinned list in `server/scheduledJobsContract.test.ts`.
  - Fetch on open when `lastFetchedAt` is older than 1 hour, with a 60 s cache.
  - Upsert on (`sourceId`, `externalId`).
  - A job missing from a successful full fetch gets `closedAt`. A failed fetch changes no job and marks the source `failing`.
- **Admin:** `POST /api/admin/job-sources` (admin only, Zod body) records a source with its `evidenceUrl`. Verification is a human step, and there is no auto-discovery.
- **Routes** in `server/jobCatalogRoutes.ts`, registered in `server/_core/index.ts` (switch only). While `JOB_CATALOG_ENABLED` is false, the jobs route answers `completeness: "unavailable"` and the sync job does nothing.
- **Tests (red first):**
  - `shared/jobCatalog.test.ts`: Zod rejects unknown fields.
  - `server/jobSources/greenhouse.test.ts`: a 404 board stays `unverified` and never reads as "0 jobs"; location-parser fixtures; a response over the cap marks the source `failing`; any other host is refused.
  - `server/jobCatalogRoutes.test.ts`:
    - A closed job leaves the API.
    - One company's slug never returns another company's jobs.
    - No catalog row appears in `/api/jobs` or the `JobPosting` markup.
    - The level equals `assignJobLevel` on (title, snippet, applyUrl).
    - With the switch off, the route answers `unavailable`.
- **Owns:** `shared/jobCatalog.ts`, `shared/jobCatalog.test.ts`, `server/jobSources/**`, `server/jobCatalogRoutes.ts`, `server/jobCatalogRoutes.test.ts`, `drizzle/deploy/0120_job_catalog.sql`, `drizzle/schema.ts`, `server/schemaReconcile.ts`, `shared/scheduledJobs.ts`, `server/scheduledJobRegistry.ts`, `server/scheduledJobsContract.test.ts`, `server/jobLinkPreview.ts`, `server/_core/index.ts (switch only)`.
- **Done when:**
  - Tests pass and the migration lints.
  - The independent review passes.
  - On the deployed release, with the switch still off, `/api/companies/stripe/jobs` answers `unavailable` (paste the response). QA then turns the switch on.
- **Stop if:** Greenhouse's response shape differs from the Zod contract for a directory company, or the 25 MB cap is too small for a verified board.

### 5.6 `D-176-public-claims` (Tier 2, S)
- **Waits for:** `D-176-availability-framing-removal`, `D-048-fix-landing-flash-snapshot-v2` and `D-048-F-static-frame` (the prerender work and `scripts/prerenderPublicPages.test.ts`), and `D-174-fix-post-binding` (`explore.test.tsx`).
- **Do:** remove the availability claim from the signed-in Home "OPEN DOORS AT LAUNCH" block. The companies may stay as a "Start with" list without the claim; D-176 supersedes D-016's wording there. Rewrite the `/explore` description in `shared/publicRoutes.ts` and `exploreDescription` to "Request a referral at {companies}." (D-180). This row does not touch the `/api/companies` payload (§4.6).
- **Tests (red first):** update the pins in `client/src/pages/explore.test.tsx` and `scripts/prerenderPublicPages.test.ts`, and add assertions that neither the Home source nor any public route description advertises employee availability.
- **Owns:** `client/src/pages/Home.tsx`, `shared/publicRoutes.ts`, `client/src/lib/companyDirectory.ts`, `client/src/pages/explore.test.tsx`, `scripts/prerenderPublicPages.test.ts`.
- **Done when:** tests pass, captures of the signed-in Home at 1280 and 390, and the live `/explore` page's meta description reads the new line after the deploy.

### 5.7 `D-174-job-sources-more` (Tier 1, M)
- **Waits for:** `D-174-job-catalog`.
- **Do:** Ashby (`api.ashbyhq.com/posting-api/job-board/{name}`) and Lever (`api.lever.co` and `api.eu.lever.co`, `?mode=json`) adapters behind the same contract. Add the two providers to the Zod enum and the fetcher's host allowlist. `provider` is a varchar, so there is no migration. Levels follow §4.3. Respect Lever's `Crawl-delay`.
- **Tests (red first):** `server/jobSources/ashby.test.ts` and `server/jobSources/lever.test.ts`: fixtures parse; `[]` from Lever stays `unverified`; the EU host works; a non-allowlisted host is refused.
- **Owns:** `server/jobSources/**`, `shared/jobCatalog.ts`, `shared/jobCatalog.test.ts`.
- **Done when:** tests pass, the independent review passes, and an admin-verified Ashby or Lever source syncs on the deployed release with QA's switch on (paste one `/api/companies/<slug>/jobs` response).

### 5.8 `D-174-ask-from-job` (Tier 1, M; money path)
- **Waits for:** `D-174-job-catalog`, `D-048-fix-post-copy`, `D-132-audit` (the quote and charge it changes) and `D-174-held-ask-reconfirm` (`server/db.ts`).
- **Do:**
  - Define one Zod schema for the `POST /api/company-referrals` body in `shared/companyReferralRequest.ts`, covering every field the route reads today, with an optional `catalogJobId`. Unknown fields are refused.
  - When `catalogJobId` is present, `createCompanyReferralRequest`:
    - Loads the open catalog job and binds the company from its source **before** any URL-domain resolution, so an apply link on `boards.greenhouse.io` never hits `CompanyLinkMismatchError`.
    - Writes the request's job row from the catalog job: `title`, `location`, the snippet as `description`, and the apply link as `targetRoleUrl`.
  - When `opportunityId` is present, copy the post's `roleTitle` and `location` the same way.
  - **Quote equals charge (D-132):** one helper builds the job row, and both `createCompanyReferralRequest` and `GET /api/company-referrals/quote` use it. The quote route accepts `catalogJobId` and `opportunityId`, so both price the same fields. With `ASK_LEVEL_COST` off, every request still costs 1 credit.
  - Credit rules are otherwise unchanged: the same spend points and the same idempotency key.
- **Tests (red first):**
  - `shared/companyReferralRequest.test.ts`: the schema refuses unknown fields.
  - `server/askFromJob.test.ts`:
    - A catalog job at a company with no available referrer creates a waiting request bound to that company.
    - A `catalogJobId` from another company is refused.
    - A closed catalog job is refused with a plain message.
    - With `ASK_LEVEL_COST` on, the quote for `catalogJobId` equals the stored `askCosts.creditCost`, and the same holds for `opportunityId`.
  - Every existing send and quote test stays green.
- **Owns:** `shared/companyReferralRequest.ts`, `shared/companyReferralRequest.test.ts`, `server/privateReferralRoutes.ts`, `server/db.ts`, `server/askFromJob.test.ts`.
- **Done when:** tests pass and the independent review passes. The journey UI uses it (§6).
- **Stop if:** `D-132-audit`'s quote contract cannot take the job fields without changing `askPriceAtCreate` or `assignJobLevel`.

### 5.9 `D-174-pool-nudges` (Tier 1, M)
- **Waits for:** `D-174-ask-from-job` (`server/db.ts`, `server/privateReferralRoutes.ts`) and, through it, `D-174-job-catalog` (`shared/scheduledJobs.ts`).
- **Do:** new `server/poolNudges.ts` with `export const POOL_NUDGES_ENABLED = false`. While the switch is off, none of the three parts below runs.
  1. **Waiting count:** `GET /api/company-referrals/inbox` gains `waitingCount`: the number of requests waiting in the pool at the referrer's own verified company. It is a count only, with no seeker data.
  2. **Review email for pool deliveries:**
     - Add an hourly job `pool-review-email` (`shared/scheduledJobs.ts`, `server/scheduledJobRegistry.ts`, `server/scheduledJobsContract.test.ts`).
     - It looks at requests delivered from the pool in the last 72 hours (`coverageVisibleAt` set, still pending with that referrer) that have no `referralReviewDeliveries` email row for that request and referrer.
     - For each, it sends the existing review email with the stored `referrerReviewEmailLinks` link, through the existing claim (`claimReferralReviewDelivery`), so a retry sends nothing twice. The origin is `PUBLIC_BASE_URL`.
     - **D-060:** at most one such email per referrer per UTC day. Skip a referrer who already has an email delivery row created that day; the next run picks up the rest. Send oldest first.
     - Never email a referrer blocked with the seeker (`server/blockedPairs.ts`).
  3. **Released to colleagues:**
     - When a pass or a 48 h allocation lapse (`server/referralTimers.ts`) releases a request, its company's verified colleagues who can now see it get one in-app notice. The referrer who released it does not, and neither does anyone blocked with the seeker.
     - The notice never names the seeker. It is sent once per release event.
- **Tests (red first):** `server/poolNudges.test.ts`:
  - The waiting count covers only the referrer's own company.
  - The job sends exactly one email per request and referrer, and nothing on a rerun.
  - A referrer with three pool deliveries in one day gets one email that day and the next one the following day.
  - A blocked referrer gets no email and no notice.
  - A lapse notifies colleagues, never by the seeker's name.
  - With the switch off, nothing happens.
- **Owns:** `server/poolNudges.ts`, `server/poolNudges.test.ts`, `server/db.ts`, `server/privateReferralRoutes.ts`, `server/referralTimers.ts`, `shared/scheduledJobs.ts`, `server/scheduledJobRegistry.ts`, `server/scheduledJobsContract.test.ts`.
- **Done when:** tests pass, the D-038 timer and coverage-delivery suites stay green, and the independent review passes. QA turns the switch on.
- **Stop if:** pool deliveries do not write `referrerReviewEmailLinks` rows, or no existing email sender can send the review link without a request origin.

### 5.10 `D-175-coverage-study` (Tier 3, docs only)
- **Do:** publish `docs/research/D-175-coverage.md`. Start from §3.11 and the appendix below, and complete it:
  - One row per directory company: provider, board token, evidence URL on the company's own careers domain, a live GET status and count with its date, and verdict (official API / crawl-class / not feasible).
  - The Indian employers seekers ask for most (TCS, Infosys, Wipro, HCLTech, Accenture, Cognizant, Flipkart, Swiggy, Zomato, PhonePe, Paytm).
  - A Wikidata (CC0) seeding proposal for the company list: a count, the fields (name, official website as domain, aliases), and the dedupe-by-domain rule. The CEO decides it from the study (D-123: free data, within D-175).
  - Evidence for the owner questions in §7.
- No code, no paid source, no account-based access.
- **Owns:** `docs/research/D-175-coverage.md`.
- **Done when:** the file lands with every directory company covered and each claim dated.

## 6. What the journey UI waits for
The D-189 packet for `D-174-seeker-journey-build` takes these as its server rows. Its builder stops at any step whose row is not done:
- **Step 1, search that suggests companies as the seeker types:** `D-174-company-search`. When nothing matches, offer "Paste a {typed name} job link to request a referral", because unlisted companies already work through a pasted link (§3.5), instead of the `/invite` vote dead end.
- **Steps 2–3, jobs and filters:** `D-174-job-catalog`, then `D-174-job-sources-more` for more companies.
- **A job-locked request:** `D-174-ask-from-job`.
- **Before any composer step:** `D-174-fix-post-binding`.

The D-189 packet also rules the pre-send per-company state against D-176 and adds the row that drops `openToReferrals`/`openCount` from the public payload (§4.6).

`D-174-expiry-clock-removal` adds `reconcileExpiredPendingReferrals` and the client countdowns (§3.10) to its runtime list, waits for `D-174-held-ask-reconfirm`, and goes live only with `ASK_RECONFIRM_ENABLED` on (§4.5).

`D-048-p3-live-review-find` waits for `D-174-seeker-journey-build`, `D-174-fix-post-binding` and `D-176-public-claims`. `D-099-bonus-pages` waits for `D-174-held-ask-reconfirm`, `D-174-sample-job-removal` and `D-174-job-catalog`, because it owns the same migration folder, schema and money-copy files.

## 7. Owner questions (each with a default the rows follow until the owner answers)
1. **Charge at pickup and show waiting requests to everyone who verifies (8/10).**
   - *Today:* a credit is spent when the first available employee is handed the request (D-047), and only that one person sees it. With no expiry, an unpicked request never returns its credit unless the seeker withdraws.
   - *The change:* charge when a referrer accepts or claims. Every verified employee could then see a waiting request at no cost to the seeker, who would pay only when someone acts. Why above 7: it is the most direct way to make the owner's "whoever sign-up they will be able to see" literally true, and it matches what a seeker expects to pay for.
   - *Against, strongest first:*
     - It reopens what D-047 settled. A seeker with no credit at pickup means delivering for free or billing later, and D-047 rules out both. A request picked up while the seeker has nothing to pay with would need a new held-after-pickup state.
     - It changes the D-034/D-047 money rule and the frozen D-132 terms.
     - Revenue arrives later.
   - *Default:* today's rule.
2. **Free credits refunded after their month ends come back as 0 (6/10 to change).**
   - *Today:* with no expiry, a withdrawal often lands after the month has rolled over, and the free credit comes back as 0, which reads as lost money to a Free seeker.
   - *Recommendation:* return it as a 30-day carry-over grant (the D-165 pattern).
   - *Against:* withdrawing after the month ends would let a Free seeker roll free credits forward without limit, stretching D-039's 3 a month. It would need a cap (for example at most 3 carried at once).
   - *Default:* unchanged.
3. **SmartRecruiters (5/10 to use).** Its public postings API is documented, but the API host's `robots.txt` allows only LinkedInBot. It would cover Swiggy, Freshworks and Merkle. Against: using it ignores a site's stated crawl rule, which D-175 says not to risk. Default: not used.
4. **Crawl-class sources (4/10 at launch).** SuccessFactors sitemaps (Wipro, HCLTech, Deloitte India) and Workday's undocumented endpoint (Accenture, Salesforce, Adobe) would need a polite, robots-respecting crawl, which is not a licensed API. Against: an undocumented endpoint can break or be blocked without notice. Default: none; these companies show "We can't list {Company}'s jobs yet. Paste a job link to request a referral."

## Appendix: source facts behind §3.11 (live GETs, Oct 24 2026)
- Greenhouse: stripe 721, capco 728, mongodb 383, coinbase 227, pinterest 160, upstart 88, nintendo 64, sofi 57, discord 46, gemini 30, razorpaysoftwareprivatelimited 26. Six directory slugs (hashicorp, kraken, 1password, snowflake, openai, blackrock) return 404 on Greenhouse because they use another provider or token.
- Ashby: openai 796, snowflake 354, 1password 90, ramp 167.
- Lever: palantir 309, paytm 197, meesho 58, cred 8. No sampled posting carried a seniority category.
- SmartRecruiters (public API, robots-disallowed): Swiggy 201, Freshworks 126, Bosch 5087.
- Not feasible by script today: TCS (403), Infosys (403), Cognizant (403), Meta (robots prohibit automated collection), Microsoft (Eightfold, 403), Flipkart (TurboHire robots allow only Googlebot), PhonePe (Greenhouse board inactive).

## Status

D-174-sample-job-removal: done — PR #688 (unblocked by D-210)

D-175-coverage-study: done — `7529a9ca` (PR #934) — Claude Opus 5.5 · 7598 — 2026-11-01 — `docs/research/D-175-coverage.md`: 39 directory companies (14 official API, 7 crawl-class, 18 not feasible today), the 11 Indian employers, the Wikidata seeding proposal (CEO decides, D-123) and §7 Q3/Q4 evidence; live GETs 2026-11-01 06:56-07:19Z

D-174-job-catalog: in progress — Qoder · 329f — 2026-10-27 — branch `agent/queue/d174-job-catalog`. Round-4 fix of the DeepSeek V4.1 Flash · 4745 findings: F1 the served job keeps `catalogJobs.id`, the producer §5.8's `catalogJobId` needs; F2 the route orders newest first with undated last and `id` descending as the tiebreak before the 50-job cursor slice; F3 `markFetchOk` restores a `failing` source (never promotes `unverified`) and the daily load set includes `failing` so one timeout is not permanent. F4 answered: `jobCatalogProviderSchema` allows greenhouse only today, so the multi-source shape waits for `D-174-job-sources-more`; F5 (an admin verification instrument) stays an owner/QA call. `JOB_CATALOG_ENABLED` stays off; awaiting independent re-review.

D-174-fix-post-binding: parked at owner (D-267) — PR #922 draft, head `54fafe74` (code `00272ccf`, `origin/main` merged); e2e journeys, unit + component + route tests and production build green (run `41263739419`); `typecheck` fails only at the D-151 review gate, which the D-254 picker defect never hands out (each MAKE GREEN adds a builder: Antigravity, Hark, Qoder so far). Before any review the builder lineage fixes red-first or qualifies against §5.1 the two candidate defects Instinct raised on #922 (comment 6554152648) and D-267 (4) traces in source (UNVERIFIED, no test run): (a) without the sessionStorage prefill, `?post=<id>` opens an empty read-only link field whose only way on is "Change role"; (b) Close leaves the prefill with `opportunityId`, which `/ask` restores for any company within the hour with no way to clear it. Released by the D-254 (6) owner answer; this line replaces the branch's "review" line when #922 next merges `main`.

D-174-company-search: landing — Cline · 2514 (lander) — 2026-11-01 — PR #929 on `agent/queue/d174-company-search`, `origin/main` merged. The §5.4 alias item that held the earlier landing is met: the 14 common names that lander listed now resolve through `shared/companyNameAliases.ts` (13 companies keyed by directory slug), pinned by `server/companySearch.test.ts` "finds directory companies by common long and short name aliases". The other directory companies have no common long or short name beyond their displayed name plus a legal suffix the normalizer already drops. Full gate and landing evidence follow in this task's `done` line.
