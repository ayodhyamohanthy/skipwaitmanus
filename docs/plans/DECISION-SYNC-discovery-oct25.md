# Decision sync: automatic company discovery (frozen, Oct 25 2026)

**Status: frozen founder direction.** Anchors: phonemsg-01M5SE6VFWZJENEG0CDD2CC3XS ("Told you right to upgrade to automatic discovery of companies as user types like linkedin"), freeze confirmations phonemsg-01M5SE73H7C6A0AFA7K9E7P0KT and phonemsg-01M5SE7ASV2Y7YCRRZ99E23Y63, push instruction phonemsg-01M5SE8FFRQV8YAE16DMXGPSQV, build-ownership confirmation phonemsg-01M5SE8NHZ499S10KSKANWJN1F ("So agents will build it"). Same iCloud conversation, Oct 25 2026 ~17:17-17:19 IST.

## The decision

Company discovery is **automatic as the user types**, the way LinkedIn's company field works. It is not the manually maintained directory, and it is not an admin-registered list. This was decided before Oct 25 and was re-frozen today; it supersedes any plan that treats the fixed 39-company directory as the company source for seekers.

## The full chain (founder clarification, phonemsg-01M5SEJS8A37W54H4QPDPMA9FQ, Oct 25 ~17:24 IST)

Discovery does not stop at the company name. The frozen chain is: **company selection -> verified official careers source -> current job links -> referral request.** Manually registering an ATS board per company is a fallback, not the mechanism.

Requirements for the careers-source stage:

1. **Automatic careers-site discovery**: from the resolved official domain, find the company's own careers page without human registration - homepage and well-known paths (/careers, /jobs), the site's own links, its sitemap, and known ATS hosts (boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com, apply.workable.com, jobs.smartrecruiters.com and custom-domain boards) linked from the company domain.
2. **Current jobs from the discovered source**: when the careers page sits on a known ATS, read its public postings API/feed; otherwise parse the careers page itself, preferring structured data (`schema.org/JobPosting` markup) over page scraping.
3. **Truthful states, never conflated**: "jobs found (N)", "careers site found but we cannot read its listings" and "careers site lists no open roles" are three different answers. A failed fetch must not erase existing jobs or present as "no openings" (same rule as the catalog sync).
4. **Verification**: the careers source must belong to the resolved company domain (or be linked from it); a board that cannot be tied back to the official domain stays unverified and serves nothing - same rule as admin registration today.
5. **Manual registration stays** as the escape hatch for companies whose careers site defies every automatic path - it is the exception path, never the default flow.

## What this means for existing work

- The fixed directory stays only as seed data and coverage display, never as the boundary of what a user can pick.
- D-174-job-catalog (PR #650) admin board registration is **complementary backend only**: it ingests jobs for companies whose board is registered. It does not fulfil this decision and must not be cited as the discovery mechanism.
- Every seeker surface that names a company (the universal ask box, job search, alerts, BYOR) uses the same discovery source.

## Requirements for the build row(s)

1. **Typeahead**: as the user types a company name, matching companies appear with name + logo + domain, ranked; selecting one resolves to a canonical company identity keyed by its official domain (consistent with `workEmailDomain` verification for referrers).
2. **Any company**: typing a company we have never seen must still resolve it when a usable source knows it. The typed-name fallback is a last resort, not the discovery mechanism: the build must chain the free sources (Wikidata, then GLEIF, then Wikipedia ranking) and only fall back to a `companySuggestions`-style typed-name record when every source misses. "We only found it because the user typed it" is not discovery and must not be presented as such.
3. **Free sources only** (founder money rule): no paid provider. Grounded candidates as of Oct 25 2026:
   - **Wikidata** (primary): free, CC0. Entity search via `https://www.wikidata.org/w/api.php` (`wbsearchentities`) and the SPARQL endpoint `https://query.wikidata.org/sparql`; carries official website, logo and ticker for large companies. Respect its rate limits and User-Agent policy.
   - **GLEIF** (long-tail supplement): the free, keyless LEI registry API `https://api.gleif.org/api/v1/lei-records` (verified live Oct 25: legal-name filter returns real entities, e.g. HDFC Bank). Covers registered legal entities worldwide, including many private companies Wikidata lacks - this is the main answer for the long tail.
   - **Wikipedia OpenSearch** as a fallback for spelling/ranking.
   - Optional jurisdiction registries for verification, not primary search: SEC EDGAR company_tickers (US-listed, free), Companies House (UK, free key).
   - Clearbit Autocomplete is **not usable**: Clearbit's own FAQ (April 2025) marks it a legacy, unsupported, existing-customers-only product.
   - Commercial freemium lookups (logo.dev, Clearout, Apify actors) exist but are not the default; any paid tier is out of scope.
4. **Identity disambiguation**: prefer the official-website domain from the source; when sources disagree or confidence is low, show the user the candidate (name + domain) to confirm, never silently guess a domain. No coverage promise the sources cannot keep: the UI must not claim "every company" - it claims "search any company".
5. **Honesty in copy**: do not promise LinkedIn-scale coverage; Wikidata skews to large/notable companies. The typed-name fallback covers the long tail.

## Open questions for the architect seat (not blockers to registration)

- Whether this lands as one row (typeahead + source adapter + identity resolver) or split (source adapter, then surface wiring).
- Caching/refresh policy for source responses (Wikidata entities change rarely; cache aggressively).
- Whether logos hot-link, cache locally, or ship as initials-only placeholders at launch (cost and hotlink-policy check per source).
