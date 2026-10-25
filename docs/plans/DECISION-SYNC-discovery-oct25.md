# Decision sync: automatic company discovery (frozen, Oct 25 2026)

**Status: frozen founder direction.** Anchors: phonemsg-01M5SE6VFWZJENEG0CDD2CC3XS ("Told you right to upgrade to automatic discovery of companies as user types like linkedin"), freeze confirmations phonemsg-01M5SE73H7C6A0AFA7K9E7P0KT and phonemsg-01M5SE7ASV2Y7YCRRZ99E23Y63, push instruction phonemsg-01M5SE8FFRQV8YAE16DMXGPSQV, build-ownership confirmation phonemsg-01M5SE8NHZ499S10KSKANWJN1F ("So agents will build it"). Same iCloud conversation, Oct 25 2026 ~17:17-17:19 IST.

## The decision

Company discovery is **automatic as the user types**, the way LinkedIn's company field works. It is not the manually maintained directory, and it is not an admin-registered list. This was decided before Oct 25 and was re-frozen today; it supersedes any plan that treats the fixed 39-company directory as the company source for seekers.

## What this means for existing work

- The fixed directory stays only as seed data and coverage display, never as the boundary of what a user can pick.
- D-174-job-catalog (PR #650) admin board registration is **complementary backend only**: it ingests jobs for companies whose board is registered. It does not fulfil this decision and must not be cited as the discovery mechanism.
- Every seeker surface that names a company (the universal ask box, job search, alerts, BYOR) uses the same discovery source.

## Requirements for the build row(s)

1. **Typeahead**: as the user types a company name, matching companies appear with name + logo + domain, ranked; selecting one resolves to a canonical company identity keyed by its official domain (consistent with `workEmailDomain` verification for referrers).
2. **Any company**: typing a company we have never seen must still resolve it when a usable source knows it; when no source knows it, the user can continue with the name they typed (a `companySuggestions`-style record), not a dead end.
3. **Free sources only** (founder money rule): no paid provider. Grounded candidates as of Oct 25 2026:
   - **Wikidata** (primary): free, CC0. Entity search via `https://www.wikidata.org/w/api.php` (`wbsearchentities`) and the SPARQL endpoint `https://query.wikidata.org/sparql`; carries official website, logo and ticker for large companies. Respect its rate limits and User-Agent policy.
   - **Wikipedia OpenSearch** as a fallback for spelling/ranking.
   - Clearbit Autocomplete is **not usable**: Clearbit's own FAQ (April 2025) marks it a legacy, unsupported, existing-customers-only product.
   - Commercial freemium lookups (logo.dev, Clearout, Apify actors) exist but are not the default; any paid tier is out of scope.
4. **Identity disambiguation**: prefer the official-website domain from the source; when sources disagree or confidence is low, show the user the candidate (name + domain) to confirm, never silently guess a domain. No coverage promise the sources cannot keep: the UI must not claim "every company" - it claims "search any company".
5. **Honesty in copy**: do not promise LinkedIn-scale coverage; Wikidata skews to large/notable companies. The typed-name fallback covers the long tail.

## Open questions for the architect seat (not blockers to registration)

- Whether this lands as one row (typeahead + source adapter + identity resolver) or split (source adapter, then surface wiring).
- Caching/refresh policy for source responses (Wikidata entities change rarely; cache aggressively).
- Whether logos hot-link, cache locally, or ship as initials-only placeholders at launch (cost and hotlink-policy check per source).
