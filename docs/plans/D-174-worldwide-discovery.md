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
4. **Client** (`Explore.tsx` typeahead, `useCompanySearch.ts`): everything landed dark — `COMPANY_TYPEAHEAD_ENABLED` stayed `false` and the switch line stayed with `D-174-seeker-journey-build`. This paragraph's gate discussion is the PRE-FLIP record: the recorded release gate (D-223 (3), ruling 10: preview QA, independent review, the CEO's sign-off) was preserved and no original explicitly superseded it then (Oct 21 predates the Nov 1 ruling; Nov 8 was generic ship-it, not an explicit waiver). The approval path was unresolved - the mandate originals that would let a CEO-capacity session sign off were not on the user's channel. Resolution: the owner's own 2026-11-17 defect directive made the signer question moot (he instructed the outcome himself), and the 2026-11-18 release flip in section 8 enabled production on that authority after the dark build's independent review. Under the flag, directory suggestions behave as today (open the door). Discovered suggestions show name + domain (+ logo when the source has one, degrading to an initial under the current CSP) and open a confirmation card: the honest state — no door at this company yet, the pick can't start an ask by itself — with company-named paste-a-job-link and open-the-door CTAs. No fake doors.
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
3. Public-route traffic bounds (instance-local, in-memory): single-character
   queries never reach the sources (COMPANY_DISCOVERY_MIN_QUERY); concurrent
   asks for one name share a single in-flight upstream round and spend the
   budget once; at most 4 upstream rounds run at once; a source 429 pauses
   ALL discovery upstream calls for 60s; 3 consecutive upstream failures
   (5xx, timeout, network) open a 30s breaker, reset by a success; and each
   client key gets a budget of 20 name chains per 10 minutes, where a free
   transition must extend or shorten the client's most recent name within a
   30s typing gap, at most 8 in a row (3-4 typed searches spend 3-4 of 20,
   never silently exhaust; 50 rapid names sharing a 2-char prefix are 50
   chains and exhaust). These bounds
   are per server instance, not fleet-wide. Wikimedia requests carry the
   identifying SkipWait User-Agent. Client key: req.ip is edge-derived by
   design - the Worker (src/worker.ts, shared/clientIp.ts) strips
   client-supplied forwarding headers and writes X-Forwarded-For from
   CF-Connecting-IP, which Express (trust proxy) reads; the contract is
   pinned by server/clientIpEdge.test.ts. Direct-origin exclusion and the
   deployed header's presence are NOT verified here, so the budget is
   honestly per-edge-IP-as-seen, not proven per-person; the global caps,
   cooldown and breaker bound upstream traffic regardless.
3b. Degraded is said out loud, never cached publicly: any limit or upstream
   failure answers with discoveryState "degraded" + a reason (rate_limited /
   busy / unavailable), Cache-Control "private, no-store", and whatever a
   fresh-or-stale cache holds - so a throttled or failed discovery can never
   read as "no such company" to this visitor or poison a shared cache for
   others. The client shows a "briefly limited" line and never treats a
   degraded empty as a no-match. Directory results are unaffected either way.
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
6. Company context (D-174-worldwide-discovery.company-context, landed dark):
   the confirmation card's "Paste a job link on the ask page" now carries the
   pick to /ask as DISPLAYED CONTEXT ONLY - {name, domain, at} under one
   localStorage key (skipwait:discovery-handoff, TTL mirroring
   ASK_PREFILL_TTL_MS, consumed on use, cleared on sign-out via
   referralLocalStorageKeys). The composer surfaces a fresh pick through the
   existing hint field ("You picked {name} ({domain}) - paste its job link
   below") when the link box is empty; every other case keeps today's hint
   exactly. Displayed context does not make an unknown-company ask work: the
   company is not in the directory, the seeker still pastes a real job link,
   and Send, price, validation, eligibility and the company binding are
   unchanged. Preview QA must check the true outcome: pick shown as context,
   ask still impossible without a real link, send behavior identical.
7. The switch is an env gate (D-174-seeker-journey-build.typeahead-flip):
   COMPANY_TYPEAHEAD_ENABLED reads VITE_COMPANY_TYPEAHEAD (default false). The
   preview route is in-repo, chosen after the dashboard inspection showed the
   dashboard exposes no preview-scoped build-variable edit surface for this
   worker and the Worker Previews migration is irreversible: vite.config.ts
   defines the variable from the pure resolver in vite.typeahead-flag.ts,
   which turns it ON only for Workers Builds non-main branch builds
   (WORKERS_CI=1 + WORKERS_CI_BRANCH, the dashboard's branch previews) and
   forces it OFF on any CI build of main - even if the variable is set in
   that environment - and fails closed (OFF) on an unknown or empty CI
   branch. The provider variables (WORKERS_CI, WORKERS_CI_BRANCH) are named
   by the Workers Builds 2025-06-10 changelog; the resolver's branch handling
   is pinned by its unit tests, and a Workers Builds build of this branch
   completed with them. End-to-end proof that a Workers Builds branch build
   serves the flag ON is NOT established: this worker serves no reachable
   versions (workers.dev and previews are disabled on it), and this row's
   interactive preview QA ran on a local explicit-var build
   (VITE_COMPANY_TYPEAHEAD=true) - a different branch of the same resolver,
   reported separately from the Workers Builds path, which stays unverified
   end-to-end. Hard-limit reconciliation: before this row the switch was a
   literal-false constant, so no build could enable the typeahead; after this
   row the protection is deliberately weaker than a literal-false constant
   and is stated precisely: the resolver defaults OFF and forces OFF on
   GitHub CI and Workers Builds builds of main even when the variable is set
   there, but a local, ad-hoc, tag or PR build with
   VITE_COMPANY_TYPEAHEAD=true produces a flag-ON artifact, and the residual
   manual promotion paths (dashboard version promotion, ad-hoc local deploy)
   could carry such an artifact to production. The recorded release gate
   (D-223 (3): preview QA, a review and the CEO's sign-off; who signs off
   stays unresolved through main) is the process control over those paths,
   not a code guarantee, and nothing here waives it. This weaker protection
   is accepted only to enable preview preparation; production activation
   stays held. The production deploy workflows do not set the
   variable (verified from .github/workflows/deploy-pages.yml and
   deploy-api.yml; zero COMPANY_TYPEAHEAD references across workflows,
   scripts and the Dockerfile). The false-pin in companySearch.test.tsx
   asserts the default is false only in a bare environment - weaker than the
   old literal false, since a test cannot see an explicitly set variable -
   and companyTypeahead.define.test.ts pins the resolver. Preview QA before any production enable, at 1280 and
   390: directory, tata, google, no-match, degraded, card handoff (pick shown
   as context on /ask), unknown-company job link, and a real-provider round,
   on a flag-on preview build.
8. RELEASE FLIP (2026-11-18, second PR of the flip row): production enable.
   The resolver now builds ON for CI builds of main by default; the explicit
   variable overrides in either direction (VITE_COMPANY_TYPEAHEAD=false in
   the build env plus a redeploy, or a revert, rolls back - no runtime or
   dashboard toggle exists). Authority: the owner's own defect report on
   2026-11-17 22:17 IST (WhatsApp: the typed company is still not found; the
   search was meant to reach companies worldwide). The D-223 (3) signer
   question (which session signs off) is moot once the owner instructs the
   outcome directly; no session asserts signing capacity. Gate evidence
   before this enable: independent review at exact heads (PRs #1264 and
   #1265); the preview QA captures listed in section 7 and the post-merge
   production checks (flag still off, parser clean-miss fix live) are
   coordinator-reported evidence, not reviewer-verified. Coverage stays
   qualified: discovery is English-Wikipedia/Wikidata-based, so it is NOT
   any-company-anywhere - misses keep the paste-a-job-link path with
   employer confirmation at send, and the actual referral outcome for an
   uncovered company (a waiting ask, nothing spent) is unverified live.
   Section 7 above is the pre-flip history and its "activation stays held"
   lines describe that period, not the current state.
9. Credit/coverage facts at enable time, with their verification levels:
   reviewer-verified on the create path (server/db.ts): the employer domain
   resolves before the wallet is touched, available coverage is computed
   under lock, a waiting (uncovered) ask spends nothing, notifies nobody
   and holds no open slot, and a covered ask spends inside the transaction
   with full rollback on failure. Comment-level, NOT reviewer-verified: the
   delivery-time spend at first visibility and the withdraw/expiry refund
   mechanics. Known limit, not a blocker: with ASK_LEVEL_COST off (current
   default) the pre-send quote on an uncovered company shows the flat
   1-credit line while the actual charge at send is zero, and a coverage
   flip between quote and commit keeps today's flat-charge behavior -
   pre-existing, over-discloses cost, follow-up queued to the
   composer-neutral row rather than flipped unreviewed here. Wikimedia:
   server/companyDiscovery.ts sends a descriptive User-Agent with a contact
   URL ("SkipWait/1.0 (https://skipwait.me; company discovery)"), matching
   what Wikimedia's User-Agent policy asks for; that is not blanket policy
   compliance and carries no throttle guarantee - an earlier live 429
   remains a known risk. Typed-query privacy: typed company names reach only
   our own /api/companies/search; the Wikimedia calls are server-side and
   carry the query text with no user identity, cookies or account data, and
   the client never calls Wikimedia directly. The /privacy processor list
   (D-345) names Wikipedia and Wikidata with exactly this flow in the same
   flip, so the disclosure lands before enable rather than as a deferred
   gap (scope widened in the registry for TrustPrivacy.tsx and its test,
   overlaps with LAUNCH-legal-copy and D-093-language reported).
