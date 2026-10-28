# Packet D-174-seeker-journey-build: the seeker journey from company search to the company pool

> Read `docs/BRIEF.md` first, then `docs/plans/D-193-journey-foundations.md` (its §6 is this packet's server dependency list), then this packet. This is an architecture packet: reasoning and design only. It changes no code, registry or register. Each subtask in §7 becomes its own queue row only when a registering session adds it through the normal docs pull request (D-223, D-200).

| Field | Value |
|---|---|
| Queue row | `D-174-seeker-journey-build` (status `architect`, branch `agent/queue/d174-seeker-journey`, `syncedTo` D-227, depends on `D-166-journey-decisions-sync`, which is done). The row names no `owns` and no packet, so this file is at the default path the brief named. |
| Decisions | D-174, D-176, D-177, D-180, D-193 (quoted in §2). Also D-022, D-034, D-047, D-060, D-061, D-062, D-097, D-110, D-170, D-175, D-189, D-219, D-220, D-221, D-222, D-223, D-225, D-227. |
| Builds on | D-193 packet §6 (server rows) and §5.1 (`D-174-fix-post-binding`, referenced here, not redesigned). D-189 (2) sets this packet's scope: what remains after #612. |
| Verified against | `origin/main` `7226511` (Oct 28 2026). Live `GET https://skipwait.me/api/companies` on Oct 28 2026 returned 39 companies, `openCount: 2`, with `openToReferrals: true` only for `skipwait` and `go-neutrinos`. |
| Geographic direction | Global-first on both sides, for employers, employees and job seekers. India is one included region, not the default. Every place the design is region-bound says so (§6). |
| Money | No new debit, refund, ledger, price or access behaviour (D-174). No paid service, account or spend. Payment reasoning covers test mode only. |

## 0. Read receipt (D-225)
- **Main:** `7226511` (fetched Oct 28 2026; this branch was level with it).
- **Read:** `CLAUDE.md`, `AGENTS.md`, `docs/BUILD_CONTINUITY.md`, `docs/plans/D-193-journey-foundations.md` (all of it, including §5.1 and §6), the register entries D-174 to D-177, D-189, D-193, D-220, D-222, D-223, D-225 and D-227, the queue rows named in §8, `docs/PRICING.md` (lines 13 to 45), `docs/plans/D-177-recruiter-posts-referral-drives.md` (outline and open questions) and `docs/plans/GOAL_UI_COVERAGE.md` §2. The code cited in §3 was read on `7226511`.
- **Earlier outcomes:**
  - Two earlier Claude sessions worked on this row on Oct 28: "D-174 seeker journey implementation packet" and "D-174 seeker journey executable packet". Neither pushed anything. Their branches `claude/epic-cerf-gtyaan` and `claude/amazing-hopper-pa4bwf` are not on origin, and `agent/queue/d174-seeker-journey` does not exist (`git ls-remote`, Oct 28). The first left an unapplied diff. The second stopped and asked the user to choose between options. There is nothing on origin to build on, and nothing here reproduces either session.
  - A direct worker holds uncommitted prep for `D-174-fix-post-binding`. Per the coordinator, it is not adopted. This packet neither reads nor reproduces it.
  - Open PR #645 (`docs/SEEKER_JOB_JOURNEY.md` on `agent/instinct/journey-decisions`) records claimed owner direction from Oct 24 and 25: one universal search box, location-only search, and "Ask for referral" as the only job action. It is not on `main`. Under D-225 (4), it is not authority until it is registered. §9 states how this packet stays compatible with it.
- **Carried constraints:** the coordinator's qualifications of the D-175 coverage study, quoted in §2.8. That study is not in the repository at `7226511`, so this packet cites none of its figures.

## 1. Goal
The owner's journey (D-174) runs: type a company name, see companies pop up, pick one, see its live jobs, filter by location and seniority, pick a job, request a referral, answer a few questions, add a resume, send. If an employee there can take the request, it goes to them. If not, it waits in the company's pool for verified employees who join later. #612 built one slice of this: the company door lists employee-posted roles and lets a seeker request a referral in place.

This packet designs the rest of the client journey on top of the D-193 server rows:
- company search;
- the jobs list and its filters;
- a request locked to a picked job, including a post with no public link (D-177);
- one pre-send state for every company, so the drawer and composer square with D-176;
- the post-save line D-176 requires;
- the row that removes availability data from the public directory payload (D-193 (6)).

Goal test: this is the core launch flow. A seeker who can find the company, see a real job and send a specific request gets referred faster. A referrer who receives a request bound to a real job can decide with confidence.

## 2. Binding rules (quoted, not paraphrased)
1. **D-174:** "pick a company from the maintained directory, see that company's live jobs, filter, pick a job, ask, answer the questions, add a resume, send - and an ask never expires". "The company pool is the existing waiting-for-coverage queue (D-061/D-062) ... (capacity rules unchanged)". "No new debit, refund or ledger behavior is created by this entry."
2. **D-176:** "referrer availability is backend routing, never a browse gate or a visible status." "After saving, the seeker is told plainly which happened - reached verified employees, or waiting in the company's pool - never a false immediate-referral claim." "coverage data is not exposed through the directory."
3. **D-177:** employee-shared posts are "visible to outside candidates, may be posted without a public career-page link, labeled honestly as employee-shared (never 'career-portal confirmed')". "email-only jobs are not silently rejected."
4. **D-180:** a request is never shown as a submitted or completed referral. New copy says "referral request" or "request a referral".
5. **D-193:**
   - (2) Fetched jobs get "a snippet, the canonical apply link, a source-and-date line, no completeness claim unless the source list is complete, and no `JobPosting` markup". Employee posts list first.
   - (2) A job's level is the D-110 classifier on the fields the request carries, so the level filtered by, quoted and charged is one computation.
   - (3) The pool keeps the D-062 one-at-a-time hand-off.
   - (5) "New server work never rides a UI row." This packet "rules how the pre-send per-company state squares with D-176, and adds the row that drops `openToReferrals`/`openCount` from the public `/api/companies` payload."
6. **D-219 / D-221:** cost lines follow the frozen banded model: one referral of the request's level band, with the spend source shown before sending. "the L1-L10 to band mapping is open" (`docs/PRICING.md:24`). "Show the balance and the charge before sending" (`docs/PRICING.md:20`).
7. **D-097 / D-223:** a new feature ships behind an in-code switch that starts off. Each subtask lands alone, and the parent's release row turns the switch on. Rows are split by owned files, keeping hot files in as few rows as possible.
8. **Coordinator's D-175 qualifications (Oct 28, binding on this packet):**
   - D-175 is a sample, not proof. "No free API" means only that no approved source was found in the sampled checks. A 403 or 429 response, or client-side rendering, is not absence.
   - Its location shares overlap and lean toward tech jobs. They say nothing about employee, referrer, signup, delivery, matching or payment coverage.
   - Never assert either of these: "a pasted link works for every company today", or "work-email verification works for any domain or country". A domain match is an identity lead, not a verified employer domain. The admin source-evidence gate stays.
   - Unknowns stay unknown: providers that render client-side, EU hosts, and regions not probed. Make no impossibility claims and no global-readiness claims.
   - Greenhouse, Ashby and Lever document their public GET endpoints. That is not a republishing license. Wikidata is CC0.
   - D-175's Q1 and Q2 are not new owner asks. Nothing here changes charging, refunds or access.

## 3. What is on `main` now (`7226511`; find functions by name, because line numbers drift)

### 3.1 Server rows from D-193 §6
| Row | State | What the journey needs from it |
|---|---|---|
| `D-174-company-search` | todo, startable | `GET /api/companies/search` (step 1) |
| `D-174-job-catalog` | done, #650 (`2dcea86`); `JOB_CATALOG_ENABLED = false` (`shared/jobCatalog.ts:11`) | `GET /api/companies/:slug/jobs` (steps 2 and 3) |
| `D-174-job-sources-more` | todo | Ashby and Lever, for more companies |
| `D-174-ask-from-job` | todo; waits on `D-174-held-ask-reconfirm` and others | `catalogJobId` on send and quote |
| `D-174-fix-post-binding` | todo, startable | Post binding across sign-in, and clearing a stale post (§5.1) |
| `D-176-public-claims` | todo | Removes the Home and `/explore` description claims |
| `D-174-held-ask-reconfirm`, `D-174-pool-nudges` | todo | Pool safety and nudges. The journey adds no pool behaviour (§5.7). |

### 3.2 The jobs route (landed)
- `catalogJobSchema` carries `id`, `title`, `locations` (free-text labels), `workMode`, `level` (1 to 10), `jobFunction`, `applyUrl`, `snippet` (at most 400 characters) and `publishedAt` (`shared/jobCatalog.ts:46-64`).
- The route answers `unavailable` while the switch is off or the source is unverified. It reports `completeness: "complete"` whenever the source status is `verified` (`server/jobCatalogRoutes.ts:100-111`, `:150`). "Complete" therefore means the board's list, not every job the company has.
- The location filter is an exact, case-insensitive label match, and the location facets are raw labels (`server/jobCatalogRoutes.ts:132`, `:138`). There is no country field.

### 3.3 Availability framing is still visible before sending
#609 removed it from the `/explore` list (D-189 (2)). It is still live in three places.
- **Company door, `ExploreCompany.tsx`:**
  - `const open = company.openToReferrals` (`:84`);
  - the header "People open to referral requests" versus "Not open yet" plus an "Alert me" link (`:129-140`);
  - a black "Ask for a referral" for open companies versus an outline "Ask anyway" for the rest (`:155-160`);
  - "No verified employee can see asks yet. Yours waits free until one can - up to ${COVERAGE_WAIT_DAYS} days" (`:163`).
- **Drawer, `AskDrawer.tsx`:** "Goes to verified {Company} employees" only when open (`:125`), and a not-open block with "Get told when a referrer joins" (`:130-140`).
- **`/ask`, `Ask.tsx`:** the same open-only mark (`:95`).
- **Composer, `useAskComposer.tsx`:** `covered` and `uncovered` are derived from `openToReferrals` (`:396-397`) and choose the cost line (`:399-405`), the top-up swap, `expectedCoverage` (`:498`) and the watch control (`:654`).
- **Public payload:** the live `/api/companies` exposes `openToReferrals` per company plus `openCount`. Anyone can list which companies have an available employee. D-176 says that data is not exposed through the directory.

### 3.4 Post-save outcomes exist but need fixing
`useAskComposer.tsx:555-563` already tells the seeker one of four outcomes:
- personal link: only that employee sees it;
- waiting: "No verified employee there can see it yet, so nothing was spent";
- first look: the poster sees it first;
- reached: "Verified employees can see it now".

This covers D-176's two cases. The wording still says "ask" and "credit" (D-180, D-173), and it states the 7-day and 90-day clocks, which are true in runtime until `D-174-expiry-clock-removal` lands. The first-look line reads `OPPORTUNITY_FIRST_LOOK_HOURS = 48` (`shared/companyOpportunities.ts:19`), while D-220 says 24 h, which PR #672 implements. When a pool delivers a waiting request, the seeker gets the in-app notice "A referral review opened" (`coverageDeliveredNotice`, `server/coverageDelivery.ts:53-55`).

### 3.5 Posts with no public link
- `companyOpportunities.kind` is `hiring_now` or `walk_in`, and `targetRoleUrl` is nullable (`drizzle/schema.ts:373-376`).
- `createCompanyReferralRequest` resolves the employer from `targetRoleUrl` before it reads `opportunityId`, and throws when no domain resolves (`server/db.ts:1874-1880`).
- D-193 §5.8 copies the post's `roleTitle` and `location`, but does not bind the company from the post when the post has no link.
- So a linkless post still makes the seeker paste a link (D-189 (2)).

### 3.6 Seniority
- Every catalog job has a level from 1 to 10. `JOB_LEVEL_LABELS` gives each a plain name ("Intern / trainee", "Entry / junior", ... "Senior"; `shared/jobLevel.ts:35+`).
- The classifier's seniority keywords are English only (`shared/jobLevel.ts:84-120`). Per D-110 it always returns a level and leans lower.
- The mapping from L1-L10 to price bands is still open (`docs/PRICING.md:24`).

### 3.7 The pool is keyed by one exact email domain, not by the company
- A referrer's `workEmailDomain` is the full text after "@" (`server/db.ts:1538`).
- `isVerifiedEmployeeOfCompany` compares it for exact equality with the request's `companyDomain` (`server/referrerAvailability.ts:28-30`). So does the referrer inbox query (`server/db.ts:2178`, `eq(jobs.company, profile.workEmailDomain)`).
- The `companyDomains` table (`drizzle/schema.ts:181-187`) maps one company to several domains, but routing never reads it.
- In the live directory, 38 of 39 companies list exactly one domain.
- Pool deliveries go one at a time (D-062, D-193 §3.9). A fresh request at a company with an available employee opens to the whole team (`server/db.ts:1955`, "otherwise it opens to the team"). D-022 first look sends a request from a post to the poster first.

### 3.8 Facts that set the global limits (§6)
- **UI language:** English only. `client/index.html` has `<html lang="en">`, and `package.json` has no i18n library (i18next, react-intl, lingui or next-intl).
- **Directory:** 39 hand-curated companies (live GET, Oct 28), including US, European, Indian and other Asian employers. Search today is a client-side substring filter (`companyMatches` and `filterCompanies`, `client/src/pages/explore/findModel.ts:16-27`). An empty search leads to `/invite`, which creates no request (`client/src/pages/Explore.tsx:97-98`).
- **Employer resolution:**
  - A link on a host listed in `HOSTED_JOB_PLATFORMS` (`shared/referralUrl.ts:58-71`) resolves through URL handles and page evidence.
  - Any other host's registrable domain is taken as the employer (`directEmployerDomainFromTargetUrl`, `server/employerRouting.ts:19-28`).
  - **Unverified (code reading only; dependencies were not installed, so nothing was run):** a link on a multi-tenant ATS host that is not on the list, such as `acme.jobs.personio.de`, would resolve to the ATS vendor's domain, `personio.de`. The request would then go to the vendor's verified employees, not to Acme's. Sending from a directory company's door is refused instead (`CompanyLinkMismatchError`, `server/db.ts:1877-1879`). The risk is the generic `/ask` path.
- **Referrer email check:**
  - `isCorporateEmailDomain` rejects 15 exact consumer domains, plus a provider-family pattern covering Gmail, Yahoo, Outlook, GMX, Yandex, Rediff, QQ, 163, Naver, Daum, Seznam and others, plus eight more Russian and privacy-mail domains (`shared/const.ts:10-27`).
  - Many national ISP mailbox domains are not on it (candidates from general knowledge, unconfirmed: `web.de`, `t-online.de`, `orange.fr`, `free.fr`, `libero.it`, `wp.pl`, `uol.com.br`, `btinternet.com`, `comcast.net`, `bigpond.com`). An address at one of them would pass as a "work" domain.
  - This is a lead for a fix row (§7.2), not a measured defect.
- **Payments:** India Rs and global USD prices only (`docs/PRICING.md:13`). Showing prices in the visitor's own currency is "proven locally, not live regional detection" (`:42`). The live INR gateway is "UNVERIFIED" (`:45`), and USD monthly renewal is blocked pending PayPal reference transactions (`AGENTS.md`, current pricing model). Nothing new is on sale.
- **Privacy text:** a search of `client/src` and `shared` finds no mention of GDPR, EEA, UK GDPR, DPDP or CCPA. Legal text is the owner's (AGENTS.md guardrails).

## 4. Rulings this packet proposes (take effect only when the packet is adopted through the normal docs PR; changeable)

### 4.1 Before sending, every company looks the same (squares the drawer and composer with D-176)
- **Same door for everyone.** Every company door shows the same header, with no open or not-open label and no "Alert me". It has one primary action, "Request a referral", and the same "Ask anyway" treatment applies to no one.
- **One routing sentence**, the same for every company, true in both cases, and saying nothing about who is available: "Your referral request goes to verified {Company} employees. If none can take it yet, it waits privately in {Company}'s pool until one can, and nothing is spent until a verified employee can see it." Until `D-174-expiry-clock-removal` lands, this sentence keeps today's clock facts by reading the existing constants, so it never promises "no expiry" before runtime delivers it (that row's note: "copy changes land only with the runtime change").
- **Cost line without coverage.** The money line uses the existing coverage-unknown branch, `askCostLine({ open: null, ... })` (`shared/moneyCopy.ts:110`). It already ships for unlisted companies, so no new pricing logic is written. It gains the seeker's balance, because `docs/PRICING.md:20` requires the balance and the charge before sending. The wording is a new addition in `shared/moneyCopy.ts`; no existing line changes (the D-193 §5.3 precedent). Band and spend-source wording arrives with whichever row restates the quote under D-219 (`D-132-item3`'s re-scope). The journey shows only the numbers the quote returns and invents no band mapping.
- **No watch control.** The composer drops "Get told when a referrer joins" and the `/alerts` link on the door. A sent request already notifies the seeker when it goes live (`coverageDeliveredNotice`). A pre-send alert can only exist by revealing availability. The `/alerts` page itself is out of scope.
- **What send does stays as it is.** An uncovered request waits free. A covered request with enough balance spends at send. A covered request without enough balance is refused with the server's existing wording, and the composer re-prices (`useAskComposer.tsx:406-410` comment; the composer's existing coverage-unknown path). The seeker learns coverage only at commit, from their own request. That is exactly the disclosure D-176 requires after saving.
- **`expectedCoverage`.** Once `uncovered` can no longer be true, `expectedCoverage` is never sent. The server guard (`CoverageOpenedUpError`, `server/db.ts:1919`) stays and becomes unreachable from this composer. The seeker was told "spent when a verified employee can see it", so an immediate charge is exactly what they accepted (the D-221 accepted-price invariant).
- **Rating 9/10.** It removes a live contradiction of an adopted owner decision using copy and paths that already ship. **Against:** a seeker with too little balance at a covered company now finds out at send, not before. It costs one extra tap, and nothing is charged.

### 4.2 After saving (D-176's line)
The four outcomes in §3.4 stay as four outcomes. They are restated in D-180 words through one pure function in a new module, so the drawer and `/ask` say the same thing.

| Outcome | What the seeker is told |
|---|---|
| **Reached** | "Your referral request reached verified {Company} employees." |
| **First look** | "The {Company} employee who posted this role sees it first." The hours come from `OPPORTUNITY_FIRST_LOOK_HOURS`, so the line follows D-220 automatically when #672 lands. |
| **Personal link** | Only the employee whose link was used sees it. |
| **Waiting** | "It's waiting privately in {Company}'s pool. Nothing is spent until a verified employee can see it. We'll tell you when it goes live." |

Every clock or money clause reads the existing constants and `shared/moneyCopy.ts` exports (read-only imports), so `D-174-expiry-clock-removal` and the D-180 sweep change them in one place. The function never says "referred", "referral sent" or "you'll be referred". **Rating 9/10.**

### 4.3 Step 1: company search
- Typing queries `GET /api/companies/search?q=` (D-193 §5.4) after a short debounce and shows at most 10 names. A failed search shows an error with retry, never an empty "no companies".
- **When nothing matches** (D-193 §6): "Paste a {typed name} job link to request a referral". This opens `/ask` with the typed name as context. It is not presented as a promise that every company resolves (§2.8), and the `/invite` vote is no longer the journey's dead end.
- The "Request a company" link may stay as a secondary text link. D-227's admin admission path is how unlisted companies reach the directory.
- **Rating 8/10.** **Against:** most unlisted employers will lean on the pasted-link path, whose resolution is strict and fails on some ATS hosts (§3.8, §7.2).

### 4.4 Steps 2 and 3: jobs and filters on the company door
- **Order** (D-193 (2), D-022): employee posts first, then careers-site jobs newest first. Featured items appear only as labelled Featured (D-040).
- **Each job row:** title, location labels, work mode, the plain-language level from `JOB_LEVEL_LABELS` (never "L4"), the snippet, and the apply link. Nothing invites applying: the only action is "Request a referral" (§9).
- **Source line:** "From {Company}'s careers site, updated {date}". The UI never says "all jobs", whatever `completeness` says (§3.2). When completeness is `partial`, it adds "Some jobs may be missing."
- **When `unavailable`:** "We can't list {Company}'s jobs here yet. Paste a job link from {Company}'s careers site to request a referral." (D-193 §7.4 default.) It never says "no jobs".
- **Remote jobs:** a job labelled "Remote" with no country shows "Remote (where you can work is set by {Company})". The design never implies eligibility to work.
- **Filters:** keyword (`q`), location (facet labels), level (D-110 labels over catalog levels) and function. They are server-side query parameters on the existing route. Facet counts come from the server, and a filter with no results says so and offers a clear-filters action.
- **Indexing:** no `JobPosting` markup and no sitemap entry for catalog jobs (D-193 (2)). The jobs list is rendered for visitors, not for search indexing (§4.9).
- **Rating 8/10.** **Against:** with only Greenhouse verified today and the switch off, "can't list jobs yet" will be the common state. That is honest, but thin.

### 4.5 Step 4: a request locked to a job
- Picking a careers-site job opens the drawer with that job locked, extending the selection that D-193 §5.1 builds for posts; this packet does not redesign that binding.
- **Locked fields:** title, location, level label and apply link. "Change job" clears the selection, in line with §5.1's "Change role".
- **Sign-in:** the selection survives sign-in by the same `askPrefill` mechanism §5.1 adds, with `catalogJobId` as a second optional field.
- **Pricing:** the send body and the quote both carry `catalogJobId`, so the job that is filtered by, quoted and charged is one computation (D-193 (2), §5.8).
- **Linkless post (D-177):**
  - Picking a post with no `targetRoleUrl` asks for no link.
  - The drawer shows "Shared by a verified {Company} employee", never "from the careers site".
  - The request binds through `opportunityId`.
  - This needs the §5.8 amendment in §7.3. The client step stops until that amendment is built.
- **Rating 8/10.**

### 4.6 Seniority filter
- The filter uses the catalog's levels, labelled in plain words. The price on the cost line comes only from the quote route.
- Until the owner settles the L1-L10 to band mapping (`docs/PRICING.md:24`), the journey shows no band names next to jobs. The mapping is an existing open owner item, not a new ask.
- Titles outside the English keyword table get D-110's lower default. That is an explicit limitation (§6), unmeasured, and it errs toward a cheaper price, never toward overcharging.

### 4.7 Pool routing: unchanged by the journey
- The journey adds no pool behaviour. The D-062 hand-off, the D-022 / D-220 first look, D-193 (3)'s nudges (`D-174-pool-nudges`) and D-061 reconfirm (`D-174-held-ask-reconfirm`) stay with their rows. "whoever sign-up they will be able to see" stays as D-193 (3) narrowed it.
- §3.7's exact-domain key is a real limit for multinationals whose employees use per-country or brand email domains. Fixing it changes who can see requests, so it is a separate Tier 1 server row (§7.2), not a journey step.

### 4.8 Design shape
- **New feature parts** (search UI, jobs list, job-locked request) sit behind one client switch, `SEEKER_JOURNEY_ENABLED = false`, in a new module, `client/src/pages/explore/journeyFlag.ts`. With the switch off, today's door, list and composer behave as they do now.
- **D-176 corrections** (§4.1, §4.2) restore an adopted owner rule, so they ship without a switch (AGENTS.md §0, session-start sync item 3).
- **Defensive states:** every new surface has explicit loading, empty, error and offline states (AGENTS.md §5).

### 4.9 Licensing and display
- Careers-site jobs show only the D-193 (2) fields: title, location, level, a snippet of at most 400 characters, and the canonical apply link with the source-and-date attribution. There are no full descriptions, no export and no bulk listing across companies.
- Provider public GET endpoints being documented is not a republishing license (§2.8). Whether linking plus a short snippet is permitted under each provider's and each employer's terms is **unverified**; this packet did not review those terms. The release row records that check before `JOB_CATALOG_ENABLED` goes on.
- Wikidata (CC0) may seed names and aliases only (D-193 §5.10), never jobs.

## 5. The journey, step by step (with the switch on)
| Step | Screen | Server | Waits for |
|---|---|---|---|
| 1. Type a company | `/explore` typeahead | `GET /api/companies/search` | `D-174-company-search` |
| 1a. No match | Paste-link prompt, then `/ask` | `POST /api/company-referrals` (existing) | none |
| 2. Pick a company | `/explore/:slug`: posts first, then jobs | `/opportunities` (existing), `/jobs` | `D-174-job-catalog` (done) |
| 3. Filter | Facets on the door | `/jobs?q=&location=&level=&function=` | as above |
| 4. Pick a job, request a referral | Drawer with the job locked | quote and send with `catalogJobId` or `opportunityId` | `D-174-ask-from-job` (+§7.3), `D-174-fix-post-binding` |
| 5. Questions and resume | Existing composer steps | existing | none |
| 6. Send | Coverage-neutral cost line (§4.1) | existing send | none |
| 7. Saved | One of four outcomes (§4.2) | existing response fields | none |
| 8. Later | In-app notice when it goes live | `coverageDeliveredNotice` (existing) | none |

## 6. Global-first: what the design supports and where it is region-bound
| Capability | Supported by this design | Region-bound or unknown | Source |
|---|---|---|---|
| Interface language | English | Any seeker or referrer who does not read English is served poorly. No translation is planned in this packet. | `client/index.html` `lang="en"`; no i18n library in `package.json` |
| Company search | Latin-script names, NFKD accent folding, static aliases | Non-Latin names (for example Japanese, Korean, Cyrillic, Devanagari) match only through alias entries. The legal-suffix list in D-193 §5.4 is English, Indian and German only (§7.3 amends it). | D-193 §5.4 |
| Directory | 39 hand-curated companies | Every other employer is reached only through a pasted link, and only when its employer resolves (§3.8). No claim that every company works. | live `/api/companies`, Oct 28 |
| Jobs | Companies with an admin-verified Greenhouse board; Ashby and Lever after `D-174-job-sources-more` | Employers on other ATSs show "can't list jobs yet". Providers that render client-side, EU hosts and unprobed regions are **unknown**, not impossible (§2.8). The switch is off. | `shared/jobCatalog.ts:11,16`; D-193 §3.11 |
| Location filter | Exact label match on the source's text | No country filter, so labels like "London" and "London, UK" stay separate. "Remote" does not state where one may work (§4.4). §7.2 proposes a country facet. | `server/jobCatalogRoutes.ts:132` |
| Seniority | D-110 levels with plain labels | English title keywords. Other languages fall to the lower default (unmeasured). | `shared/jobLevel.ts:84-120` |
| Request to an unlisted company | A pasted link whose employer resolves | Multi-tenant ATS hosts not on the list may resolve to the vendor (**unverified hypothesis**, §3.8, §7.2) | `server/employerRouting.ts:19-28` |
| Referrer verification | Work-email code for a domain not on the consumer list (login rule, D-030) | The consumer list is a sample weighted toward US, UK, India, China, Korea and Russia. A passing domain is a lead, not proof of employer (§2.8). | `shared/const.ts:10-27` |
| Pool routing | One exact email domain per pool | Employees on per-country or brand domains do not join the pool for the domain a link resolves to (§3.7, §7.2) | `server/referrerAvailability.ts:28-30` |
| Price and payment | Unchanged; India Rs and global USD | No local currencies or live regional detection. The live INR gateway is unverified, and USD monthly renewal is blocked. The journey sells nothing. | `docs/PRICING.md:13,42,45` |
| Privacy and legal | Unchanged | The repository's privacy text names no EU, UK or other regional basis. This is the owner's legal call (§11, Q1). | search of `client/src`, `shared` |
| Timers and emails | 48 h claim lapse; D-060 one email per UTC day | Region-neutral (UTC) | `AGENTS.md` system map |

## 7. Rows

### 7.1 Journey subtasks (parent `D-174-seeker-journey-build`, D-223)
Every subtask:
- is claimed through the picker, with red tests first and one commit per step;
- needs `pnpm check` and its focused tests green on every commit, and the full gate on the merged result;
- for UI, needs captures at 1280 and 390 from a clean browser (founder rule 8).

Tier 1 rows get an independent review by a model that neither built nor fixed them (D-151). The general stop rules in D-193 §5 apply.

#### `D-174-seeker-journey-build.d176-composer` (Tier 1, M; money line)
- **Waits for:** `D-174-fix-post-binding`, which holds the same four composer files and lands first.
- **Do:**
  - Build §4.1 on the door (`ExploreCompany.tsx`), the drawer (`AskDrawer.tsx`), `/ask` (`Ask.tsx`) and the composer (`useAskComposer.tsx`). Nothing on these surfaces reads `openToReferrals` any more.
  - The cost line uses the coverage-unknown branch plus the new balance sentence, added to `shared/moneyCopy.ts` as an addition only.
  - Build §4.2 as `shared/askOutcomeCopy.ts`, a new pure function that takes the existing send-response fields and the existing constants. The drawer and `/ask` render it.
  - Remove the watch control and the door's `/alerts` link.
- **Tests (red first), in new `client/src/pages/explore/journeyNeutral.test.tsx` and `shared/askOutcomeCopy.test.ts`:**
  - the door, drawer and `/ask` render identical pre-send markup for an `openToReferrals: true` company and a `false` one;
  - no rendered text contains "open to", "Not open yet" or "Alert me";
  - `expectedCoverage` is never in the send body;
  - a covered, short-balance refusal shows the server's wording and re-prices;
  - each of the four outcomes renders in D-180 words, and no output contains "referred" or "referral sent";
  - the clock clauses equal the current constants.
  - Every existing explore, ask, cost-quote and pinned-work test stays green.
- **Owns:** `client/src/pages/ExploreCompany.tsx`, `client/src/pages/explore/AskDrawer.tsx`, `client/src/pages/Ask.tsx`, `client/src/pages/explore/useAskComposer.tsx`, `shared/moneyCopy.ts` (additions only), `shared/askOutcomeCopy.ts`, `shared/askOutcomeCopy.test.ts`, `client/src/pages/explore/journeyNeutral.test.tsx`, `design/goal-ui/captures/journey/composer/**`.
- **Registry note:** `D-174-held-ask-reconfirm` also owns `shared/moneyCopy.ts`. The recommended edge is that it waits for this row, which is startable much sooner. The registering session decides and runs `validateAssignments`.
- **Done when:** the tests pass; captures at 1280 and 390 show the door, the drawer's pre-send state and all four post-save outcomes; the independent review passes.
- **Stop if:** the send path needs a server change, or the quote contract has changed on `main`.

#### `D-174-seeker-journey-build.search` (Tier 2, S)
- **Waits for:** `D-174-company-search`.
- **Do:**
  - New `client/src/pages/explore/journeyFlag.ts` with `export const SEEKER_JOURNEY_ENABLED = false`.
  - New `client/src/pages/explore/useCompanySearch.ts`: a React Query hook with debounce that validates the response with Zod.
  - In `Explore.tsx`, with the switch on: typeahead results, the no-match paste-link prompt (§4.3) and an error state with retry. With the switch off, today's filter is unchanged. `findModel.ts` is not touched.
- **Tests (red first), in new `client/src/pages/explore/companySearch.test.tsx`:** suggestions appear while typing; no match shows the paste-link prompt carrying the typed name; a failed search shows retry, never "No matching companies"; with the switch off the page is byte-identical in behaviour to today.
- **Owns:** `client/src/pages/Explore.tsx`, `client/src/pages/explore/journeyFlag.ts`, `client/src/pages/explore/useCompanySearch.ts`, `client/src/pages/explore/companySearch.test.tsx`, `design/goal-ui/captures/journey/search/**`.
- **Done when:** the tests pass, with captures at 1280 and 390 with the switch on in a preview: results, no match, error.

#### `D-174-seeker-journey-build.jobs` (Tier 2, M)
- **Waits for:** `D-174-job-catalog` (done), `.d176-composer` (`ExploreCompany.tsx`) and `.search` (`journeyFlag.ts`).
- **Do:**
  - Under new `client/src/pages/explore/jobs/`: a hook for `/api/companies/:slug/jobs` parsed with `companyJobsResponseSchema`, a job list, filter controls and the source line, all per §4.4.
  - Mount them in `ExploreCompany.tsx` below the employee posts, with the switch on only.
  - Each job's "Request a referral" calls one selection callback; this row wires it to nothing that sends.
- **Tests (red first), in `client/src/pages/explore/jobs/jobs.test.tsx`:**
  - `unavailable` shows the can't-list line and the paste-link path, never "0 jobs";
  - `partial` adds the missing note, and no state renders the word "all" about jobs;
  - posts render before careers-site jobs;
  - the level shows its `JOB_LEVEL_LABELS` text;
  - a "Remote" job with no country shows the eligibility caveat;
  - the filters send the right query parameters;
  - the page has no `JobPosting` JSON-LD.
- **Owns:** `client/src/pages/explore/jobs/**`, `client/src/pages/ExploreCompany.tsx` (switch only), `design/goal-ui/captures/journey/jobs/**`.
- **Done when:** the tests pass, with captures at 1280 and 390 against fixtures in four states: list, filtered empty, partial, unavailable.

#### `D-174-seeker-journey-build.job-locked` (Tier 1, M; quote and send body)
- **Waits for:**
  - `D-174-ask-from-job`, including the §7.3 amendment;
  - `.jobs`;
  - `D-174-fix-post-binding`, which adds `opportunityId` to `askPrefill` and the post's read-only state.
- **Do:** §4.5.
  - The composer selection becomes a tagged union of post and catalog job, extending §5.1's selection without changing its clear-on-close rules.
  - `askPrefill` gains an optional `catalogJobId`.
  - The quote and the send carry `catalogJobId` or `opportunityId`.
  - A linkless post skips the link field and shows the provenance label.
- **Tests (red first), in new `client/src/pages/explore/jobLocked.test.tsx`:**
  - a picked job survives sign-in with the same `catalogJobId`;
  - "Change job" clears it, and a later generic request carries neither id;
  - the quote request and the send body carry the same id;
  - a linkless post sends with no `targetRoleUrl` and shows "Shared by a verified {Company} employee";
  - a closed job's server refusal shows its plain message.
- **Owns:** `client/src/pages/explore/useAskComposer.tsx`, `client/src/pages/explore/AskDrawer.tsx`, `client/src/pages/explore/askSend.ts`, `client/src/lib/askPrefill.ts`, `client/src/pages/explore/signInHandoff.ts`, `client/src/hooks/useAskQuote.ts`, `client/src/pages/explore/jobLocked.test.tsx`, `design/goal-ui/captures/journey/job-locked/**`.
- **Stop if:** the server refuses a linkless `opportunityId` (the §7.3 amendment is missing), or the quote and the charge disagree for one id.

#### `D-174-seeker-journey-build.directory-payload` (Tier 1, S; privacy, server)
- **Waits for:**
  - `.d176-composer`, the last public reader;
  - `D-174-company-search`, which owns the same route and type files;
  - `D-176-public-claims`, which owns `client/src/lib/companyDirectory.ts`.
- **Do:**
  - Remove `openToReferrals` and `openCount` from the public `GET /api/companies` and `GET /api/companies/:slug` responses and from the `PublicCompany` type.
  - Admin reads keep whatever they show today through the admin routes.
  - Before editing, search for every public reader, including prerender and SEO. Stop if any reader outside `owns` remains.
- **Tests (red first):** the public payloads carry no availability field (a strict Zod output schema); an admin read still works; `client/src/lib/companyDirectory.ts` parses the new payload.
- **Owns:** `server/companyDirectoryRoutes.ts`, `server/companyDirectoryRoutes.test.ts`, `shared/companies.ts`, `client/src/lib/companyDirectory.ts`.
- **Registry note:** `D-086.count` mounts in `server/companyDirectoryRoutes.ts` (switch only). The recommended edge is that `D-086.count` waits for this row, so a D-176 privacy correction never waits on a new feature.
- **Done when:** after the deploy, the live `/api/companies` response (pasted in the report) has no `openToReferrals` and no `openCount`.

#### Release: `D-174-seeker-journey-build` (parent, Tier 1)
- **Waits for:** all five subtasks, `D-174-job-sources-more` and `D-176-public-claims`.
- **Do:**
  - Turn `SEEKER_JOURNEY_ENABLED` on in a one-line PR after QA on a preview, with an end-to-end capture of §5 at 1280 and 390 against fixtures, the provider-terms check in §4.9, the independent review and the CEO's sign-off.
  - Update the docs D-068 requires in the same PR: `docs/PRD.md`, `docs/BRIEF.md`, the AGENTS.md system map row and plan §3b.
  - `JOB_CATALOG_ENABLED` is QA's switch under D-193 §5.5, not this row's.
  - `D-048-p3-live-review-find` then does the doctrine acceptance (D-193 (5)).
- **Owns:** `client/src/pages/explore/journeyFlag.ts` (switch only), `docs/PRD.md`, `docs/BRIEF.md`, `AGENTS.md`, `docs/KIT_V4_BUILD_PLAN.md`.

### 7.2 Separate server rows proposed by this packet (epic D-174; not journey subtasks, D-193 (5))
| Proposed row | Tier | Why (global-first) | Shape | Owns |
|---|---|---|---|---|
| `D-174-ats-host-routing` | 1 | A regional ATS link must never route a request to the ATS vendor's own employees (§3.8; unverified hypothesis) | Red test first: `/ask` with `https://acme.jobs.personio.de/job/1` must not bind to `personio.de`. Add multi-tenant ATS hosts to `HOSTED_JOB_PLATFORMS` and `hostedEmployerCandidatesFromTargetUrl`, each confirmed from the vendor's own documentation before it is added. Candidates, all unconfirmed: Personio, JOIN, softgarden, Gupy, Pinpoint, Jobylon, Homerun. An unresolvable link keeps today's clear refusal. | `shared/referralUrl.ts`, `server/employerRouting.ts`, their tests |
| `D-174-consumer-mail-global` | 1 | A national ISP mailbox must not pass as a work email (§3.8) | First, an admin-only read-only count of verified referrers on each candidate domain. Then add the confirmed consumer providers. Never un-verify an existing referrer silently; affected people go to the operator review the identity rules already require. | `shared/const.ts`, its test |
| `D-174-company-domain-routing` | 1 | Employees on per-country or brand domains should reach their company's pool (§3.7) | Match a referrer to a request when `workEmailDomain` is one of the company's admin-listed `companyDomains`, never by automatic subdomain or name matching (§2.8: a domain match is a lead). This applies to `isVerifiedEmployeeOfCompany` and the inbox query. Blocked pairs and capacity are unchanged. A privacy review sits inside the Tier 1 review. It runs after the D-193 server rows, because it edits `server/db.ts`. | `server/referrerAvailability.ts`, `server/db.ts`, tests |
| `D-174-catalog-country` | 2 | Seekers filter by country for where they may work (§3.2) | A country derived at read time from location labels with a static country and city table (`REGION_TOKENS` already lists many countries; `server/jobSources/greenhouse.ts:62-68`), shown as a `countries` facet and a `country` filter. It is an additive response field: no migration, and an unknown label maps to no country. | `server/jobSources/**` (after `D-174-job-sources-more`), `shared/jobCatalog.ts`, `server/jobCatalogRoutes.ts`, tests |

### 7.3 Amendments this packet recommends to queued rows (applied by whoever re-syncs those rows; not edited here)
1. **`D-174-ask-from-job` (D-193 §5.8):** when `opportunityId` names a post with no `targetRoleUrl`, the body schema allows no URL. The company binds from the post's `companyDomain` under the post lock, before any URL resolution, and the job row takes the post's title and location. The quote route accepts that `opportunityId`. Add a test: a linkless post creates a request bound to its company, and a linkless post from another company is refused. This builds D-177's "email-only jobs are not silently rejected".
2. **`D-174-company-search` (D-193 §5.4):**
   - Extend the legal-suffix list beyond Ltd, Pvt, Inc, LLC, GmbH and Corp. Candidates, each confirmed by the builder: AG, SA, SAS, SARL, SE, BV, NV, AB, AS, ASA, Oy, Oyj, SpA, Srl, Pty, KK, Ltda, PLC, Sdn Bhd.
   - Allow native-script aliases in `shared/companyNameAliases.ts` (for example a Japanese name for `nintendo`), with no transliteration engine.
3. **`D-174-held-ask-reconfirm`:** gains the dependency on `.d176-composer` (§7.1), because both edit `shared/moneyCopy.ts`.
4. **`D-086.count`:** gains the dependency on `.directory-payload` (§7.1).

## 8. Order and holds
1. `D-174-fix-post-binding` and `D-174-company-search` can start now. `.d176-composer` follows fix-post-binding; `.search` follows company-search.
2. `.jobs` follows `.d176-composer` and `.search`. `.directory-payload` follows `.d176-composer`, company-search and `D-176-public-claims`.
3. `.job-locked` waits for `D-174-ask-from-job`. That row waits for `D-174-held-ask-reconfirm`, and through it `D-090-BYOR` and `D-132-item3`. This is the longest chain. The steps before it are useful on their own once the release turns them on.
4. The release waits for everything above. `D-048-p3-live-review-find`, `D-177-recruiter-posts-referral-drives` and `D-086.mount` already wait for the parent.
5. `D-048-p3-live-review-find` and `D-099-bonus-line` own the same page files. Both already wait, directly or through other rows, for the parent. Whether `validateAssignments` accepts subtasks overlapping a row that waits for their parent is **unverified**. The registering session runs it.

## 9. What this packet does not do
- No cross-company keyword or location search, and no universal search box. PR #645's claimed owner direction (universal search, location-only search, "Ask for referral" as the only action) is not registered. The company-first journey here is compatible with it: the jobs list has no Apply action, and posts come first. A universal search packet follows registration under D-225 (4). D-170's keyword search stays with its own lane.
- No change to pricing, the band mapping, charging time, refunds, the free allowance, the pool hand-off, first-look length (D-220 is #672's), timers or expiry (`D-174-expiry-clock-removal`'s), the login rule, legal text or referrer access.
- No D-177 recruiter or HR posting. This packet only consumes posts that already exist, including linkless `walk_in` posts.
- No new owner question about charging at pickup or refunds (§2.8).

## 10. Decision re-rating for this packet (D-206 method, scoped to the decisions this row rests on)
These ratings live in this packet only, because the brief limited this session to one file. `docs/plans/DECISION-REVIEW.md` was not appended to; the next CEO session should carry them there.

| Entry | Rating | Note |
|---|---|---|
| D-174 | 8 | A clear journey. **Against:** "fetch all live jobs" cannot be met for most employers through free documented sources today (§6), so the honest "can't list yet" state will be common. |
| D-176 | 9 | It matches the seeker's mental model. The remaining gap is code drift (§3.3), fixed by `.d176-composer`. |
| D-177 | 7 | Its open questions 2 to 4 (who verifies recruiters, reward fields, moderation) block its own build, not this journey's use of linkless posts. |
| D-193 | 8 | Its server rows are what make this executable. **Against:** the `D-174-ask-from-job` chain is long (§8.3). |
| D-062 (as kept by D-193 (3)) | 7 | It protects referrer capacity. **Against:** pool delivery is one at a time, so a waiting request reaches one person per lapse cycle. Not reopened (§2.8). |
| D-110 | 7 | Always a level, leaning lower. **Against:** English-only keywords (§3.6). |
| D-220 | 8 | The code still says 48 h (§3.4) until #672 lands. |
| D-225 | 9 | Followed here: read receipt, no implementation. |

## 11. Findings, recommendations and owner questions

### Findings (each sourced above)
1. The company door, drawer, `/ask` and composer still show availability before sending, and the public directory payload still exposes it. Both contradict D-176 (§3.3).
2. A post-save line already distinguishes "reached" from "waiting", but in retired words and with clock wording that must keep following runtime (§3.4).
3. A linkless post cannot become a request, because the server resolves the employer from a URL before it reads the post, and D-193 §5.8 does not cover that case (§3.5).
4. The jobs route says `complete` for any verified board and filters location by exact label, with no country (§3.2).
5. The pool key is one exact email domain, so multinational employees on other domains never see their company's pool (§3.7).
6. Global limits: English-only interface and level keywords; a consumer-mail list weighted to some regions; a likely misroute on unlisted ATS hosts (unverified); Rs and USD payments only; no regional privacy basis in the text (§3.8, §6).
7. No earlier session pushed a journey packet (§0).

### Recommendations
| # | Recommendation | Rating |
|---|---|---|
| 1 | Adopt §4.1: one coverage-neutral pre-send state for every company. It is the direct answer to D-189's question, uses copy already shipped for unlisted companies, and changes no money behaviour. | 9/10 |
| 2 | Register the five subtasks and the release row as in §7.1, with the two registry edges in §7.3 (3) and (4). | 8/10 |
| 3 | Amend `D-174-ask-from-job` for linkless posts (§7.3 (1)) before its build starts. Otherwise D-177's employee-shared posts stay unrequestable. | 8/10 |
| 4 | Queue `D-174-ats-host-routing` and `D-174-consumer-mail-global` early. They are small, and each closes a way a request or a "verified" status reaches the wrong people in non-US and non-Indian markets. **Against:** both rest on code reading and general knowledge; the red tests and vendor-documentation checks must confirm them first. | 8/10 |
| 5 | Queue `D-174-catalog-country`, so global seekers can filter by where they may work. | 7/10 |
| 6 | Queue `D-174-company-domain-routing` after the D-193 server rows. **Against:** it touches the hot `server/db.ts` and changes who can see requests, so it needs the full Tier 1 and privacy review; admin-listed domains only. | 7/10 |

### Owner questions (with evidence)
1. **Should the privacy and terms text be reviewed for EU and UK seekers and referrers before SkipWait is promoted there?**
   - *Evidence:* the global-first instruction covers both sides. A search of `client/src` and `shared` on `7226511` finds no GDPR, UK GDPR or other regional basis. Legal text is owner-controlled (AGENTS.md guardrails).
   - *Recommendation, 8/10:* a review before any promotion aimed at the EU or UK.
   - *Against:* a proper legal review may cost money (D-031). A self-review is not legal advice. Waiting delays marketing in those regions, not the build.
   - *Default until answered:* no legal text changes, and no product copy claims jurisdiction-specific compliance.

   The L1-L10 to band mapping (`docs/PRICING.md:24`) is already an open owner item, not a new question. Until it is settled, the journey shows no band names (§4.6).

## Status
D-174-seeker-journey-build: architecture packet written — Claude (this session) — 2026-10-28 — branch `claude/upbeat-bell-riordu`. Reasoning and docs only (D-225). No code, no registry or register edits, no PR. The subtasks in §7 are proposals until a registering session adds them.
