# Packet D-193: the server foundations and fixes the D-174 seeker journey needs

> Read `docs/BRIEF.md` first, then this packet. Each row below is its own task: claim it with the picker, build only that row, and edit only the paths its row lists in `owns`.

| Field | Value |
|---|---|
| Queue rows | `D-174-fix-post-binding`, `D-174-sample-job-removal`, `D-176-public-claims`, `D-174-job-catalog`, `D-174-job-sources-more`, `D-174-company-search`, `D-174-ask-from-job`, `D-174-pool-nudges`, `D-174-held-ask-reconfirm`, `D-175-coverage-study` (status lives in `docs/plans/assignments.json`; each row writes its line in the Status section at the end) |
| Decisions | D-174, D-175, D-176, D-180, D-193 (binding text quoted in §2); also D-006, D-022, D-034, D-040, D-042, D-047, D-061, D-062, D-101, D-110, D-170 |
| Companion | The three journey rows already registered (`D-174-seeker-journey-build`, `D-174-expiry-clock-removal`, `D-176-availability-framing-removal`) are described in `docs/plans/D-048-seeker.md`. This packet adds the rows they cannot build without, and does not change theirs. D-189 (#620) returns `D-174-seeker-journey-build` to a packet on `agent/queue/d174-seeker-journey`; that packet takes §6 below as its server dependency list. |
| Verified against | `main` `02a8a028` on Oct 24 2026; production API `26a35834`, web `1c14dfef` |

## 1. Goal
The owner's journey (D-174) is: type a company, pick it, see its live jobs, filter, pick a job, request a referral, answer a few questions, add a resume, send. If someone at the company can refer, it goes to them; if not, it waits in the company's pool for whoever verifies later. Today the first half of that journey has no server behind it: no code anywhere fetches a company's jobs, search is a client-side filter over 39 hand-seeded companies, and a request cannot carry a picked job. This packet defines the contracts and server rows, plus five fixes for defects found while mapping the journey. The UI steps themselves stay with `D-174-seeker-journey-build` (§6 says what it waits for).

## 2. Binding rules (quoted, not paraphrased)
- D-174: "pick a company from the maintained directory, see that company's live jobs, filter, pick a job, ask, answer the questions, add a resume, send - and an ask never expires". "The company pool is the existing waiting-for-coverage queue (D-061/D-062) ... (capacity rules unchanged)". "No new debit, refund or ledger behavior is created by this entry."
- D-175: "a company's own careers page is the source of truth for its verified current jobs." "Never show an invented opening, never call an incomplete list complete, and where a company's jobs cannot be fetched reliably the product says so plainly. No paid data source, no bulk scraping that risks a user or platform account".
- D-176: "referrer availability is backend routing, never a browse gate or a visible status." "coverage data is not exposed through the directory."
- D-170: "Source coverage is added only when verified ... every further source joins after its own verification, and no unverified listing is ever shown."
- D-110: every job always shows a level; "level unread" never shows.
- D-193 (this change): the rulings summarized in §4 and recorded in `docs/DECISIONS.md`.

## 3. Current behaviour (verified Oct 24; find each function by name, line numbers drift)
1. **No job ingestion exists.** No file on `main` or on any open branch calls `boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com` or `api.smartrecruiters.com`. D-170's "Greenhouse boards are live-verified" refers only to the job-link preview's fetch allowlist (`server/jobLinkPreview.ts`, around line 22), which previews a link a seeker pasted.
2. **The `jobs` table is not a feed.** `listJobs` (`server/db.ts`) reads one table that also holds a placeholder row per company request (`companyAskJobRow`), hidden from `/api/jobs` only by string matching. `/jobs` republishes every row as schema.org `JobPosting` markup (`client/src/lib/seo.ts`, `applySeo` with `jsonLd`).
3. **A fabricated listing is public.** Production `GET /api/jobs` returns one row: "Senior Frontend Engineer | acme.com | Test role for loop verification", also in `/sitemap.xml` and the `JobPosting` markup. It is production data, not a seed in the repo. The Oct 14 audit flagged it (`docs/GOAL_ALIGNMENT_AUDIT_2026-10-14.md`).
4. **Company search** is `findModel.ts`'s client substring filter over name, industry and functions, using `GET /api/companies` (`server/companyDirectoryRoutes.ts`), which returns the whole directory unpaginated, with `openToReferrals` per company and a top-level `openCount`. There are no name aliases (`companies`, `companyDomains` in `drizzle/schema.ts`). `normalizedEmployerKey` (`server/employerRouting.ts`) deletes accented letters instead of folding them, so "Société" keys as "socit".
5. **Unlisted companies.** `createCompanyReferralRequest` (`server/db.ts`) does not require a directory company: a pasted careers-page link at an unlisted company already creates a request that waits by domain. Only the search path dead-ends ("No matching companies yet" → the `/invite` vote panel, which says it creates no request).
6. **A picked job does not reach the request.** The send body is cast, not parsed by one Zod schema. URL-domain resolution and `CompanyLinkMismatchError` run before an `opportunityId` is read, and `companyAskJobRow` ignores the post's `roleTitle` and `location`.
7. **#612 regressions (live in web `1c14dfef`; latent because production has zero posted roles at all 39 companies):** (a) a signed-out seeker who picks a posted role and taps sign-in loses the post: `askPrefillSchema` (`client/src/lib/askPrefill.ts`) is a `z.strictObject` with no `opportunityId`, and the return path is a bare `/ask`; (b) `postSelection` in `useAskComposer.tsx` is cleared only after a successful send, so the hero "Ask for a referral", "Ask anyway" and closing the drawer leave it set, and a later generic request can carry the earlier post's `opportunityId`.
8. **False availability claims, live:** the signed-in Home (`client/src/pages/Home.tsx`, the "OPEN DOORS AT LAUNCH" block) says people at the five launch companies "have told skipwait.me they are open to referral requests", and the `/explore` description (`shared/publicRoutes.ts` and `exploreDescription` in `client/src/lib/companyDirectory.ts`) says "Find people open to referral requests at ... Wipro ... TCS". Production `/api/companies` marks only skipwait and go-neutrinos open.
9. **The pool hands off one at a time.** A waiting request is invisible until a verified employee is available; then `deliverWaitingAskTx` spends the seeker's credit and allocates it to one referrer (capacity 3, D-062), from three entry points (`saveVerifiedWorkEmail`, `openCompanyReferralAvailability`, credit arrival for a held request). Colleagues see it only after a pass (immediate) or the 48 h allocation lapse. Delivery writes in-app notices only, no review email, although a comment near the dispatch code says otherwise. A held request (no credit at first visibility) is delivered the moment any credit lands (D-047), however late.
10. **Expiry also fires on reads** (`reconcileExpiredPendingReferrals`), not only in the sweep, and client countdowns use the creation-based `getAskExpiresAtMs` (`shared/referral.ts`). This matters to `D-174-expiry-clock-removal`, whose runtime list should include both.
11. **Job sources (live GETs, Oct 24).** Free, documented, no-key public endpoints: Greenhouse (`boards-api.greenhouse.io/v1/boards/{token}/jobs`, `?content=true` for descriptions), Lever (`api.lever.co/v0/postings/{site}?mode=json`; README: published postings "may be scraped by third parties"), Ashby (`api.ashbyhq.com/posting-api/job-board/{name}`). About 15 of the 39 directory companies answer on one of these (for example stripe, mongodb, coinbase, pinterest, discord on Greenhouse; openai, snowflake, 1password on Ashby). An unknown token returns 404 (Greenhouse), `[]` (Lever) or 200 with 0 results (SmartRecruiters): never proof of zero jobs. SmartRecruiters' API host `robots.txt` disallows every crawler but LinkedInBot. Workday, SuccessFactors, Oracle, Taleo, iCIMS, Eightfold and Phenom have no licensed public read API. TCS, Infosys and Cognizant block scripted requests (403).

## 4. Rulings this packet builds on (D-193)
1. **Sources at launch:** Greenhouse first (`D-174-job-catalog`), then Ashby and Lever (`D-174-job-sources-more`). A company's board is used only after it is verified by a link from the company's own careers domain, recorded as `evidenceUrl` with `verifiedAt`. A 404, `[]` or zero result is "unverified", never "0 jobs". Nothing else is fetched until the owner answers §7.
2. **Display:** fetched jobs live in their own table, never in `jobs`. Show title, location, level, a short description snippet and the canonical apply link, with a source line ("From {Company}'s careers site, updated {date}"). Never say "all jobs" unless the source returned a complete list. No `JobPosting` markup for fetched jobs. Order: employee-posted roles (D-022) first, then careers-site jobs newest first; a sponsored item only as a labelled Featured listing (D-040).
3. **Seniority:** use the provider's level field where one exists; otherwise the D-110 classifier (`shared/jobLevel.ts`) on the title, which always yields a level and leans lower. No "level not stated" bucket.
4. **Pool:** D-174 keeps the capacity rules, so the D-062 one-at-a-time hand-off stays. "Whoever signs up will see it" is made true where it costs nobody anything: a newly verified employee sees how many requests are waiting at their company (a count, no seeker data), delivery sends the same review email a fresh request gets, and a lapse tells colleagues it is open again. Charging at pickup instead of at first visibility is §7 question 1.
5. **Held and waiting requests older than 30 days** need the seeker's one-tap reconfirm before their credit is spent at delivery. This is D-061's own protection without its closure: an unconfirmed request keeps waiting and never closes (D-174).
6. **Ownership:** the journey UI on `/explore`, `/explore/:slug` and `/ask` is `D-174-seeker-journey-build`'s. `D-048-p3-live-review-find` waits for it and `D-174-fix-post-binding`, then does the doctrine acceptance. New server work never rides a UI row.

## 5. The rows
Every row: red tests first, one commit per step, `pnpm check` plus its focused tests green on each commit, the full gate on the merged result. Tier 1 rows get a draft PR and an independent review by a model that neither built nor fixed the work (D-151).

### 5.1 `D-174-fix-post-binding` (Tier 1, S)
- **Do:** carry the picked post across sign-in: add optional `opportunityId` to `askPrefillSchema` and make the return path reopen the company door with the drawer and the post selected (`askSignInReturnTo` in `client/src/pages/explore/signInHandoff.ts`). Clear `postSelection` whenever the drawer closes or opens from anything other than a post row (hero ask, "Ask anyway"). While a post is selected, show its link read-only with a "Change role" control that clears the selection.
- **Tests first:** signed-out pick → sign in → the send carries the same `opportunityId`; pick a post, close the drawer, open the hero ask, send → no `opportunityId`; editing the link is impossible while a post is selected.
- **Owns:** `client/src/lib/askPrefill.ts`, `client/src/lib/askPrefill.test.ts`, `client/src/pages/explore/signInHandoff.ts`, `client/src/pages/explore/useAskComposer.tsx`, `client/src/pages/ExploreCompany.tsx`, `client/src/pages/explore.test.tsx`, `client/src/pages/exploreDrawer.test.tsx`.

### 5.2 `D-174-sample-job-removal` (Tier 1, S; data migration)
- **Do:** a reviewed data migration (next free number in `drizzle/deploy/`) that removes the "Test role for loop verification" acme.com row from `jobs`. First check whether any `referralRequests` row references it: if one does, hide the row from every public read instead of deleting it, and record which you did. Add a regression test that `/api/jobs`, the sitemap and the `JobPosting` markup never include a row whose company is `acme.com`, `example.com` or a reserved test domain.
- **Done when:** production `/api/jobs`, `/sitemap.xml` and `/jobs` no longer show it (live check after deploy).

### 5.3 `D-176-public-claims` (Tier 2, S)
- **Waits for:** `D-176-availability-framing-removal`, which removes the company-door labels, and `D-048-fix-landing-flash-snapshot-v2`, which also edits `scripts/prerender-public-pages.tsx`.
- **Do:** remove the availability claim from the signed-in Home "OPEN DOORS AT LAUNCH" block (the companies may stay as a "Start with" list without the claim; D-176 supersedes D-016's wording there). Rewrite the `/explore` description in `shared/publicRoutes.ts` and `exploreDescription` so it claims nothing about availability ("Find a referral at {companies}."). Then drop `openToReferrals` and `openCount` from the public `GET /api/companies` contract (`shared/companies.ts`, `server/companyDirectory.ts`) once no client reads them; the server keeps computing availability for routing.
- **Tests first:** the Home and `/explore` description strings contain no "open to referral requests"; the public directory payload has no availability field.
- **Owns:** `client/src/pages/Home.tsx`, `shared/publicRoutes.ts`, `client/src/lib/companyDirectory.ts`, `shared/companies.ts`, `server/companyDirectory.ts`, `scripts/prerender-public-pages.tsx`.

### 5.4 `D-174-job-catalog` (Tier 1, L: contracts, migration, Greenhouse, API)
- **Contracts first** in `shared/jobCatalog.ts`, with Zod and inferred types:
  - `companyJobSources`: `id`, `companyId` FK, `provider` enum (`greenhouse` only in this row), `boardToken`, `evidenceUrl`, `verifiedAt`, `lastFetchedAt`, `lastCount`, `status` (`verified` / `unverified` / `failing`), unique (`provider`, `boardToken`).
  - `catalogJobs`: `id`, `companyId` FK, `sourceId` FK, `externalId`, unique (`sourceId`, `externalId`), `title`, `rawLocation`, `locations` (normalized), `workMode` (`onsite` / `hybrid` / `remote` / `unknown`), `department`, `level` (L1–L10) plus `levelSource` (`provider` / `inferred`), `applyUrl`, `snippet` (plain text, at most 400 characters), `publishedAt`, `updatedAt`, `firstSeenAt`, `lastSeenAt`, `closedAt`. Indexes on (`companyId`, `closedAt`) and (`companyId`, `level`).
  - The API output for `GET /api/companies/:slug/jobs?q=&location=&level=&function=&cursor=`: jobs, facet counts, `source` (`null` when unverified), `syncedAt` and `completeness` (`complete` / `partial` / `unavailable`).
- **Migration** with the next free number, a `schemaReconcile` entry, and forward-only SQL.
- **Greenhouse adapter** in `server/jobSources/greenhouse.ts`: exact host `boards-api.greenhouse.io` through the existing pinned-DNS outbound client, response parsed by Zod, size and time caps, `?content=true` for the snippet (HTML stripped). A deterministic location parser with fixtures from real Greenhouse strings (split multi-city strings, detect Remote and Hybrid, aliases such as Bangalore/Bengaluru and NYC).
- **Refresh:**
  - Daily `job-catalog-sync` in `server/scheduledJobRegistry.ts`.
  - Fetch on open when `lastFetchedAt` is older than 1 hour, with a 60 s cache.
  - Upsert on (`sourceId`, `externalId`).
  - A job missing from a successful full fetch gets `closedAt`; a failed fetch changes nothing and marks the source `failing`.
- **Admin:** `POST /api/admin/job-sources` (admin only) records a source with its `evidenceUrl`. Verification is a human step, and there is no auto-discovery.
- **Flag:** `JOB_CATALOG_ENABLED`, off by default, declared in `.env.example` and forwarded in `src/worker.ts`. While it is off, the jobs route returns `completeness: "unavailable"`.
- **Tests first:**
  - Zod rejects unknown fields.
  - A 404 board stays `unverified` and is never "0 jobs".
  - A closed job disappears from the API.
  - Location parser fixtures.
  - Cross-company isolation: one company's slug never returns another company's jobs.
  - No catalog row appears in `/api/jobs` or `JobPosting` markup.
- **Owns:** `shared/jobCatalog.ts`, `shared/jobCatalog.test.ts`, `server/jobSources/**`, `server/jobCatalogRoutes.ts`, `server/jobCatalogRoutes.test.ts`, `drizzle/schema.ts`, `server/schemaReconcile.ts`, `server/scheduledJobRegistry.ts`, `server/_core/index.ts` (switch only), `src/worker.ts` (switch only), `.env.example`.

### 5.5 `D-174-job-sources-more` (Tier 1, M)
- **Waits for:** `D-174-company-search`, which waits for `D-174-job-catalog`. The schema rows form one chain so their migrations never collide: job catalog, then company search, then more sources, then held-ask reconfirm.
- **Do:** Ashby (`api.ashbyhq.com/posting-api/job-board/{name}`) and Lever (`api.lever.co` and `api.eu.lever.co`, `?mode=json`) adapters behind the same contract. Lever and Ashby carry no reliable seniority field, so use the classifier. Respect Lever's `Crawl-delay`. Extend the `provider` enum with an additive migration.
- **Owns:** `server/jobSources/**`, `shared/jobCatalog.ts`, `drizzle/schema.ts`, `server/schemaReconcile.ts`.

### 5.6 `D-174-company-search` (Tier 1, M; migration)
- **Waits for:** `D-176-public-claims` and `D-174-job-catalog`.
- **Do:** `GET /api/companies/search?q=` returns at most 10 companies. Match the normalized name prefix first, then aliases, then a name-contains match; never match industry or functions. The response is cacheable, and the output is Zod-validated.
- **Normalization:** a new normalizer (NFKD fold, case, punctuation, legal suffixes such as Ltd, Pvt, Inc, LLC and GmbH). Do not reuse `normalizedEmployerKey`: changing that one alters employer routing, which needs its own Tier 1 row.
- **Aliases:** `companyNameAliases` (`companyId`, `alias`, `normalizedKey` unique), seeded for the 39 directory companies, for example "Tata Consultancy Services" for TCS and "Go Neutrinos" for Neutrinos.
- **Tests first:**
  - "tata" finds TCS.
  - "Societe Generale" matches "Société Générale".
  - "Data" does not return every company.
  - At most 10 results.
  - Unknown fields rejected.
- **Owns:** `server/companySearch.ts`, `server/companySearch.test.ts`, `server/companyDirectoryRoutes.ts`, `shared/companies.ts`, `drizzle/schema.ts`, `server/schemaReconcile.ts`.

### 5.7 `D-174-ask-from-job` (Tier 1, M)
- **Waits for:** `D-174-job-catalog` and `D-048-fix-post-copy`.
- **Do:**
  - Define one Zod schema for the `POST /api/company-referrals` body in `shared/companyReferralRequest.ts`, covering every field the route reads today, with an optional `catalogJobId`.
  - When `catalogJobId` is present, `createCompanyReferralRequest` loads the catalog job, binds the company from its source before any URL-domain resolution (so a job hosted on `boards.greenhouse.io` or an alternate careers host never hits `CompanyLinkMismatchError`), and copies the title, location and level into the request's job row.
  - When `opportunityId` is present, copy the post's `roleTitle` and `location` the same way.
  - Credit rules are unchanged: the same spend points and the same idempotency key.
- **Tests first:**
  - A catalog job at a company with no available referrer creates a waiting request bound to that company.
  - A `catalogJobId` from another company is refused.
  - A closed catalog job is refused with a plain message.
  - Unknown body fields are refused.
  - Controls: every existing send test stays green.
- **Owns:** `shared/companyReferralRequest.ts`, `shared/companyReferralRequest.test.ts`, `server/privateReferralRoutes.ts`, `server/db.ts`.

### 5.8 `D-174-pool-nudges` (Tier 2, M)
- **Waits for:** `D-174-ask-from-job`.
- **Do:**
  - `deliverWaitingAskTx` queues the same review-email dispatch a fresh covered request gets (outbox, one idempotent key per request and referrer), and the stale comment is corrected.
  - An allocation lapse or a pass sends an in-app notice to the colleagues who can now see the request.
  - The referrer queue API returns `waitingCount` for the referrer's own company. The queue page shows it in its redesign row; this row does not edit `MyCompanyInbox.tsx`.
- **Tests first:**
  - Delivery to a new joiner writes exactly one review email per referrer, idempotent on retry.
  - A lapse notifies colleagues and never the seeker's name.
  - `waitingCount` counts only the referrer's company.
- **Owns:** `server/db.ts`, `server/referralReviewDispatch.ts`, `server/privateReferralRoutes.ts`.

### 5.9 `D-174-held-ask-reconfirm` (Tier 1, M; money path)
- **Waits for:** `D-174-pool-nudges` (same `server/db.ts` functions) and `D-174-job-sources-more` (the end of the schema chain).
- **Do:** at each delivery point, a waiting or held request created more than 30 days earlier is not spent. It moves to "awaiting reconfirm", and the seeker gets one in-app notice and at most one email a day (D-060), with a direct confirm link. Confirm spends the credit and delivers exactly as today. Withdrawal works at any time. Nothing ever closes it.
- **Schema and copy:** new columns `reconfirmRequestedAt` and `reconfirmedAt`, with a migration. Put the copy in a new `shared/reconfirmCopy.ts`; do not edit existing `shared/moneyCopy.ts` lines (D-173).
- **Flag:** `ASK_RECONFIRM_ENABLED`, off, so it can switch on together with the no-expiry switch.
- **Tests first:**
  - A 31-day-old held request plus a new credit → not spent until confirm.
  - Confirm → exactly one spend under the same idempotency key.
  - A double confirm spends once.
  - Withdraw while awaiting reconfirm → no spend.
  - A 29-day-old request → delivered as today.
- **Owns:** `server/db.ts`, `server/heldAsk.ts`, `shared/reconfirmCopy.ts`, `drizzle/schema.ts`, `server/schemaReconcile.ts`, `.env.example`, `src/worker.ts` (switch only).

### 5.10 `D-175-coverage-study` (Tier 3, docs only)
- **Do:** publish `docs/research/D-175-coverage.md`. Start from §3.11 and the appendix below, and complete it:
  - One row per directory company: provider, board token, evidence URL on the company's own careers domain, a live GET status and count with its date, and verdict (official API / crawl-class / not feasible).
  - The Indian employers seekers ask for most (TCS, Infosys, Wipro, HCLTech, Accenture, Cognizant, Flipkart, Swiggy, Zomato, PhonePe, Paytm).
  - A Wikidata (CC0) seeding proposal for the company list: a count, the fields (name, official website as domain, aliases), and the dedupe-by-domain rule.
  - The owner questions in §7 with evidence.
- No code, no paid source, no account-based access.
- **Owns:** `docs/research/D-175-coverage.md`.

## 6. What the registered journey rows wait for
`D-174-seeker-journey-build` (the UI) needs:
- `D-174-company-search` for step 1 (search that suggests companies as the seeker types). When nothing matches, offer "Paste a {typed name} job link to request a referral", because unlisted companies already work through a pasted link (§3.5), instead of the `/invite` vote dead end.
- `D-174-job-catalog` for steps 2–3 (jobs and filters).
- `D-174-ask-from-job` for a job-locked request.

Its builder should stop at a step whose server row is not done. `D-174-expiry-clock-removal` should add `reconcileExpiredPendingReferrals` and the client countdowns (§3.10) to its runtime list. `D-048-p3-live-review-find` now waits for `D-174-seeker-journey-build` and `D-174-fix-post-binding`.

## 7. Owner questions (each with a default the rows follow until the owner answers)
1. **Charge at pickup and show waiting requests to everyone who verifies (8/10).** Today a credit is spent when the first available employee is handed the request (D-047) and only that one person sees it. With no expiry, an unpicked request never returns its credit unless the seeker withdraws. Charging when a referrer accepts or claims would let every verified employee see the waiting request at no cost to the seeker, and the seeker would pay only when someone acts. Against: it changes the D-034/D-047 money rule and the D-132 frozen terms, and revenue arrives later. Default: today's rule.
2. **Free credits refunded after their month ends come back as 0 (8/10 to change).** With no expiry, a withdrawal often lands after the month has rolled over. Recommendation: return the credit as a 30-day carry-over grant (the D-165 pattern). Default: unchanged.
3. **SmartRecruiters (5/10 to use).** Its public postings API is documented, but the API host's `robots.txt` allows only LinkedInBot. It would cover Swiggy, Freshworks and Merkle. Default: not used.
4. **Crawl-class sources (4/10 at launch).** SuccessFactors sitemaps (Wipro, HCLTech, Deloitte India) and Workday's undocumented endpoint (Accenture, Salesforce, Adobe) would need a polite, robots-respecting crawl, which is not a licensed API. Default: none; these companies show "We can't list {Company}'s jobs yet. Paste a job link to request a referral."
5. **Seed the company list from Wikidata after the study (7/10).** It is free (CC0) and has thousands of companies with official domains. Against: the directory card contract needs a minimal-row mode, and a large list needs the server search first. Default: grow the list only from verified job boards, admin-reviewed referrer domains (D-101) and seeker suggestions.

## Appendix: source facts behind §3.11 (live GETs, Oct 24 2026)
- Greenhouse: stripe 721, capco 728, mongodb 383, coinbase 227, pinterest 160, upstart 88, nintendo 64, sofi 57, discord 46, gemini 30, razorpaysoftwareprivatelimited 26. Six directory slugs (hashicorp, kraken, 1password, snowflake, openai, blackrock) return 404 on Greenhouse because they use another provider or token.
- Ashby: openai 796, snowflake 354, 1password 90, ramp 167.
- Lever: palantir 309, paytm 197, meesho 58, cred 8. No sampled posting carried a seniority category.
- SmartRecruiters (public API, robots-disallowed): Swiggy 201, Freshworks 126, Bosch 5087.
- Not feasible by script today: TCS (403), Infosys (403), Cognizant (403), Meta (robots prohibit automated collection), Microsoft (Eightfold, 403), Flipkart (TurboHire robots allow only Googlebot), PhonePe (Greenhouse board inactive).

## Status
