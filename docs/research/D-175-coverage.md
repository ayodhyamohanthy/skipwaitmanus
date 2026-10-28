# D-175 coverage study: where the world's live jobs can come from, for global employers and global job seekers

| | |
|---|---|
| Row | `D-175-coverage-study` (Tier 3, docs only, lane `d175-research`). Packet: `docs/plans/D-193-journey-foundations.md` §5.10, building on §3.11 and its appendix (live GETs, Oct 24). |
| Scope | **Global first, on both sides.** On the employer side, it covers global employers, the SkipWait directory, and regional employers as named regions. India is one region, not the default. On the job seeker and employee side, it covers where the jobs we could list are located. Where a source or approach only works in some regions, this study says so, and it never claims worldwide coverage a source does not have. |
| Decisions | D-175 (goal; free and legal sources only), D-170 (verified sources only), D-176 (no public availability status), D-193 (sources, display, owner questions), D-123 (the Wikidata seed is the CEO's call), D-031/D-204 (no spend). |
| Method | Free, unauthenticated public GETs only, on 2026-10-28 between 17:21 and 17:43 UTC. Requests carried a `SkipWaitResearch/1.0 (+https://skipwait.me)` user agent, one request per board, with at least 1 s between Lever calls (Lever's `Crawl-delay: 1`). No account, no key and no paid source were used. SmartRecruiters' API was **not** called, because its API host's `robots.txt` disallows every crawler but LinkedInBot. Its figures are the packet's Oct 24 numbers. |
| Status | Research only. It decides nothing. The Wikidata seed is a proposal to the CEO (§6). §8 lists the owner questions with their evidence. |

Every count below is a live result from 2026-10-28 unless marked otherwise. A count is what the endpoint returned at that minute. It never shows that a company has no other jobs. Anything not confirmed live is marked **unverified**.

## 1. Summary

1. **The free official job APIs are global in reach, but their coverage is uneven.** Greenhouse, Ashby and Lever all serve customers worldwide from one documented, keyless endpoint each. Lever also runs a separate EU host. Who uses these systems is uneven, though: mostly venture-backed and mid-cap technology employers.
   - Of 50 well-known global employers probed, **24** have a confirmed board on one of these systems.
   - Of the 38 real employers in the SkipWait directory, **14** do.
   - None of the 12 largest employers by brand recognition (Google, Microsoft, Amazon, Apple, Meta, Netflix, NVIDIA, Salesforce, Oracle, JPMorgan Chase, Deloitte, Cisco) has a free, licensed, public read API.
2. **For job seekers, the reachable jobs are concentrated in North America.** The 43 confirmed boards returned 10,512 postings. Their locations break down as follows (keyword heuristic, §5):
   - about 53 % in the United States and 6 % in Canada
   - about 18 % in the UK, Ireland and continental Europe
   - about 8 % in India
   - about 7 % in Asia-Pacific outside India
   - about 3 % in Latin America
   - under 1 % in the Middle East and Africa

   A seeker in Lagos, Riyadh or Mexico City would find very few listable jobs near them from free official sources. This is a property of the sources, not of SkipWait.
3. **The enterprise systems that large employers use worldwide have no licensed public read API.** These are Workday, SAP SuccessFactors, Oracle Cloud HCM and Taleo, iCIMS, Phenom, Eightfold and Avature. Reaching them needs a crawl, which is §8 Q4. Some Workday tenants' `robots.txt` files explicitly allow their job paths and publish sitemaps, which is the most defensible crawl option if the owner wants one.
4. **A board token is not proof of identity.** The Greenhouse token `tcs` is Thornbury Community Services, a UK care provider, not Tata Consultancy Services. Lever `eternal` is a US firm, not Zomato's parent. Greenhouse `wise` is "Wise Worksite Field Sales", not Wise plc. Greenhouse `ramp` is "RAMP" with one posting, while fintech Ramp is on Ashby. This failure mode has no country boundary. D-193's admin-recorded `evidenceUrl` on the company's own domain is necessary, and §7 recommends a second guard.
5. **A Wikidata seed is global, but its depth is uneven.** About 21,063 items have an official website and are either listed on a stock exchange or report 1,000 or more employees. These include 4,006 in the United States, 2,235 in Japan, 1,264 in Germany and 1,002 in China. Countries with large job-seeker populations are thin: India 239, Mexico 82, Singapore 58, South Africa 48, UAE 23, Nigeria 20. The seed works best for North America, Europe and East Asia, and needs regional supplements elsewhere (§6).

## 2. Source survey: what each source can and cannot do, worldwide

| Source | Access | Region scope (stated, not assumed) | Evidence (live 2026-10-28 unless marked) | Usable under D-175? |
|---|---|---|---|---|
| **Greenhouse Job Board API** `boards-api.greenhouse.io/v1/boards/{token}/jobs` | Free, documented, no key (https://developers.greenhouse.io/job-board.html; doc not re-fetched today) | One global host. Boards returned jobs in all regions in §5. An EU-specific API host (`boards-api.eu.greenhouse.io`) did not resolve through this environment's proxy (502), so whether there is a separate EU data residency that this host does not serve is **unverified** | `robots.txt` disallows only `/embed/`. An unknown token returns 404. 32 boards answered | Yes. It is the D-193 launch source |
| **Ashby public job posting API** `api.ashbyhq.com/posting-api/job-board/{name}` | Free, documented, no key (https://developers.ashbyhq.com/docs/public-job-posting-api; not re-fetched) | One global host as observed. An EU host (`api.eu.ashbyhq.com`) did not resolve (502) (**unverified**) | `api.ashbyhq.com/robots.txt` returns 401, so no rule is published. 6 boards answered | Yes (row `D-174-job-sources-more`) |
| **Lever postings API** `api.lever.co/v0/postings/{site}?mode=json` | Free, documented, no key (https://github.com/lever/postings-api; not re-fetched) | **Two hosts: global and EU** (`api.eu.lever.co` answered 404 for an unknown site, so the host exists). An EU-hosted company is not visible on the global host. Both must be tried | `robots.txt`: `Allow: /`, `Crawl-delay: 1`. An unknown site returns `[]`. 5 boards answered | Yes, on both hosts (row `D-174-job-sources-more`) |
| **SmartRecruiters public API** | Documented and keyless, but robots-blocked | Global customer base (for example Bosch, Swiggy, Freshworks, Merkle in the Oct 24 appendix) | `api.smartrecruiters.com/robots.txt`: `User-agent: LinkedInBot / Allow: /v1/companies/ / User-agent: * / Disallow: /` | No (§8 Q3) |
| **Workday** (`{tenant}.wd{n}.myworkdayjobs.com`) | No licensed public read API. The career site's internal endpoint is undocumented | Used by large employers on every continent in this study, for example Accenture, IQVIA, Concentrix (sites in Brazil, Colombia, Spain, India and the UAE), Intel and Palo Alto Networks | `accenture.wd103.myworkdayjobs.com/robots.txt` allows `/AccentureCareers/` and lists `Sitemap:` URLs | Only as crawl-class (§8 Q4) |
| **SAP SuccessFactors, Oracle Cloud HCM / Taleo, iCIMS, Phenom, Eightfold, Avature, TalentBrew** | No licensed public read API | Global vendors. In this study: Wipro (SuccessFactors), JPMorgan Chase and Oracle (Oracle Cloud), Societe Generale (Taleo), Atlassian, Booking.com and GitHub (iCIMS), Adobe and Cisco (Phenom), Netflix (Eightfold), Lenovo (Avature), Ford (TalentBrew) | `netflix.eightfold.ai/robots.txt` disallows `/` except `/careers`, `/api/apply` and `/api/pcsx`. A robots allowance is not a licence | Crawl-class at best (§8 Q4) |
| **Regional applicant-tracking systems seen in this study**: TurboHire (Flipkart), RippleHire (CitiusTech), TalentRecruit (KPMG India) | No public read API found | Seen only on Indian employers' sites in this study. Whether they serve other regions is **unverified** | Static HTML markers on each company's own careers page | No |
| **Wikidata** (`query.wikidata.org/sparql`) | Free, CC0 (https://www.wikidata.org/wiki/Wikidata:Licensing; not re-fetched), no key | Global, depth uneven by country (§6) | Live counts in §6 | Yes, for the company list only. It has no jobs |
| **LinkedIn, Indeed and other job portals** | Not called | Global | D-175 allows portals only for discovery and forbids personal-LinkedIn automation without the owner's grounded approval | Discovery only, never a source of listed jobs |

## 3. Employer coverage

### 3.1 Global employers (50 probed, live 2026-10-28)

Board names and apply-link hosts were checked, so a token collision is never counted.

**Official API, with evidence on the company's own domain from the apply-link host (10 boards, 2,820 postings):**

| Employer | Board | Count | Apply-link host |
|---|---|---|---|
| Airbnb | Greenhouse | 197 | `careers.airbnb.com` |
| Databricks | Greenhouse | 893 | `databricks.com` |
| Dropbox | Greenhouse | 19 | `jobs.dropbox.com` |
| Datadog | Greenhouse | 393 | `careers.datadoghq.com` |
| Instacart | Greenhouse | 94 | `instacart.careers` |
| Brex | Greenhouse | 262 | `www.brex.com` |
| Duolingo | Greenhouse | 59 | `careers.duolingo.com` |
| Asana | Greenhouse | 113 | `www.asana.com` |
| Elastic | Greenhouse | 406 | `jobs.elastic.co` |
| Okta | Greenhouse | 384 | `www.okta.com` |

**Official API, evidence pending (14 boards, 3,307 postings).** The board name matches the company, but the links stay on the provider, so an admin must record the company's own-domain link:

| Employer | Board | Count | Note |
|---|---|---|---|
| Figma | Greenhouse | 140 | |
| Anthropic | Greenhouse | 679 | |
| Reddit | Greenhouse | 162 | |
| Robinhood | Greenhouse | 160 | |
| Cloudflare | Greenhouse | 459 | |
| Twilio | Greenhouse | 134 | |
| DoorDash | Greenhouse `doordashusa` | 440 | The board name is "DoorDash USA" |
| GitLab | Greenhouse | 238 | |
| Airtable | Greenhouse | 4 | |
| Zscaler | Greenhouse | 354 | |
| Lyft | Greenhouse | 179 | Apply links go to `app.careerpuck.com` |
| Notion | Ashby | 140 | |
| Plaid | Ashby | 129 | |
| Spotify | Lever | 89 | |

**Token collision (excluded):** Greenhouse `wise` is "Wise Worksite Field Sales" (US field-sales roles), not Wise plc.

**No free licensed API found (26).** The system seen and the result:

| Employer | System or result |
|---|---|
| Google | Own site |
| Microsoft | Own site; Eightfold per the packet |
| Amazon | Own site |
| Apple | Own site |
| Meta | 429 to scripts. `www.metacareers.com/robots.txt` says collection "through automated means is prohibited unless you have express written permission" |
| Netflix | Eightfold |
| NVIDIA | Own site |
| Salesforce | Own site |
| Adobe | Phenom |
| Oracle | Oracle Cloud |
| JPMorgan Chase | Oracle Cloud |
| Cisco | Phenom |
| Intel | Workday `intel.wd1` (crawl-class) |
| Palo Alto Networks | Workday `paloaltonetworks.wd5` (crawl-class) |
| Atlassian | iCIMS marker |
| Booking.com | iCIMS |
| GitHub | iCIMS |
| Uber | 406 |
| Canva | 403 |
| Revolut | 403 |
| Goldman Sachs, Deloitte, McKinsey, Zoom, Shopify | No board identified (**unverified**: these pages render client-side) |

### 3.2 The SkipWait directory: one row per company (39 rows, live 2026-10-28)

**Verdicts:**
- **official API**: a free, documented, no-key endpoint returned postings.
- **official API, evidence pending**: the endpoint works, but no link on the company's own domain was found by script, so an admin must record one (D-193 §4.1).
- **crawl-class**: the company's own system has no licensed public read API (§8 Q4).
- **not feasible today**: scripted access was refused (403), the site was unreachable, or no source was identified.

**What was probed.** Every row was tried on all four endpoints, using the slug and its obvious variants:
- Greenhouse: `boards-api.greenhouse.io/v1/boards/{t}/jobs`
- Ashby: `api.ashbyhq.com/posting-api/job-board/{t}`
- Lever: `api.lever.co/v0/postings/{t}?mode=json`
- Lever EU: `api.eu.lever.co/...`

A dash means all four returned 404, `[]` or an error.

| Company | Provider seen | Board token | Live GET | Evidence on the company's own domain | Verdict |
|---|---|---|---|---|---|
| SkipWait (`skipwait`) | none | - | none | Internal row, not an employer listing | n/a |
| Wipro | SAP SuccessFactors | - | none | `https://careers.wipro.com/` (200) loads assets from `successfactors.com` | crawl-class |
| Neutrinos (`go-neutrinos`) | not identified | - | none | `https://www.goneutrinos.com/careers` timed out; `https://www.neutrinos.co/careers` failed TLS (certificate name mismatch) | not feasible today (unverified) |
| TCS | not identified | - (Greenhouse `tcs` is **Thornbury Community Services**, 89 postings, not TCS) | none for TCS | `https://www.tcs.com/careers` returns 403 to scripts | not feasible today |
| Merkle | SmartRecruiters (packet appendix, Oct 24, not re-called) | - | n/a | `https://www.merkle.com/en/careers.html` (200), no board marker in static HTML | blocked by robots (§8 Q3) |
| Pinterest | Greenhouse | `pinterest` | 200 · 161 | All 161 apply links are on `www.pinterestcareers.com`; that site returns 403 to scripts | official API |
| KPMG | Oracle Cloud / TalentRecruit (India site) | - | none | `https://kpmg.com/in/en/careers.html` references `oraclecloud` and `kpmgindia.talentrecruit.com` | not feasible today (no public API found; unverified) |
| Accenture | Workday | - | none | `https://www.accenture.com/in-en/careers` links `accenture.wd103.myworkdayjobs.com/AccentureCareers`; robots allows that path and lists sitemaps | crawl-class |
| Capgemini | not identified | - | none | `https://www.capgemini.com/careers/` (200), no marker in static HTML | not feasible today (unverified) |
| Infosys | not identified | - | none | `https://www.infosys.com/careers/` returns 403 | not feasible today |
| Cognizant | not identified | - | none | `https://careers.cognizant.com/` returns 403 | not feasible today |
| Kraken | Ashby | `kraken.com` (the plain `kraken` token tried in the packet is wrong) | 200 · 88 | `https://www.kraken.com/careers` links `jobs.ashbyhq.com/kraken.com` | official API |
| MongoDB | Greenhouse | `mongodb` | 200 · 365 | All apply links are on `www.mongodb.com` | official API |
| Korn Ferry | not identified | - | none | `https://www.kornferry.com/careers` (200), no marker | not feasible today (unverified) |
| Snowflake | Ashby (Phenom-fronted site) | `snowflake` | 200 · 360 | `https://careers.snowflake.com/us/en/search-results` links `ashbyhq.com/snowflake` 10 times | official API |
| BlackRock | not identified | - | none | `https://careers.blackrock.com/` (200), no marker | not feasible today (unverified) |
| HashiCorp | not identified | - | none | `https://www.hashicorp.com/en/careers` returned 429. HashiCorp is reported to have been acquired by IBM, so hiring may sit under IBM (**unverified** today) | not feasible today (unverified) |
| Discord | Greenhouse | `discord` | 200 · 46 | `https://discord.com/careers` calls `greenhouse.io/v1/boards/` | official API |
| 1Password | Ashby | `1password` | 200 · 89 | `https://1password.com/careers` links `jobs.ashbyhq.com/1password` | official API |
| Varonis | not identified | - | none | `https://careers.varonis.com/` (200), no marker | not feasible today (unverified) |
| Lenovo | Avature | - | none | `https://jobs.lenovo.com/en_US/careers` is Avature-hosted | crawl-class |
| Upstart | Greenhouse | `upstart` | 200 · 88 | All apply links are on `careers.upstart.com` | official API |
| OpenAI | Ashby | `openai` | 200 · 808 | `https://openai.com/careers/` returns 403 to scripts; apply links are on `jobs.ashbyhq.com` | official API, evidence pending |
| Coinbase | Greenhouse | `coinbase` | 200 · 227 | All apply links are on `www.coinbase.com` | official API |
| SoFi | Greenhouse | `sofi` | 200 · 62 | All apply links are on `sofi.com` | official API |
| Gemini | Greenhouse (board name "Gemini") | `gemini` | 200 · 30 | Apply links use the `boards.greenhouse.io/embed` form; no board link found in the static `www.gemini.com/careers` HTML | official API, evidence pending |
| Stripe | Greenhouse | `stripe` | 200 · 717 | All apply links are on `stripe.com` | official API |
| Capco | Greenhouse (board name "Capco") | `capco` | 200 · 698 | Apply links are on `job-boards.greenhouse.io`; no marker in the static `www.capco.com/careers` HTML | official API, evidence pending |
| Blackstone | not identified | - | none | `https://www.blackstone.com/careers/` returns 403 | not feasible today |
| CitiusTech | RippleHire | - | none | `https://www.citiustech.com/careers` links `citiustech.ripplehire.com` | not feasible today (no public API found; unverified) |
| IBM | own site (`careers.ibm.com`) | - | none | `https://www.ibm.com/careers` links `careers.ibm.com` | not feasible today (no public API found; unverified) |
| BNP Paribas | not identified | - | none | `https://group.bnpparibas/en/careers` returns 403 | not feasible today |
| ServiceNow | not identified | - | none | `https://careers.servicenow.com/` returns 403 | not feasible today |
| IQVIA | Workday | - | none | `https://jobs.iqvia.com/en` links `iqvia.wd1.myworkdayjobs.com` | crawl-class |
| Maersk | own API (undocumented) | - | none | `https://www.maersk.com/careers/vacancies` calls `api.maersk.com/careers` | not feasible today (undocumented; unverified) |
| Ford | TalentBrew | - | none | `https://www.careers.ford.com/en` loads assets from `tbcdn.talentbrew.com` | crawl-class (unverified) |
| Concentrix | Workday | - | none | `https://jobs.concentrix.com/` links job pages on `cnx.wd1.myworkdayjobs.com/External_Global` | crawl-class |
| Societe Generale | Taleo | - | none | `https://careers.societegenerale.com/en` references `taleo.net` | crawl-class |
| Nintendo | Greenhouse | `nintendo` | 200 · 63 | All apply links are on `careers.nintendo.com` | official API |

**Totals across the 38 real employers:**
- **Official API: 14 companies, 3,802 postings.** 11 have own-domain evidence; 3 (OpenAI, Gemini, Capco) need an admin to record it.
- **Crawl-class: 8.** Wipro, Accenture, Lenovo, IQVIA, Ford, Concentrix and Societe Generale, plus Merkle behind its robots block.
- **Not feasible or not identified today: 16.**

**Changes since the packet's Oct 24 appendix:**
- Kraken does have a board, on Ashby as `kraken.com`.
- Counts moved within normal churn: Stripe 721 → 717, OpenAI 796 → 808, Capco 728 → 698.

### 3.3 Regional employers: India (one region of several)

India is covered by name because §5.10 lists eleven Indian employers. It is one region among several. Comparable regional lists for other regions (for example Brazil, Nigeria, the Gulf states or Southeast Asia) were **not** probed in this study. That is the main gap to close next (§9).

| Employer | What answered | Count | Evidence | Verdict |
|---|---|---|---|---|
| TCS | `https://www.tcs.com/careers` returns 403. Greenhouse `tcs` belongs to another company | - | Board name from `boards-api.greenhouse.io/v1/boards/tcs` | not feasible today |
| Infosys | `https://www.infosys.com/careers/` returns 403 | - | - | not feasible today |
| Wipro | SuccessFactors site at `careers.wipro.com`. Its `robots.txt` disallows only the apply, talent-community and service paths | - | §3.2 | crawl-class |
| HCLTech | `https://www.hcltech.com/careers`: HTTP/2 stream error twice; no board on any of the four APIs | - | - | not feasible today (unverified) |
| Accenture | Workday `accenture.wd103`; robots allows the job path and lists sitemaps | - | §3.2 | crawl-class |
| Cognizant | `https://careers.cognizant.com/` returns 403 | - | - | not feasible today |
| Flipkart | `https://www.flipkartcareers.com/` (200) runs on TurboHire. Its `robots.txt` returned 301 today. The packet's Oct 24 appendix says it allows only Googlebot (**unverified** today) | - | Static HTML marker `turbohire` | not feasible today |
| Swiggy | `https://careers.swiggy.in/` is an 865-byte JavaScript shell. The packet's Oct 24 figure is 201 postings on SmartRecruiters, which robots blocks; not re-called | (201 on Oct 24) | Packet appendix | blocked by robots (§8 Q3) |
| Zomato (Eternal Ltd) | `https://www.zomato.com/careers`: HTTP/2 stream error. Lever `eternal` is a different company (4 New York and San Francisco roles) | - | Lever postings' locations | not feasible today |
| PhonePe | `https://www.phonepe.com/careers/` (200), no board marker; no board on any of the four APIs | - | - | not feasible today (unverified) |
| Paytm | Lever `paytm` | 198 | `https://paytm.com/careers/` links `jobs.lever.co/paytm`. Postings in Noida 95, Mumbai 25, Bangalore 17 | **official API** |

Other Indian employers with official boards:

| Employer | Board | Count | Own-domain evidence |
|---|---|---|---|
| Razorpay | Greenhouse `razorpaysoftwareprivatelimited` | 24 | `razorpay.com/careers` links the board |
| Meesho | Lever | 52 | Pending: `meesho.io/jobs` returns 403 |
| CRED | Lever | 10 | `careers.cred.club/openings` links `lever.co/cred` |

**The regional pattern:** the region's largest employers are IT-services firms. They either refuse scripts or use enterprise systems. The startup tier is reachable. This is the same split as globally (§3.1), only sharper.

## 4. What this means for global employers

- **Employers on Greenhouse, Ashby or Lever, in any country,** can be listed from day one once an admin records their own-domain evidence. The employer has nothing to do.
- **Employers on Workday, SuccessFactors, Oracle, iCIMS, Phenom, Eightfold, Avature or their own systems** cannot be listed from a free, licensed source today. This is most of the Fortune Global 500 tier, in every region probed. Their honest state is D-193's "We can't list {Company}'s jobs yet. Paste a job link to request a referral." A pasted link works for every company today (packet §3.5), so this limits browsing, not referrals.
- **Recommendation (CEO decision, not taken here):** offer such employers a free, self-serve way to point SkipWait at a feed they publish. Examples are a Greenhouse, Ashby or Lever board, or an XML job feed they already provide to search engines. This is consent-based, free, and works in every country. **Rating: 7/10.** Against: it needs employer outreach, which D-087 allows only with a per-item yes, and adoption by large employers is uncertain. Nothing here was verified live; it is a proposal.

## 5. What this means for global job seekers and employees

**Where the reachable jobs are.**

I fetched every confirmed board: 32 Greenhouse, 6 Ashby and 5 Lever, for 43 boards and **10,512 postings**, at about 17:42 UTC. I grouped each posting's location text by region using a keyword match. This is a heuristic: a multi-location posting can count in more than one region, abbreviations such as "CA" are ambiguous, and 703 postings (6.7 %) were unclassifiable, mostly "Hybrid" or "In-Office" with no place.

| Region (heuristic) | Postings | Share |
|---|---|---|
| United States | 5,554 | 52.8 % |
| Continental Europe | 963 | 9.2 % |
| United Kingdom and Ireland | 908 | 8.6 % |
| India | 861 | 8.2 % |
| Asia-Pacific excluding India | 777 | 7.4 % |
| Canada | 651 | 6.2 % |
| Latin America | 356 | 3.4 % |
| Remote, region not stated | 96 | 0.9 % |
| Middle East and Africa | 90 | 0.9 % |

**What this means for seekers worldwide.**

- **The free official sources serve seekers in North America and Europe far better than everyone else.** A seeker in Africa, the Middle East or Latin America would see few listable jobs near them. Any claim that SkipWait lists "jobs worldwide" would be false on today's sources. D-175's "never call an incomplete list complete" applies per region as well as per company.
- **Languages vary.** Some postings are not in English. For example, the first Databricks posting returned was in Japanese ("デリバリーソリューションアーキテクト", Delivery Solutions Architect). Any keyword search and the D-110 level classifier must handle non-English titles, or say they cannot. That the classifier handles them is **unverified**; it was not tested here.
- **"Remote" is rarely stated as global.** Only 96 postings said "Remote", "Anywhere" or "Global" without naming a region. Most remote roles are country-bound, so a seeker filter should treat "Remote" as "remote within {country}" unless the posting says otherwise.

**On the employee (referrer) side.** Referrers verify by work email (D-030), which works for any employer domain in any country. Coverage of referrers is therefore not limited by job sources. Its practical global limit is which employers are in the directory with a domain, which is what the §6 seed addresses.

## 6. Proposal to the CEO: a Wikidata seed for the company directory (D-123)

This is a **proposal, not a decision.**

**What Wikidata is.** It is CC0 (https://www.wikidata.org/wiki/Wikidata:Licensing; not re-fetched today). Its SPARQL endpoint `https://query.wikidata.org/sparql` is free, needs no key, and asks callers to send a descriptive user agent.

**Global counts (live 2026-10-28, 17:33 UTC).** Every filter below requires an official website (P856):

| Filter | Items |
|---|---|
| (A) listed on a stock exchange (P414) | 13,935 |
| (C) 1,000 or more employees (P1128) | 8,706 |
| **(E) = (A) or (C)** | **21,063** |
| (E) with no country (P17) | 1,526 |

**Filter (E) by country (live 2026-10-28, 17:36–17:40 UTC).** These counts show the regional limits of this source:

| Country | Items | Country | Items |
|---|---|---|---|
| United States | 4,006 | Netherlands | 187 |
| Japan | 2,235 | Singapore | 58 |
| Germany | 1,264 | Mexico | 82 |
| China | 1,002 | South Africa | 48 |
| Canada | 756 | United Arab Emirates | 23 |
| United Kingdom | 734 | Nigeria | 20 |
| Indonesia | 675 | Sweden | 389 |
| South Korea | 617 | Brazil | 345 |
| Australia | 448 | Spain | 255 |
| France | 443 | India | 239 |

**Proposed fields:**
- `name` from the English label (`rdfs:label`).
- `domain`: the registrable domain of P856, with the path and `www.` stripped. Stripping matters: MongoDB's P856 is `https://www.mongodb.com/products/platform`.
- `aliases` from English `skos:altLabel`. For example, Accenture has 3, Wipro 3, Zomato 4.
- `country` from P17, kept for regional reporting only and never shown as an availability status (D-176).
- The Wikidata QID, kept as provenance.

**Proposed dedupe rule:**
1. **Match by domain, never by name.** Live label lookups show why:
   - "Stripe" matches 12 items, and only Q7624104 has `stripe.com`.
   - "Eternal" matches more than 30 items, none of them Zomato's parent.
   - "Merkle" matches 3 items, none with a website.
   - "Neutrinos" (Q18614848) is an xkcd strip.
   - HCLTech and Cognizant exist only under other labels: "HCL Technologies" (Q5629103) and "Cognizant Technology Solutions" (Q1107035).
2. **When a domain is already in `companyDomains`,** keep the existing row and add only the aliases it lacks.
3. **When two QIDs share a domain,** hold both for admin review rather than merging. This follows AGENTS.md: never merge on ambiguity.
4. **Seeded rows enter unlisted or behind an admin list action.** No seeded row gets a job source until an admin records the own-domain `evidenceUrl` (D-193 §4.1).

**Evidence for and against.**

For:
- It is free and legal.
- It is global in scope, and lifts the 39-company ceiling on company search (D-193 (1)).
- Domains let verified work-email matching work for about 21,000 employers worldwide.

Against, strongest first:
1. **Depth is uneven by region.** Large job-seeker markets are thin: India 239, Mexico 82, Singapore 58, South Africa 48, UAE 23, Nigeria 20, compared with Japan 2,235. Seeding (E) alone would make the directory North America-, Europe- and East Asia-heavy.
2. **Data quality varies.** P856 can be a product page, and entity collisions are common, so a name-based seed would create wrong companies.
3. **More companies shown means more "can't list jobs yet" states** (§3.2: 16 of 38 not feasible today). That is honest, but it may read as an empty product in regions where coverage is thin.

**My rating: 7/10** for seeding (E) by domain, behind an admin list action. It is not higher because of against-point 1. The next research step is a free regional supplement for thin countries, such as stock exchanges' public listed-company files and government company registries. Which of these are free and openly licensed varies by country and is **unverified** here.

## 7. Recommendations (global-first; for the CEO to decide, nothing adopted here)

1. **Keep Greenhouse, Ashby and Lever as the only launch sources, worldwide** (D-193 already decides this). **Add Lever's EU host,** because EU-hosted Lever companies are not visible on the global host. The packet's §5.7 already names `api.eu.lever.co`.
2. **Add a board-identity guard next to `evidenceUrl`.** Greenhouse returns each board's display name (for example "Thornbury Community Services" for `tcs`). Show it to the admin, and warn when it does not match the company. **Rating: 8/10:** it prevents §1.4 at no running cost. Against: legitimate names differ ("DoorDash USA", "RAMP"), so it can only warn, never block.
3. **Per-region honesty in the product copy.** Never say or imply "jobs worldwide". Where a seeker's country has few or no listable jobs, say so and offer the pasted-link path. **Rating: 9/10.** It is required by D-175 and D-153 and costs only copy. It is above 7 because the §5 table shows how lopsided coverage is, so a global claim would be false for most of the world.
4. **Wikidata seed (E) by domain,** behind an admin list action, with regional supplements researched next (§6). **Rating: 7/10.**
5. **An employer self-serve feed link** (§4). **Rating: 7/10.**
6. **Crawl-class sources:** see §8 Q4.

## 8. Owner questions (D-193 §7), with the evidence gathered

The D-193 §7 defaults hold until the owner answers. This study adds evidence and changes no default.

**Q1. Charge at pickup and show waiting requests to everyone who verifies (rated 8/10 by the CEO).**
This is a money-rule question (D-034, D-047, D-132). No free external source settles it. What would settle it is production data: how many waiting requests sit at companies with zero or one available verified employee, and for how long. That data was not queried, because it is outside this row (**unverified**). Region matters here too. §5 suggests employer and referrer coverage will be thinnest outside North America and Europe, so waiting requests are likely to cluster in those regions (**unverified** inference).

**Q2. Free credits refunded after their month ends come back as 0 (rated 6/10 to change).**
No external evidence bears on this. It depends on how often withdrawals cross a month boundary, which is production data that was not read (**unverified**).

**Q3. SmartRecruiters (rated 5/10 to use).**
- Live: `api.smartrecruiters.com/robots.txt` reads `User-agent: LinkedInBot / Allow: /v1/companies/ / User-agent: * / Disallow: /`.
- Its customers are global, not regional: Bosch (5,087 postings on Oct 24), Freshworks, Swiggy and Merkle.
- Recommendation: keep the default (not used). The clean route to any one company is that company's written permission, which costs nothing, not overriding robots.

**Q4. Crawl-class sources (rated 4/10 at launch).** The new evidence splits this question in two.

- **Workday tenants whose robots allow job paths and publish sitemaps.**
  - Live: `accenture.wd103.myworkdayjobs.com/robots.txt` reads `User-agent: * / Allow: /AccentureCareers/` and lists `Sitemap:` URLs.
  - Workday is used worldwide: Accenture, IQVIA, Concentrix, Intel and Palo Alto Networks in this study. Each tenant's robots file was not checked individually (**unverified**).
  - Reading only the sitemap a site publishes is the most defensible crawl option. It yields job URLs and freshness, but titles would need one polite page fetch per job.
  - **My rating: 5/10.** Against: robots permission is not a licence, tenant paths change without notice, and per-page fetching at scale is what D-175 calls risky bulk scraping.
- **SuccessFactors (Wipro).** Robots disallows only the apply, talent-community and service paths. Same assessment: **4/10.**
- **Sites that refuse scripts or prohibit automated collection.** TCS, Infosys, Cognizant, Blackstone, BNP Paribas, ServiceNow, Canva and Revolut return 403; Uber returns 406. Meta's robots notice prohibits automated collection. **Do not pursue (1/10):** it breaches D-175 and the sites' own terms.

## 9. Limits of this study

- **Snapshots only.** Counts are single-minute snapshots. They were not reconciled against each careers site's own total, which the D-175 goal ("equal to their career portal") would need. No free source gives that total for crawl-class companies.
- **Regional employer lists.** Only India was probed by name as a region, because §5.10 lists it. Equivalent lists for Latin America, the Middle East, Africa and Southeast Asia are not covered yet; that is the next research gap.
- **Location shares.** The §5 regional shares come from a keyword heuristic over 43 boards that skew toward technology employers. They describe the reachable free sources, not the world's job market.
- **Missing markers.** "No marker in static HTML" often means the page renders client-side. Those providers are **unverified**, not absent.
- **EU hosts.** The Greenhouse and Ashby EU host checks failed at this environment's proxy (502). Whether those hosts exist is **unverified**.
- **Provider documentation** was cited as the packet cites it and not re-fetched today. All endpoint behaviour stated above comes from the live calls.
