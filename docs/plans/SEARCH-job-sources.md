# SEARCH-job-sources: verified careers-board sources for the listed companies, so the jobs list has real jobs (D-394)

Tier 2 · lane `search-job-sources` · branch `agent/queue/search-job-sources` · epic D-174

## Why

Owner, Nov 24 (D-394): push company job search live. The jobs list and the catalog sync are built
(`D-174-job-catalog`, `D-174-job-sources-more`: Greenhouse, Ashby and Lever), but production has no
`companyJobSources` row: `GET /api/companies/stripe/jobs` answers `completeness:"unavailable"`, `source:null`.
Switching the list on without sources shows nothing.

## The build

For each listed company (`shared/companyDirectorySeed.ts`) and each discovered company a seeker asks about
most, find its **public** board on Greenhouse (`boards-api.greenhouse.io/v1/boards/<token>/jobs`), Ashby
(`api.ashbyhq.com/posting-api/job-board/<name>`) or Lever (`api.lever.co/v0/postings/<site>`), verify that the
board belongs to that company (the company's own careers page links to it: that page is the `evidenceUrl`), and
load it through the existing admin route `POST /api/admin/job-sources` or a reviewed seed the sync reads. Record
companies with no public board on these three providers (for example Workday, SuccessFactors, Taleo) as
"not covered" in the packet, never as an empty list presented as complete. Free, public, documented endpoints
only (D-031, D-170/D-175); respect each provider's rate limits and Lever's crawl delay.

## Acceptance

Sources verified with evidence; after `JOB_CATALOG_ENABLED` is on (the release row), `job-catalog-sync` fills
jobs and `GET /api/companies/<slug>/jobs` answers real jobs with `completeness` other than `unavailable` for
every covered company.

## What landed (Nov 24)

The boards are a reviewed seed, `shared/jobSourceSeed.ts` (Zod-checked, one entry per company and board). Each
`job-catalog-sync` run first inserts any seeded board that is missing (`ensureSeedSources` in
`server/jobSources/sync.ts`), with `verified` status and `verifiedAt` for a well-evidenced board and `unverified`
for one that needs a person. It never updates a board that is already there, so an admin's verdict or a
`failing` status stands; a seeding failure fails the run visibly (Sentry through the job runner) and the boards
already present are still fetched. A seeded company missing from the directory is reported, not inserted.
Nothing runs while `JOB_CATALOG_ENABLED` is false; the release row turns it on.

Tests: `shared/jobSourceSeed.test.ts` (every entry parses, every company is in the directory seeds, one board
and one entry per company, only `needs-review` is unverified), `server/jobSources/seed.test.ts` (seeding runs
before the fetch, a seeding failure fails the run and the fetch still runs) and
`server/jobSources/seedStore.test.ts` (real drizzle queries on the in-memory database: inserts with the seeded
status, reports a missing company, leaves an existing `failing` board untouched, idempotent, the unverified
board is not fetched).

### Covered: 14 of the 39 listed companies (researched Nov 24 2026, job counts from the public board API that day)

| Company | Provider | Board | Evidence (the company's own page) | Kind | Jobs | Seeded |
|---|---|---|---|---|---|---|
| Discord | Greenhouse | `discord` | discord.com/careers | links the board | 29 | verified |
| MongoDB | Greenhouse | `mongodb` | mongodb.com/company/careers/see-jobs | links the board | 419 | verified |
| OpenAI | Ashby | `openai` | openai.com/careers/search | links the board | 866 | verified |
| 1Password | Ashby | `1password` | 1password.com/careers | links the board | 80 | verified |
| Kraken | Ashby | `kraken.com` | kraken.com/careers | links the board | 94 | verified |
| Snowflake | Ashby | `snowflake` | careers.snowflake.com | links the board | 373 | verified |
| Stripe | Greenhouse | `stripe` | stripe.com/jobs/search | same job IDs | 768 | verified |
| Gemini | Greenhouse | `gemini` | gemini.com/careers | same job IDs | 26 | verified |
| SoFi | Greenhouse | `sofi` | sofi.com/careers | same job IDs | 54 | verified |
| Nintendo | Greenhouse | `nintendo` | careers.nintendo.com/jobs | same job IDs | 76 | verified |
| Capco | Greenhouse | `capco` | capco.com/Careers/Job-Search | same job IDs | 692 | verified |
| Pinterest | Greenhouse | `pinterest` | pinterestcareers.com | same job IDs | 167 | verified |
| Upstart | Greenhouse | `upstart` | careers.upstart.com/jobs/search | same titles, board links back | 76 | verified |
| Coinbase | Greenhouse | `coinbase` | coinbase.com/careers/positions/8289787 | site refused automated reads | 249 | **unverified**: an admin confirms in a browser, then it syncs |

### Not covered: 25 companies whose jobs are on a system the catalog does not read

Their jobs list keeps answering `completeness: "unavailable"` with the careers link, never an empty list called
complete. Adding a provider is its own row.

| System | Companies |
|---|---|
| Workday | Accenture, Blackstone, IQVIA, Maersk, Concentrix, Merkle (Workday-style IDs) |
| SAP SuccessFactors | Wipro |
| Taleo | Société Générale |
| SmartRecruiters | ServiceNow |
| Avature | Lenovo, IBM |
| Jobvite | Varonis |
| Oleeo (tal.net) | Korn Ferry |
| Radancy (TalentBrew) | BlackRock, Ford |
| Keka | Neutrinos |
| RippleHire | CitiusTech |
| Own portal or API | TCS (iBegin), Infosys, Cognizant, Capgemini (own job API, 6,602 jobs), BNP Paribas, KPMG (member-firm sites) |
| Sends to its parent | HashiCorp (IBM careers search) |
| No careers page | SkipWait |

## Status

- SEARCH-job-sources: done (Nov 24, Claude Code · 695b). Seed and sync seeding landed with tests; the live
  jobs-list proof (`GET /api/companies/<slug>/jobs` with real jobs for the 13 verified companies) is the release
  row's, after `JOB_CATALOG_ENABLED` is on and the first `job-catalog-sync` run.
