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

## Status

- SEARCH-job-sources: todo
