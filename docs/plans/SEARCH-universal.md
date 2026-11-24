# SEARCH-universal: one search box for company name, job title, job link or company website, leading to the careers job page (D-394)

Tier 2 · lane `search-universal` · branch `agent/queue/search-universal` · epic D-174 · depends on `D-174-seeker-journey-build`

## Why

Owner, Nov 24 (D-394): "Let users search by job title, url, company name (and then get career job links) let
users have the freedom to search as they like". D-360 set this direction (Nov 18, "users are never asked for job
IDs"); today search answers company names only, and "product designer" returns nothing.

## The build

The one search box on `/explore` (and the home search) accepts anything and decides what it is:

1. **A job link** (any `https://` posting URL): the existing job-link preview resolves company and role; the
   result opens that company with the job picked, ready to ask, and shows "Apply on the careers site" to the
   posting itself.
2. **A company website** (`stripe.com`, `https://www.stripe.com`): resolves to that company, directory first,
   then discovery (`SEARCH-work-domain` rules).
3. **A company name**: today's typeahead (directory, then worldwide discovery).
4. **Anything else** (a job title, skill or keyword): searches catalog job titles (and locations) across all
   companies with jobs, newest first, each result showing company, title, location, "Referrers here" or
   "No referrers yet", "Apply on the careers site" (the job's `applyUrl`) and "Ask for a referral".

One server endpoint answers all four (`GET /api/search?q=`), with Zod-validated input and output, a length cap
and a rate limit; no new data source and no paid API. Empty states say what to try next and offer the "invite
someone inside" action for companies with no referrer (D-360 (5)).

## Tests (red first)

Classification of each input kind; title search ranks exact phrase first and only returns open catalog jobs;
URL and website inputs resolve to the right company; the presence label matches `referrerPresence`; signed-out
search works; captures of each result kind at 1280 and 390.

## Acceptance

Focused tests, `pnpm check`, required CI, captures; on the deployed exact SHA, typing "product designer", a
Greenhouse job link, `stripe.com` and "Neutrinos" each lead to a careers job link or the company's jobs.

## Status

- SEARCH-universal: todo
