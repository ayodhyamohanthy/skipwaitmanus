# D-175 coverage study: where each directory company's live jobs can come from

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Research only, for queue row `D-175-coverage-study` (packet [`docs/plans/D-193-journey-foundations.md`](../plans/D-193-journey-foundations.md) §5.10). No code, no paid source, no login, no LinkedIn, no account-based access (D-175). Written by Claude Opus 5.5 · 7598 on Nov 1 2026. It decides nothing: the CEO decides the Wikidata seed (D-123), and the owner answers the §7 questions.

Every fact below carries its UTC time. All requests were made on **2026-11-01** between 06:56Z and 07:19Z, one at a time, as anonymous HTTPS GETs with the User-Agent `SkipWait-D175-coverage-study/1.0 (+https://skipwait.me; one-off research)`. Before fetching any HTML page, the study read that host's `robots.txt` and fetched only what it allowed. A `robots.txt` that answered 403 was treated as "do not fetch". Job counts change daily, so each count is a snapshot of that minute and not a promise.

## 1. Results in one view
- **Directory:** 39 companies. The repo seeds (`shared/companyDirectorySeed.ts` with 5 companies and `shared/companyDirectoryExpansionSeed.ts` with 34) list the same 39 slugs that the live directory returned (`GET https://skipwait.me/api/companies`, one anonymous read, 06:56Z).
- **Official API, with ownership evidence:** 14 of 39 directory companies, 3,879 live jobs at 06:57–06:58Z. Greenhouse covers 10 companies (2,529 jobs), Ashby 4 (1,350 jobs) and Lever none.
- **Crawl-class:** 7 of 39. Their own careers site names the system behind it (Workday, Avature, Taleo, SuccessFactors or a Radancy front end), and robots.txt allows the pages, but there is no licensed public read API.
- **Not feasible today:** 18 of 39. In 7 of them the site refuses scripts (a robots.txt or page that answers 403, a 429, or a refused connection), or a robots rule bars generic bots. In 10 no source shows in the page HTML, and 1 (SkipWait) has no jobs page. Section 3 says which is which.
- **Indian employers seekers ask for most (11):** Paytm alone has an official API (Lever, 201 jobs), and Paytm is not in the directory. Accenture and Wipro are crawl-class. The other 8 are not feasible today.
- **Two token collisions:** the Greenhouse board `tcs` is *Thornbury Community Services* (95 UK clinical jobs), not Tata Consultancy Services. The Lever site `eternal` is a US employer hiring a "Performance Team" for athletes (4 postings), not Eternal Limited (Zomato). A board whose token matches a company's name is **never** proof that the board belongs to that company (section 7.1).
- **Wikidata (CC0) seeding:** each candidate rule seeds a different number of companies: 4,120 with at least 1,000 employees, 13,628 listed on a stock exchange, and about 14,500 clean rows for the two combined after domain dedupe. The 41 companies this study could look up show that an employee-count rule drops Wipro, HCLTech, Flipkart, Swiggy, PhonePe and Paytm. Domains taken from Wikidata must never be used for work-email verification until an admin checks them: anyone can edit Wikidata (section 5).

## 2. Method and evidence rules
**Sources tried for every company** (documented, free, no key):
- Greenhouse: `boards-api.greenhouse.io/v1/boards/{token}/jobs`; an unknown token answers 404.
- Lever: `api.lever.co/v0/postings/{site}?mode=json`; an unknown site answers 404.
- Ashby: `api.ashbyhq.com/posting-api/job-board/{name}`; an unknown name answers 404.

Each was tried with the slug, the slug without hyphens and the name squeezed into one word, plus a few obvious variants (`kraken.com`, `bnpparibas`, `kornferry`, `eternal`). A 404 means only that the token is unknown. It is never proof that a company has no jobs (§3.11 of the packet).

**What counts as proof that a board belongs to the company**, strongest first:
1. The company's own careers page links to or configures the board (for example `kraken.com/careers` → `jobs.ashbyhq.com/kraken.com`, or `coinbase.com/careers` carrying `COINBASE_PUBLIC_GREENHOUSE_BOARD_ID: "coinbase"`).
2. A posting URL that the board itself publishes resolves on the company's own domain (for example a Stripe posting resolves to `stripe.com/careers/listing/...`, 200).
3. The board's own content names the company in almost every posting. This is accepted only together with a matching board name (Greenhouse) or board token (Ashby, whose API returns no board name). It is weaker than 1 and 2, and the table says when it is the only proof.

**Verdicts:**
- **Official API:** a documented public read API, with ownership shown by rule 1, 2 or 3.
- **Crawl-class:** the company's careers site names the system behind it and robots.txt allows the job pages, but no licensed public read API exists. These sources need the owner's §7 Q4 decision.
- **Not feasible today:** blocked (403, 429, a refused connection, or a robots rule against generic bots), or no source identifiable from the page HTML. Many careers pages build their job lists in the browser, so "no source found" can change after a manual check or a word from the company.

The study scripts are not committed (this row owns only this file). Anyone can repeat it from the URLs above and in the tables.

## 3. Directory companies (39)
Times are UTC on 2026-11-01. "Boards 404" means Greenhouse, Lever and Ashby all answered 404 for every token tried (06:57–06:58Z).

| # | Company (directory domain) | Source · token | Evidence on the company's own domain | Live GET | Verdict |
|---|---|---|---|---|---|
| 1 | skipwait.me (`skipwait.me`) | none | `skipwait.me/careers` → 404 (06:59Z); boards 404 | — | Not feasible: no public jobs source. This is SkipWait itself; the owner lists any roles |
| 2 | Wipro (`wipro.com`) | SAP SuccessFactors | `careers.wipro.com` (200, 06:59Z) loads `career55.sapsf.eu` and `hcm55.sapsf.eu`. Its robots.txt allows generic bots, but `career55.sapsf.eu/robots.txt` is `Disallow: /` for `*` (07:06Z); boards 404 | — | Crawl-class (the front end on wipro.com only) |
| 3 | Neutrinos (`neutrinos.com`) | Keka | `neutrinos.com/careers/` (200, 06:59Z) links `neutrinos.keka.com/careers`; that host's robots.txt disallows generic bots at `/` (07:06Z) | — | Not feasible (blocked) |
| 4 | TCS (`tcs.com`) | none verified | `tcs.com/robots.txt` → 403, page not fetched (06:59Z). The Greenhouse board `tcs` (95 jobs, 06:57Z) is named **Thornbury Community Services**: UK clinical roles in Leeds, Exeter and Bath. It is not TCS | — | Not feasible (blocked); token collision |
| 5 | Merkle (`merkle.com`) | not identified | `merkle.com/en/careers.html` (200, 06:59Z) has no system link in its HTML; boards 404. The Oct 24 appendix named SmartRecruiters; not re-confirmed | — | Not feasible today (no source in HTML; SmartRecruiters stays unused, §6 Q3) |
| 6 | Pinterest (`pinterest.com`) | Greenhouse · `pinterest` | Board named "Pinterest". A board posting resolves on `www.pinterestcareers.com/jobs/<id>/…` (200, 07:05Z) | 170 (06:57Z) | Official API |
| 7 | KPMG (`kpmg.com`) | not identified | `kpmg.com/xx/en/careers.html` (200, 07:00Z) is a global hub over separate member-firm sites; no system link; boards 404 | — | Not feasible as one source (each member firm would be its own study) |
| 8 | Accenture (`accenture.com`) | Workday · `accenture.wd103.myworkdayjobs.com/AccentureCareers` | Linked from `accenture.com/us-en/careers` (200, 07:00Z). The Workday host's robots.txt lists sitemaps and has no Disallow (07:06Z). Its first sitemap file lists 100 job URLs (07:07Z; that is one file, not a total). A job page carries `JobPosting` structured data (07:14Z) | — | Crawl-class |
| 9 | Capgemini (`capgemini.com`) | not identified | `capgemini.com/careers/` (200, 07:00Z) runs its own job search; no system link; boards 404 | — | Not feasible today (no source in HTML) |
| 10 | Infosys (`infosys.com`) | none | `infosys.com/robots.txt` → 403, not fetched (07:00Z); boards 404 | — | Not feasible (blocked) |
| 11 | Cognizant (`cognizant.com`) | not identified | `careers.cognizant.com/global-en/` (200, 07:00Z; the Oct 24 appendix recorded 403); no system link; boards 404 | — | Not feasible today (no source in HTML) |
| 12 | Kraken (`kraken.com`) | Ashby · `kraken.com` | `kraken.com/careers` (200, 07:00Z) links `jobs.ashbyhq.com/kraken.com`; all 87 postings name Kraken (07:08Z) | 87 (06:57Z) | Official API |
| 13 | MongoDB (`mongodb.com`) | Greenhouse · `mongodb` | A posting resolves on `mongodb.com/careers/jobs/<id>` (200, 07:05Z) | 366 (06:57Z) | Official API |
| 14 | Korn Ferry (`kornferry.com`) | not identified | `kornferry.com/careers` (200, 07:00Z); no system link; boards 404 | — | Not feasible today (no source in HTML) |
| 15 | Snowflake (`snowflake.com`) | Ashby · `snowflake` | All 366 postings name Snowflake (07:08Z). `careers.snowflake.com` is a Phenom site whose HTML does not link the Ashby board (07:00Z) | 366 (06:57Z) | Official API (ownership from board content only; confirm it is the full list before calling it complete) |
| 16 | BlackRock (`blackrock.com`) | not identified (Radancy front end) | `careers.blackrock.com` (200, 07:00Z) carries Radancy search metadata and a Beamery talent-community link; robots.txt allows the pages and lists no sitemap; boards 404 | — | Crawl-class (front end only) |
| 17 | HashiCorp (`hashicorp.com`) | none | `hashicorp.com/careers` answered 429 to the single request (07:00Z); boards 404 (Greenhouse also 404 on Oct 24) | — | Not feasible today (blocked) |
| 18 | Discord (`discord.com`) | Greenhouse · `discord` | `discord.com/careers` (200, 07:00Z) runs code that fetches `api.greenhouse.io/v1/boards/${board}/jobs` for its boards; all 41 postings name Discord (07:08Z) | 41 (06:57Z) | Official API |
| 19 | 1Password (`1password.com`) | Ashby · `1password` | `1password.com/careers` (200, 07:00Z) links `jobs.ashbyhq.com/1password` | 87 (06:57Z) | Official API |
| 20 | Varonis (`varonis.com`) | not identified | `careers.varonis.com` (200, 07:00Z); no system link; boards 404 | — | Not feasible today (no source in HTML) |
| 21 | Lenovo (`lenovo.com`) | Avature · `lenovo.avature.net` | `jobs.lenovo.com` (200, 07:00Z) is an Avature site. Its robots.txt allows `/careers` and lists 7 sitemaps; the sitemap index lists 8 locale sitemaps (07:07Z) | — | Crawl-class |
| 22 | Upstart (`upstart.com`) | Greenhouse · `upstart` | Board postings live on `careers.upstart.com`, Upstart's own subdomain; that page answered 202 with a bot challenge to the script (07:05Z) | 88 (06:58Z) | Official API |
| 23 | OpenAI (`openai.com`) | Ashby · `openai` | All 810 postings name OpenAI (07:08Z). `openai.com/careers/` answered 403 to the script (07:00Z), so the link from the company's own site could not be checked | 810 (06:58Z) | Official API (ownership from board content) |
| 24 | Coinbase (`coinbase.com`) | Greenhouse · `coinbase` | `coinbase.com/careers` (200, 07:00Z) configures `COINBASE_PUBLIC_GREENHOUSE_BOARD_ID: "coinbase"`; a posting resolves on `coinbase.com/careers/positions/<id>` (200, 07:05Z) | 254 (06:58Z) | Official API |
| 25 | SoFi (`sofi.com`) | Greenhouse · `sofi` | A posting resolves on `sofi.com/careers/job/…` (200, 07:05Z) | 62 (06:58Z) | Official API |
| 26 | Gemini (`gemini.com`) | Greenhouse · `gemini` | All 28 postings name Gemini or crypto trading (07:08Z); the `gemini.com/careers` HTML does not link the board (07:00Z) | 28 (06:58Z) | Official API (ownership from board content) |
| 27 | Stripe (`stripe.com`) | Greenhouse · `stripe` | A posting resolves on `stripe.com/careers/listing/<slug>/<id>` (200, 07:05Z) | 745 (06:58Z) | Official API |
| 28 | Capco (`capco.com`) | Greenhouse · `capco` | 683 of 703 postings name Capco or capco.com (07:08Z); `capco.com/careers` serves its list from its own `/api/jobs` (07:00Z) | 703 (06:58Z) | Official API (ownership from board content) |
| 29 | Blackstone (`blackstone.com`) | none | `blackstone.com/robots.txt` → 403, not fetched (07:00Z); boards 404 | — | Not feasible (blocked) |
| 30 | CitiusTech (`citiustech.com`) | not identified | `citiustech.com/careers` (200, 07:00Z); no system link; boards 404 | — | Not feasible today (no source in HTML) |
| 31 | IBM (`ibm.com`) | not identified | `ibm.com/careers` (200, 07:00Z); no system link; boards 404 | — | Not feasible today (no source in HTML) |
| 32 | BNP Paribas (`bnpparibas.com`) | none | Its careers site is on `group.bnpparibas`, a different domain from the directory's `bnpparibas.com`. That host's robots.txt → 403, not fetched (07:00Z); boards 404 | — | Not feasible (blocked) |
| 33 | ServiceNow (`servicenow.com`) | not identified | `careers.servicenow.com` (200, 07:00Z); no system link; boards 404 | — | Not feasible today (no source in HTML) |
| 34 | IQVIA (`iqvia.com`) | none | `jobs.iqvia.com` answered 403 to the script (07:00Z); boards 404 | — | Not feasible (blocked) |
| 35 | Maersk (`maersk.com`) | not identified | `maersk.com/careers` (200, 07:00Z); no system link; boards 404 | — | Not feasible today (no source in HTML) |
| 36 | Ford (`ford.com`) | not identified (Radancy front end) | `corporate.ford.com/careers.html` → `www.careers.ford.com/en` (200, 07:00Z; Radancy search metadata); robots.txt allows the pages; boards 404 | — | Crawl-class (front end only) |
| 37 | Concentrix (`concentrix.com`) | Workday · `cnx.wd1.myworkdayjobs.com/external_global` | Linked from `jobs.concentrix.com` (200, 07:01Z). Robots.txt lists sitemaps and has no Disallow (07:06Z); its first sitemap file lists 100 job URLs (07:07Z) | — | Crawl-class |
| 38 | Société Générale (`societegenerale.com`) | Oracle Taleo · `socgen.taleo.net` | Linked from `careers.societegenerale.com` (200, 07:01Z), whose robots.txt lists a sitemap; `socgen.taleo.net/robots.txt` → 404, so it sets no rules (07:06Z) | — | Crawl-class |
| 39 | Nintendo (`nintendo.com`) | Greenhouse · `nintendo` | A posting resolves on `careers.nintendo.com` (200, 07:05Z). The board is **Nintendo of America**: 64 of its 72 jobs are in Redmond, WA | 72 (06:58Z) | Official API, Nintendo of America only. Never present it as all of Nintendo's jobs |

Tally: official API 14 (rows 6, 12, 13, 15, 18, 19, 22–28, 39); crawl-class 7 (rows 2, 8, 16, 21, 36–38); not feasible today 18. Of those 18, 7 are blocked (rows 3, 4, 10, 17, 29, 32, 34), 10 show no source in their HTML (rows 5, 7, 9, 11, 14, 20, 30, 31, 33, 35) and 1 has no jobs page at all (row 1).

**Changes since the Oct 24 appendix:**
- Counts drifted: Stripe went 721 → 745, Capco 728 → 703, MongoDB 383 → 366, Pinterest 160 → 170, OpenAI 796 → 810 and Snowflake 354 → 366. Paytm went 197 → 201.
- Cognizant's careers site now answers 200, where it answered 403 on Oct 24.
- Kraken answers on Ashby under the name `kraken.com`, not `kraken`.
- The appendix's "about 15" official-API companies is 14 once ownership is checked.

## 4. Indian employers seekers ask for most
TCS, Infosys, Wipro, Accenture and Cognizant are directory rows 4, 10, 2, 8 and 11 above. The other six are not in the directory.

| Company | Source · token | Evidence | Live GET (UTC) | Verdict |
|---|---|---|---|---|
| TCS | none verified | see row 4: robots.txt 403; the `tcs` board belongs to another company | — | Not feasible |
| Infosys | none | see row 10: robots.txt 403 | — | Not feasible |
| Wipro | SAP SuccessFactors | see row 2 | — | Crawl-class (front end) |
| HCLTech | none | `hcltech.com` timed out (07:01Z), then refused the connection to both `robots.txt` and `/careers` (07:07Z); boards 404 for `hcltech` and `hcl` | — | Not feasible today (blocked) |
| Accenture | Workday | see row 8 | — | Crawl-class |
| Cognizant | not identified | see row 11 | — | Not feasible today |
| Flipkart | TurboHire | `flipkartcareers.com` (200, 07:02Z) links `turbohire.co/careerpage/`. `careers.turbohire.co/robots.txt` disallows `*` and allows only Googlebot, Bingbot, Slurp and DuckDuckBot (07:06Z); boards 404 | — | Not feasible (blocked) |
| Swiggy | SmartRecruiters | The `careers.swiggy.in` app (200, 07:02Z) loads its assets from `au.smrtr.io`, a SmartRecruiters host (07:09Z). `api.smartrecruiters.com/robots.txt` allows only LinkedInBot under `/v1/companies/` and disallows `*` (07:06Z); boards 404 | — | Not feasible (§6 Q3 default) |
| Zomato (Eternal Limited) | none verified | `zomato.com` timed out (07:02Z) and refused the robots.txt request (07:07Z). `eternal.com/careers/` (200, 07:03Z) has no system link. The Lever site `eternal` (4 postings, 06:58Z) hires a "Performance Team" for athletes in NYC and SF; it is not Eternal Limited | — | Not feasible today; token collision |
| PhonePe | none (own site) | `phonepe.com/careers/job-openings/` (200, 07:09Z) builds its openings on phonepe.com and calls no outside system; boards 404 (the Oct 24 appendix found its Greenhouse board inactive) | — | Not feasible today (no API) |
| Paytm | Lever · `paytm` | `paytm.com/careers/` (200, 07:03Z) links `jobs.lever.co/paytm`; postings describe Paytm | 201 (06:58Z) | Official API (not a directory company) |

**What this means for India:** of the 11 employers seekers ask for most, one has an official API, and it is not in the directory. For India, "Paste a job link to request a referral" stays the main route, and the product must not suggest it lists these companies' jobs (D-175: never call an incomplete list complete).

## 5. Wikidata (CC0) seeding proposal for the company list
The CEO decides it from this section (D-123; free data within D-175). The study could not settle every number: the public query service throttled this network (429, "1 req / min", 07:03–07:12Z), so the counts come from QLever (`qlever.cs.uni-freiburg.de/api/wikidata`), a free mirror of the same CC0 data. One count was repeated on the Wikidata Query Service, and the two agreed (4,120 at 07:12:36Z and 07:13:27Z).

**5.1 Counts for each candidate rule** (a company here is an item whose `instance of` (P31) is one of 12 company classes: business, enterprise, company, public company, privately held company, multinational corporation, conglomerate, subsidiary, software company, technology company, bank and consulting firm. Each item also has an official website (P856) and no dissolution date (P576)):

| Rule | Global | India (P17 = India) | At (UTC) |
|---|---|---|---|
| A. company class + website + at least 1,000 employees (P1128) | 4,120 | 38 | 07:12:36Z / 07:09:59Z |
| B. listed on a stock exchange (P414) + website, any class | 13,628 | 180 | 07:15:43Z / 07:17:32Z |
| C. company class + website, no size filter | 174,098 | 2,362 | 07:13:13Z / 07:10:24Z |

**5.2 What the 45 companies in this study show** (Wikidata entity API, looked up by English Wikipedia title, 07:15:06Z):
- 41 of 45 have an item under the title tried. SkipWait, Neutrinos, Merkle and Upstart did not match the titles used. That is a title problem, not proof the items are missing.
- **38 of the 41 list our directory domain (or a subdomain of it) as their official website.** Domain-based dedupe works. The three that do not: CitiusTech and Eternal Limited have no official website on Wikidata, and BNP Paribas lists `bnpparibas.fr`, `bnpparibas.net` and an agency site, not the directory's `bnpparibas.com`.
- **Only 21 of 41 have an employee count.** Rule A alone would drop Wipro, HCLTech, Flipkart, Swiggy, PhonePe and Paytm, plus Pinterest, Discord, Kraken and SoFi. The India result under rule A confirms it: its 37 labelled items include India Post, a nuclear fuel plant and a foundation, but not Wipro or HCLTech.
- 25 of 41 are marked as listed (rule B). Flipkart, Swiggy, PhonePe and Paytm do not carry the listing statement. India under rule B (180 items, 07:17:32Z) includes Wipro, TCS, Infosys and HCL Technologies, plus an older "Zomato" item that has the website and listing the newer "Eternal Limited" item lacks. A brand and its legal entity can be two items, and domain dedupe catches that.
- 28 of 41 have at least one English alias. Wipro has 3, Infosys 8, Cognizant 5 ("Cognizant Technology Solutions" is its label) and Lenovo 5.

**5.3 Dedupe facts from rule A's 4,120 items** (07:13:53Z, 9,753 rows):
- They give 4,365 distinct domains, and 215 items have more than one domain.
- 81 domains are claimed by more than one item. Subsidiaries share the parent's site: `gazprom.ru` has 6 items, `arcelormittal.com` 5 and `baesystems.com` 4.
- The study's own short suffix list wrongly merged 15 Polish companies onto `com.pl`. The rule therefore needs the full Public Suffix List, not a hand-made one.
- 3,725 items have exactly one domain that no other item claims. These are the clean seed rows.
- 249 items have no English label.
- 19 of the 39 directory domains are already in this set.

**5.3a Rules A and B combined** (A at 07:13:53Z, B at 07:19:05Z, 16,797 rows):
- They give 16,304 items, of which 1,444 meet both rules and 15,083 have an English label.
- 278 domains are claimed by more than one item.
- After dedupe, 14,513 labelled items have one domain that no other item claims. 25 of them are already directory companies, which leaves about **14,488 new candidate rows**.
- The study's suffix handling was approximate, so the full Public Suffix List will move this number slightly.

**5.4 Proposed fields:** name (English label; an item without one is skipped), domain (the registrable domain of the official website, computed with the Public Suffix List), aliases (English alternative labels, used by search only, `D-174-company-search`) and the Wikidata ID (QID) kept as the source reference. Nothing else is seeded. No logo, description, employee count or "open" status is imported (D-176: the directory makes no public availability claim, and availability is derived from verified referrers).

**5.5 Proposed dedupe rule:**
1. Normalize each official website: lowercase, drop `www.`, then reduce to the registrable domain with the Public Suffix List.
2. If that domain already belongs to a directory company (`companyDomains`), add the item's aliases to search only and seed nothing.
3. If two or more items share the domain, seed none of them automatically. List them for an admin.
4. If one item has several domains, seed the domain marked "preferred" on Wikidata, else the shortest. Every other domain waits for an admin.
5. Key each seed row by QID, so a re-run updates instead of duplicating, and a Wikidata edit never silently re-points an existing company.

**5.6 The risk that decides the design:** directory domains are used to match **verified work emails** (`shared/companyDirectoryExpansionSeed.ts`). Anyone can edit Wikidata. Suppose a seeded domain went straight into work-email matching. Then anyone who edited a company's official-website field to a domain they control could verify a work email there and appear as a "verified employee" of that company. That breaks D-019 (e) trust and the identity rules. **So a seeded company's domain is used for search and display only, never for work-email verification, until an admin confirms it** through the existing authenticated listing (`POST /api/admin/companies`), as the D-086 admission queue already requires for unlisted domains.

**5.7 Recommendation (for the CEO, rated):**
- **(a) Seed the search index, not the directory: rule B ∪ rule A (about 14,500 rows, 5.3a), deduped by 5.5, names and aliases only, domains held for admin confirmation. 7/10.**
  - For: a seeker typing "Wipro" or "HCL" finds the company at once, and `D-174-company-search` gets real names and aliases (HCLTech's item is labelled "HCL Technologies"; Infosys has 8 English aliases). Swiggy, Flipkart, PhonePe and Paytm meet neither rule, so they still need a demand entry (option c).
  - Against, strongest first: a large index of companies with no verified referrers can read as a promise of help. The search result must say plainly that a request goes out when someone there verifies (D-176). Rule B also skips private companies.
- (b) Seed the directory itself with rule A. 3/10: it drops the Indian employers seekers ask for most, and in India it pulls in government bodies (India Post, a nuclear fuel plant) and a foundation instead.
- (c) Do not seed. Grow the directory only from demand (the D-086 admission queue) and use Wikidata only to check a name and suggest aliases. 6/10: safest and no spam, but slow, and search stays thin outside 39 companies.

## 6. Evidence for the owner questions in packet §7
- **Q3, SmartRecruiters (the packet rates using it 5/10; default: not used).** Re-checked at 07:06Z: `api.smartrecruiters.com/robots.txt` still allows only LinkedInBot, under `/v1/companies/`, and disallows every other agent. New evidence: Swiggy's careers app loads its assets from SmartRecruiters (`au.smrtr.io`, 07:09Z), so Swiggy is confirmed; Merkle is not re-confirmed. **This study's rating to use it: 3/10.** It adds at most two companies, and only by ignoring a crawl rule that D-175 says not to risk. The strongest counter-argument: the API is documented and public, and the robots rule may target crawlers rather than API clients. But the rule is the only consent signal the host gives. **Default stays.**
- **Q4, crawl-class sources (the packet rates them 4/10 at launch; default: none).** New evidence on Nov 1:
  - The Workday hosts for Accenture and Concentrix publish job sitemaps in robots.txt with no Disallow (07:06Z), and an Accenture job page carries `JobPosting` structured data: title, date posted, location, employment type (07:14Z). So a sitemap-only, robots-respecting reader is within those sites' own published rules.
  - Lenovo (Avature) publishes 8 locale sitemaps. Société Générale's Taleo host sets no robots rules.
  - The SAP SuccessFactors host behind Wipro disallows all bots (07:06Z), although the `careers.wipro.com` front end allows them.
  - Against: this is still not a licensed API. Refreshing every job page daily at a large employer is bulk fetching (the study read only Accenture's first sitemap file, 100 job URLs, so its total is unmeasured). And these sitemaps and pages can change or be blocked without notice.
  - **Rating stays 4/10 at launch.** If the owner wants it later, start with Workday sitemaps for Accenture and Concentrix, at most one request per job per day, honouring robots.txt on every run.
- **Q1 (charge at pickup) and Q2 (free credits refunded after their month ends):** these are money-rule questions, not coverage questions. This study gathered no evidence on them and changes nothing about them. Their defaults (today's rules) stand.

## 7. What this means for the D-174 rows
1. **Token check before any source joins (D-170, `D-174-job-catalog`, `D-174-job-sources-more`).** Accept a board for a directory company only with proof rule 1 or 2 from section 2, or rule 3 together with a matching board name or Ashby token. Never accept a slug or name match alone: `tcs` and `eternal` would have shown another company's jobs under TCS and Zomato.
2. **`D-174-job-sources-more` (Ashby + Lever):**
   - Ashby adds 4 directory companies (Kraken, Snowflake, 1Password and OpenAI; 1,350 jobs at 06:57–06:58Z), and Kraken needs the name `kraken.com`.
   - Lever adds **no directory company today**. Its one India hit, Paytm, is not in the directory.
3. **Greenhouse (`D-174-job-catalog`):** 10 directory companies, 2,529 jobs.
4. **Incomplete lists must say so:** the Nintendo board is Nintendo of America only, and Snowflake's ownership rests on board content while its careers front end is Phenom. The job list for either must not read as complete.
5. **The other 25 directory companies** (7 crawl-class and 18 not feasible) get the plain line from §7 Q4's default ("We can't list {Company}'s jobs yet. Paste a job link to request a referral.") until the owner decides otherwise.

## 8. Limits
- Only the HTML each server sent was read, and no page was run in a browser. A page that builds its job list in the browser can hide its source, so "no source in HTML" is not proof that none exists.
- Each careers page and posting URL was fetched once or twice (a second pass looked for system names the first pass missed), timed as above. Counts move daily.
- A robots.txt answering 403 was treated as "do not fetch". This is stricter than RFC 9309, which lets a 4xx robots.txt mean "no rules". It cost rows 4, 10, 29 and 32 their careers-page check.
- Wikidata counts depend on the 12-class list and on how complete Wikidata is. 5.2 shows the gaps that matter. The QLever snapshot may trail live Wikidata by days, and the one cross-check against the Wikidata Query Service matched.
- No paid source, login, LinkedIn or personal account was used. Every HTML fetch stayed within its host's robots.txt. A careers page that answered 429 was not retried, and the Wikidata endpoints were retried only at spaced intervals after a 429.

## Sources
- APIs: `boards-api.greenhouse.io/v1/boards/{token}` and `/jobs`, `api.lever.co/v0/postings/{site}?mode=json`, `api.ashbyhq.com/posting-api/job-board/{name}` (06:57–07:08Z).
- Careers pages and robots files: the URLs in sections 3 and 4 (06:59–07:14Z).
- Live directory: `skipwait.me/api/companies` (06:56Z). Repo seeds: `shared/companyDirectorySeed.ts` and `shared/companyDirectoryExpansionSeed.ts` at `ac997724`.
- Wikidata: `qlever.cs.uni-freiburg.de/api/wikidata` (07:09–07:19Z), `query.wikidata.org/sparql` (07:13:27Z) and `www.wikidata.org/w/api.php` `wbgetentities` (07:15:06Z). Data CC0.
