# D-174 worldwide company discovery

**Status: registered Nov 17 2026 (Instinct), founder-frozen direction from Oct 25 2026.** Spec: `docs/plans/DECISION-SYNC-discovery-oct25.md` (PR #660). This packet is the build row for stage 1 of that frozen chain: the company typeahead. It changes no frozen scope; the spec's own open question left row-splitting to the build.

## Authority (verified user-channel originals)

- "Told you right to upgrade to automatic discovery of companies as user types like linkedin" — phonemsg-01M5SE6VFWZJENEG0CDD2CC3XS (Oct 25, 17:17 IST)
- "Freezer it" / "Push to repo" / "So agents will build it" — phonemsg-01M5SE7ASV2Y7YCRRZ99E23Y63, phonemsg-01M5SE8FFRQV8YAE16DMXGPSQV, phonemsg-01M5SE8NHZ499S10KSKANWJN1F (Oct 25, 17:18 IST)
- "Freeze this and push to repo" — phonemsg-01M5SEPSD0B9BWSEAZZY2Q8XN3 (Oct 25, 17:26 IST)
- Defect report: typed companies still missing (user WhatsApp, Nov 17 2026, 22:17 IST). Live repro: `google` and `tata` both returned "No matching companies yet" on /explore while the directory holds 39 seed companies and the server search answers `tata` via alias.
- Ship authority (later than the Nov 1 release-row wording): "If something is live why are you not live ing it" — phonemsg-01M6X5N95046QXX2EJVFP44NX9 (Nov 8); "push to live whatever page is built" / "There are no users as of now so no worries" — phonemsg-01M5EZZWZ2RAN56S9MSC94NE9Y / phonemsg-01M5F00YAFT3KTVF1RR4R08RNY (Oct 21); launch mode D-349 (Nov 16).

## Scope of this row

1. **Discovery adapter** (`server/companyDiscovery.ts`): Wikidata primary — `wbsearchentities` for candidates, `wbgetentities` for official website (P856) and logo (P154); Wikipedia OpenSearch assists spelling/ranking. Free and keyless only; a descriptive User-Agent per Wikidata policy; in-memory TTL cache (no migration, no new table).
2. **Contract** (`shared/companies.ts`): `GET /api/companies/search` gains a `discovered` array next to `companies`. Directory hits stay first and unchanged; discovered entries are `{ name, domain, logoUrl?, source }`, deduped against directory domains. Old clients strip the unknown key, so the change is backward compatible.
3. **Identity**: keyed by the official domain from the source. Entities without an official website are not shown as companies. On ambiguity or low confidence the client shows the candidate (name + domain) for confirmation; the domain is never silently guessed.
4. **Client** (`Explore.tsx` typeahead, `useCompanySearch.ts`): everything lands dark — `COMPANY_TYPEAHEAD_ENABLED` stays `false` and the switch line stays with `D-174-seeker-journey-build`. The recorded release gate (D-223 (3), ruling 10: preview QA, independent review, the CEO's sign-off) is preserved: no original explicitly supersedes it for the typeahead (Oct 21 predates the Nov 1 ruling; Nov 8 is generic ship-it, not an explicit waiver). The flip is exactly one remaining approval: the CEO-capacity sign-off under D-223 (3), after preview QA captures at 1280+390 and the independent review. Provenance: 'the CEO' is the delegated decision role (D-109/D-203 owner verbatims), not the owner; a reversible typeahead switch is not owner-level under D-123, so no user approval is needed for the flip itself. Under the flag, directory suggestions behave as today (open the door). Discovered suggestions show name + domain (+ logo when the source has one, degrading to an initial under the current CSP) and open a confirmation card: the honest state — no door at this company yet, the pick can't start an ask by itself — with company-named paste-a-job-link and open-the-door CTAs. No fake doors.
5. **Honest failure**: a provider error or timeout never erases directory results and never presents as "no such company"; the search answers with directory hits and the discovery stage simply adds nothing. A query every source misses keeps today's no-match path (paste a job link / Request a company); a typed name alone is never presented as discovery.
6. **Copy honesty**: the UI says "search any company", never "every company"; Wikidata skews to large/notable companies.

## Explicitly not this row (parked)

- GLEIF long-tail supplement (registered entities without a domain need the wider confirmation UX; follow-up row).
- Careers-site discovery, jobs list, `COMPANY_JOBS_ENABLED` — stay with `D-174-seeker-journey-build` and its chain.
- Any paid provider (owner money rule D-031); Clearbit Autocomplete stays excluded (frozen spec).

## Gates before done

- Focused tests: adapter parsing/ranking/cache/failure, route merge and dedupe, schema compatibility, typeahead rendering of discovered entries and the confirmation card. Existing assertions ported, never deleted (GATE-test-integrity).
- Typecheck and the full required CI green on the exact head.
- Separate review of the final version before merge (Instinct routine-merge boundary); Tier 2 paths, so no review gate under D-352.
- Post-deploy proof (founder rule 8): live captures at 1280 and 390 of /explore answering a directory name, an alias (`tata`), a worldwide name absent from the directory (`google`), and a no-match, attached to the report.

## Coverage limits, stated plainly (Nov 17, independent review)

English-language Wikidata notable-entity discovery does not deliver universal
worldwide coverage, and this row never claims it: a real company missing from
Wikidata, or without an official-website statement, is not found. The honest
fallback for every source miss is the existing paste-a-job-link / request-a-
company path; the API and UI never promise "every company". The GLEIF
long-tail supplement stays parked with D-174-seeker-journey-build. The user's
worldwide goal is narrowed only to what the free sources actually resolve -
that limit is reported, not hidden.

## Independent review corrections (Nov 17, reviewer via main)

1. Provider 429/5xx is a failure, never a cacheable empty: non-OK source
   responses throw, only real non-empty answers are cached (6h TTL), and a
   failure answers the stale cache or nothing. No 6-hour poisoned empties.
2. Every candidate is validated against `discoveredCompanySchema` before it
   crosses the boundary; malformed entries (IP hosts, mailbox-provider
   families, overlong name/domain/logoUrl) are dropped one by one and can
   never fail the whole search response. The discovered domain schema keeps
   the host pattern but not the directory's work-email rule, which would
   wrongly drop dual-use official domains like zoho.com (Zoho Corporation);
   pure consumer-mail families are still refused.
3. Public-route traffic bounds: single-character queries never reach the
   sources (COMPANY_DISCOVERY_MIN_QUERY), concurrent asks for one name share
   a single in-flight upstream round, and Wikimedia requests carry the
   identifying SkipWait User-Agent. OPEN, stated for review: these are
   per-query controls only - nothing bounds aggregate upstream traffic across
   many distinct queries. The app's rate limiter (server/_core) is not wired
   to this public route; whether to wire it is left to review rather than
   widened here.
4. Qualification: typed non-companies (product, software/suite, website,
   place, work, band) are dropped even when their description mentions a
   company (the Zoho Office Suite / production-site noise); typed evidence
   beats description words. Domain dedupe is subdomain-aware.
5. The confirmation card names the no-door state exactly ("this pick can't
   start an ask by itself") with company-named CTAs, instead of letting the
   selection pretend a usable referral door. Client pins added for the
   tata-to-TCS alias path and logo degradation (CSP allows same-origin images
   only, so a Commons logo may be blocked; it falls back to the company's
   initial). Rendering Commons logos live needs an img-src exception in
   server/securityHeaders.ts - outside this row's owns, reported for a
   follow-up instead of widened here.
