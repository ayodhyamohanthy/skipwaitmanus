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
4. **Client** (`Explore.tsx` typeahead, `useCompanySearch.ts`): everything lands dark — `COMPANY_TYPEAHEAD_ENABLED` stays `false` and the switch line stays with `D-174-seeker-journey-build`. The recorded release gate (D-223 (3), ruling 10: preview QA, independent review, the CEO's sign-off) is preserved: no original explicitly supersedes it for the typeahead (Oct 21 predates the Nov 1 ruling; Nov 8 is generic ship-it, not an explicit waiver). The flip is exactly one remaining approval: the CEO's (the user's) explicit go, after preview QA captures at 1280+390 and the independent review. Under the flag, directory suggestions behave as today (open the door). Discovered suggestions show name + domain (+ logo when the source has one, degrading to an initial under the current CSP) and open a confirmation card: the honest state — no door at this company yet, the pick can't start an ask by itself — with company-named paste-a-job-link and open-the-door CTAs. No fake doors.
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
