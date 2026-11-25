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

Sources verified with evidence; `JOB_CATALOG_ENABLED` is on since the release row `D-174-seeker-journey-build` (Nov 24), so `job-catalog-sync` fills
jobs and `GET /api/companies/<slug>/jobs` answers real jobs with `completeness` other than `unavailable` for
every covered company.

## Verified Job Board Sources (Greenhouse, Ashby, Lever)

The following companies have public, verified job boards on supported ATS providers (`shared/jobSourceSeed.ts`):

| Company Slug | Name | Provider | Board Token | Evidence Careers URL | Verified Openings |
| --- | --- | --- | --- | --- | --- |
| `stripe` | Stripe | `greenhouse` | `stripe` | https://stripe.com/jobs | ~768 |
| `openai` | OpenAI | `ashby` | `openai` | https://openai.com/careers | ~866 |
| `coinbase` | Coinbase | `greenhouse` | `coinbase` | https://www.coinbase.com/careers | ~249 |
| `discord` | Discord | `greenhouse` | `discord` | https://discord.com/careers | ~29 |
| `mongodb` | MongoDB | `greenhouse` | `mongodb` | https://www.mongodb.com/company/careers | ~418 |
| `pinterest` | Pinterest | `greenhouse` | `pinterest` | https://www.pinterestcareers.com/ | ~167 |
| `snowflake` | Snowflake | `ashby` | `snowflake` | https://careers.snowflake.com/ | ~374 |
| `1password` | 1Password | `ashby` | `1password` | https://jobs.1password.com/ | ~80 |
| `sofi` | SoFi | `greenhouse` | `sofi` | https://www.sofi.com/careers/ | ~54 |
| `gemini` | Gemini | `greenhouse` | `gemini` | https://www.gemini.com/careers | ~26 |
| `nintendo` | Nintendo | `greenhouse` | `nintendo` | https://careers.nintendo.com/ | ~76 |
| `upstart` | Upstart | `greenhouse` | `upstart` | https://www.upstart.com/careers | ~76 |
| `figma` | Figma | `greenhouse` | `figma` | https://www.figma.com/careers/ | ~145 |
| `notion` | Notion | `ashby` | `notion` | https://www.notion.so/careers | ~172 |
| `airbnb` | Airbnb | `greenhouse` | `airbnb` | https://careers.airbnb.com/ | ~199 |
| `lyft` | Lyft | `greenhouse` | `lyft` | https://www.lyft.com/careers | ~144 |
| `datadog` | Datadog | `greenhouse` | `datadog` | https://www.datadoghq.com/careers/ | ~385 |
| `reddit` | Reddit | `greenhouse` | `reddit` | https://www.redditinc.com/careers | ~147 |

## Uncovered Companies (Recorded as Not Covered)

The following directory companies use proprietary or unsupported ATS providers (Workday, SuccessFactors, Taleo, iBegin, etc.) with no public Greenhouse, Ashby, or Lever API boards. In accordance with D-175 and D-394, these are recorded as not covered rather than faked or shown as empty:

- **Launch Companies (`shared/companyDirectorySeed.ts`):**
  - `skipwait` (skipwait.me): Internal hiring team; no external public board.
  - `wipro` (Wipro): Enterprise proprietary portal (Phenom / SuccessFactors).
  - `go-neutrinos` (Neutrinos): No public Greenhouse/Ashby/Lever board.
  - `tcs` (TCS): Proprietary career portal (iBegin: `ibegin.tcs.com`). Note: the unrelated UK healthcare "tcs" Greenhouse board is excluded.
  - `merkle` (Merkle): Dentsu enterprise / SmartRecruiters.

- **Expansion Companies (`shared/companyDirectoryExpansionSeed.ts`):**
  - `kpmg`: Enterprise portal (BrassRing).
  - `accenture`: Enterprise portal (Workday).
  - `capgemini`: Enterprise portal (SuccessFactors).
  - `infosys`: Enterprise portal (SuccessFactors).
  - `cognizant`: Enterprise portal (Workday).
  - `kraken`: No public postings currently active on Lever.
  - `korn-ferry`: Proprietary portal.
  - `blackrock`: Enterprise portal (Workday).
  - `hashicorp`: IBM careers portal (acquired by IBM).
  - `varonis`: Proprietary portal (Comeet).
  - `lenovo`: Enterprise portal.
  - `capco`: Wipro / proprietary portal.
  - `blackstone`: Enterprise portal (Workday).
  - `citiustech`: Proprietary portal.
  - `ibm`: Enterprise portal (Kenexa).
  - `bnp-paribas`: Enterprise portal.
  - `servicenow`: Enterprise portal (SmartRecruiters).
  - `iqvia`: Enterprise portal (Workday).
  - `maersk`: Enterprise portal (Workday).
  - `ford`: Enterprise portal.
  - `concentrix`: Enterprise portal (Workday).
  - `societe-generale`: Enterprise portal.

## Status

- SEARCH-job-sources: follow-up fix — Claude Code · 695b — 2026-11-25. Live check of the D-174 release (#1575, `ee03cabb7`): Stripe, OpenAI and MongoDB each answer 50 real jobs, but Greenhouse snippets showed raw HTML (`<h2><strong>Who we are…`) because `?content=true` is entity-encoded and the helper stripped tags before decoding. `server/jobSources/plainText.ts` now decodes entities first, then strips tags (block tags as spaces), for Greenhouse directly and Ashby/Lever through `stripHtml`; stored rows heal on the next refresh.

- SEARCH-job-sources: done — 7544ac29e
