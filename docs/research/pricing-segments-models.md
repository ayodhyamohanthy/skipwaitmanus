> Status (Oct 18 2026): historical record — where it conflicts with docs/DECISIONS.md, the register wins (notably D-005, D-036, D-041, D-051).

# SkipWait pricing research: how job seekers buy, and how to price for India and global markets

**How to read the citations.** I looked at every URL on **2026-10-14**. Publication dates are given where known. Each source carries a tag:
- **[V]**: I read the primary or official page, or a reputable outlet's own article.
- **[S]**: secondary source, such as a review or aggregator. Vendor prices with this tag are not confirmed on the vendor's own site.
- **[U]**: unverified. This means a search snippet only, a single anecdote, or sources that conflict.

Numbers marked *computed* are my own arithmetic on the cited inputs.

---

## 0. Summary
1. **People pay for one job search, not a long subscription.** In September 2026 the median US unemployment spell was 11.5 weeks and the mean was 24.8 weeks. The market's "best value" plan is quarterly. SkipWait should sell **non-renewing 7/30/90-day passes** and make auto-renew an option.
2. **The INR draft is mispriced in both directions.** The ₹86/$ rate is out of date; the market rate is about ₹95.5. Converting at FX makes Start cost 4.4× the US price in purchasing-power (PPP) terms. Land at ₹8,499 and above also runs into India's payment-rail limits: a ₹5,000 default UPI mandate ceiling and extra authentication above ₹15,000. **Price the cheap tiers to Indian incomes (about 39% of the USD price) and keep the top tiers near half the USD price.** Sell Land as one-time passes.
3. **Free plans convert poorly: about 2.1% of installs pay within 35 days (RevenueCat, Day 35).** Keep the "just exploring" users with a free tier that does real work, plus:
   - a 14-day reverse trial that needs no card;
   - one-time purchases of ₹49–99 or $3–5.
   - Never use a $2.95 trial that quietly renews.
4. **Power users pay because referrals work.** Referred applicants reach interview 40% of the time against 3% for inbound applicants. Their offer rate is 7.3% against 0.2%. Sell them **breadth, faster preparation and human depth**. The market accepts $1,149–3,000 a month for this. **Never sell visibility to referrers or a better place in their queue.**
5. **Legal and trust guardrails:**
   - No guarantees of a job or referral.
   - No success fees.
   - No claims of "insider access".
   - Under New York and California employment-agency and career-counselling law, careless marketing for a paid concierge could put SkipWait under licensing, contract and refund rules.

---

## 1. Evidence

### 1.1 How long searches last and how long people pay
| Metric | Value | Source |
|---|---|---|
| US median / mean length of unemployment, Sep 2026 | **11.5 / 24.8 weeks**; 27.1% unemployed 27+ weeks (1.94M people) | [BLS Table A-12](https://www.bls.gov/web/empsit/cpseea12.htm), modified 2026-10-02 [V] |
| US job seekers searching 6+ months | More than half (LinkedIn Workforce Confidence) | [Allwork.Space, Feb 2025](https://allwork.space/?p=1034753) [S] |
| US recent graduates, ages 22–27 | 5.6% unemployed, 42% underemployed (2026 Q2) | [NY Fed](https://www.newyorkfed.org/research/college-labor-market) [V] |
| Job board that charges seekers (CareerHound) | $7 a week / $20 a month / $50 a year, hard paywall, **31% churn**, 779 subscribers. Founder says churn is expected because hired seekers cancel. Implies ~3.2-month average lifetime (*computed*: 1/0.31) | [Job Board Secrets, 2026-09-08](https://www.jobboardsecrets.com/2026/09/08/this-profitable-job-board-charges-seekers/) [S] |
| Subscribers still active after one year | Weekly 3%, monthly 11%, annual 28% (medians) | [RevenueCat, 2022](https://www.revenuecat.com/blog/growth/one-year-retention-rates-insights.md) [V, dated] |
| Annual subscriptions cancelled in month 1 | Nearly 30% | [RevenueCat SOSA 2025](https://www.revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch.md) [V] |
| One reverse-recruiting agency's time to offer | 12.7 weeks vs 24.3 for the market. Average 863 applications before an offer, 924 for visa or other constrained searches. All company-reported | [Fortune, 2026-03-25](https://fortune.com/2026/03/25/reverse-recruiting-agency-job-search-ai-applications-cost/) [V article; claims unverified] |
| Tech layoffs in 2026 | 125,759 by Aug 6 (already above all of 2025: 122,606) | [IBTimes citing layoffs.fyi](https://www.ibtimes.co.uk/tech-industry-record-job-cuts-2026-1813332) [S] |

**What this means for SkipWait:** a typical paid relationship lasts 1–3 months, and a long tail of 6+ month searches renews. A 90-day product covers the median search.

### 1.2 Conversion benchmarks
| Benchmark | Value | Source |
|---|---|---|
| Day-35 conversion, hard paywall vs freemium | **10.7% vs 2.1%**. Revenue per install by day 60: $3.09 vs $0.38. One-year retention of annual subscribers: 27% vs 28% | [RevenueCat, 2026-03-19](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026.md) [V] |
| Conversion by trial length | 17–32 days: 42.5%. Under 4 days: 25.5%. 55.4% of 3-day-trial cancellations happen on Day 0 | same [V] |
| Self-serve freemium, free → paid | Good 3–5%, great 6–8%. Free trial: good 8–12% | [Lenny's Newsletter](https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion) [S, paywalled summary] |
| Card-required vs no-card trials | Card trials convert 70–80%, but up to 80% of users drop at the card screen. No-card trials ~15%. Freemium ~5%. Defines the reverse trial | [Elena Verna, Amplitude, 2022 / republished 2025](https://amplitude.com/blog/reverse-trial) [V] |
| Apps mixing subscriptions with one-off purchases (consumables/lifetime) | 35% of apps | [RevenueCat SOSA 2025](https://www.revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch.md) [V] |
| India/Southeast Asia vs North America | Median monthly price $3.75 vs $9.99. Yearly $18.32 vs $39.99. Year-1 value per payer $14 vs $32. **Refund rate 7.7% vs 3.4%** | [PricePush summary of RevenueCat SOSA 2026](https://pricepush.app/blog/revenuecat-sosa-2026-pricing-localization-insights) [S] |

### 1.3 What global self-serve job-search tools charge
| Product | Weekly | Monthly | Quarterly | Annual | Tag |
|---|---|---|---|---|---|
| Teal+ | $9–13 | $29 | $79 | $179 (disputed) | [S](https://blog.loopcv.pro/teal-hq-review/amp/) |
| Jobscan | — | $49.95 | $89.95 | ~$299.95? | [S](https://blog.fastapply.co/fastapply-vs-jobscan-review-and-comparison-2026) |
| Huntr Pro | — | $40 | $90 | $160 per 6 months | [S](https://scoutify.com/blog/huntr-review) |
| Jobright Turbo | $17.99 | $39.99 | $89.99 | — | [S](https://careery.pro/blog/ai-job-search/jobright-ai-review) |
| LinkedIn Premium Career | — | $39.99 for new sign-ups ($29.99 legacy) | — | $239.88 | [S](https://salesbread.com/how-much-does-linkedin-premium-cost/) |
| Final Round AI | — | $90–150 | — | $300 | [S/U](https://ophyai.com/blog/career-advice/final-round-ai-pricing) |
| CareerHound | $7 | $20 | — | $50 | [S](https://www.jobboardsecrets.com/2026/09/08/this-profitable-job-board-charges-seekers/) |
| Zety (UK, official) | £2.95 for 14 days, then **auto-renews at £20.95 every 4 weeks**; 14-day refund | | | | [U: page timed out, search snippet only](https://zety.com/uk/pricing) |

- **Pattern:** weekly prices sit at $7–18, monthly at $20–50, and quarterly is sold as the best value. The quarterly discount runs 9–40% (*computed*: Teal 9%, Huntr and Jobright 25%, Jobscan 40%).
- **SkipWait has no 90-day product.** Its draft Start ($8) and Momentum ($20) sit below these comparables.

### 1.4 India: price anchors, purchasing power and payment rails
| Item | Value | Source |
|---|---|---|
| PPP conversion factor (private consumption) | **₹19.84 per international $** (2025) | [World Bank API](https://api.worldbank.org/v2/country/IND/indicator/PA.NUS.PRVT.PP?format=json&mrv=3) [V] |
| Market FX | **₹95.46/$** (2025-08-25). The draft's ₹86 is out of date | [HDFC Sky/PTI](https://hdfcsky.com/news/rupee-rises-24-paise-to-close-at-95-46-against-us-dollar) [V] |
| GNI per capita (Atlas method), 2025 | India $2,760 vs US $88,810 (32×) | [WB India](https://api.worldbank.org/v2/country/IND/indicator/NY.GNP.PCAP.CD?format=json&mrv=3), [WB US](https://api.worldbank.org/v2/country/USA/indicator/NY.GNP.PCAP.CD?format=json&mrv=2) [V] |
| ChatGPT Go / Plus in India | ₹399 / ₹1,999 a month, UPI accepted (Aug 2025). Pattern: an India-only cheap tier, with the top tier near USD parity | [TechCrunch, 2025-08-18](https://techcrunch.com/2025/08/18/openai-launches-a-sub-5-chatgpt-plan-in-india) [V] |
| Spotify India | Standard cut from ₹199 to **₹139**, Student from ₹99 to ₹69, both −30% (May 2026). Earlier Premium Mini: ₹7 a day / ₹25 a week, no card needed, sold as an entry funnel | [FoneArena, May 2026](https://www.fonearena.com/blog/482851/spotify-india-price-cut-may-2026.html/amp) [V]; [Mini plans](https://www.fonearena.com/blog/329506/spotify-premium-mini-subscription-india.html/amp) [U: snippet only] |
| LinkedIn Premium Career, India | ₹1,899 a month. Other reports range from ₹999 to ₹2,800 | [SubsKart](https://subskart.in/blog/linkedin-premium-price-india-2026) [U: reseller] |
| Naukri FastForward | Priority Applicant ₹495 a month (2023 receipt). Resume Display ~₹890 a month. FastForward billings +27% year on year (Q2 FY25) | [Scribd receipt](https://www.scribd.com/document/639315013/FastForward) [U]; [blog](https://goodspace.ai/guides/naukri-paid-services-worth-it) [U]; [Storyboard18](https://www.storyboard18.com/amp/brand-marketing/naukri-com-recruitment-business-sees-9-revenue-growth-to-rs-495-crore-in-q2-fy25-47698.htm) [V] |
| Topmate mock interviews | **Median ₹809 across 430 experts**. Range on page 1: ₹82–6,113 | [Topmate](https://topmate.io/s/mock-interview) [V] |
| Topmate paid "referral group" | ₹299 for 3 months | [Topmate listing](https://topmate.io/sdejobsandinternships/1068473) [V] |
| Paid one-off referrals (Topmate/Preplaced) | ₹10,000–15,000 each (anecdote) | [Grapevine](https://www.grapevine.in/post/are-paid-referrals-worth-it-82a71529-49fc-4761-89bb-b9c86c6f05da) [U] |
| Fresher pay in IT services | ₹3.5–4.5 LPA typical | [Hyring](https://hyring.com/blog/fresher-salary-guide-india-2026/), [Naukri](https://www.naukri.com/campus/career-guidance/sectors-hiring-freshers-in-india) [S] |
| Graduate youth unemployment | 29.1% (2022 data) | [Fortune Asia on ILO-IHD, 2024-03-30](https://fortune.com/asia/2024/03/30/young-people-india-more-likely-unemployed-if-educated-international-labour-organization) [V] |
| RBI e-mandate rules (2026-04-21) | Recurring debits up to ₹15,000 need no extra authentication (AFA). The first debit needs AFA. 24-hour pre-debit notice | [MediaNama, 2026-04-24](https://www.medianama.com/2026/04/223-rbi-additional-factor-authentication-e-mandates/) [V] |
| Chargebee + Razorpay | **Default UPI mandate ceiling ₹5,000**. Above ₹15,000, AFA at pre-debit. Mandates only for Indian-issued INR cards; foreign cards must pay one-time with Pay Now | [Chargebee docs](https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/razorpay-rbi-e-mandate) [V] |
| CCPA Dark Patterns Guidelines, 2023 | A "subscription trap" includes forcing payment details or auto-debit to get a free subscription | [SCC Online, 2023-12-04](https://www.scconline.com/blog/post/2023/12/04/ccpa-notifies-guidelines-for-prevention-and-regulation-of-dark-patterns-2023-legal-news/) [S] |

**What the draft INR prices mean in practice (*computed*):**
- In PPP terms, ₹699 / ₹1,699 / ₹8,499 / ₹42,999 equal **$35 / $86 / $428 / $2,167**.
- ₹699 is 2.1% of a ₹4 LPA fresher's gross monthly pay. ₹8,499 is 25.5%.
- In the US, $8 is 0.11% of monthly GNI per capita. In India, ₹699 is 3.2%, about 30× heavier.
- Payment rails: Land Focus ₹8,499 exceeds the ₹5,000 UPI default. Sprint, Concierge and Momentum-yearly (₹16,990) all exceed ₹15,000, so every debit needs extra authentication.

### 1.5 High-ticket job-search concierge: prices, claims and risks
| Provider | Price | Model and claims | Risk | Source |
|---|---|---|---|---|
| Reverse Recruiting Agency | $1,500 a month + **10% of first-year salary** | 50–100 applications a week. First month refunded on success. 45 clients | Success fee looks like a placement fee. Outcomes are self-reported | [Fortune, 2026-03-25](https://fortune.com/2026/03/25/reverse-recruiting-agency-job-search-ai-applications-cost/) [V] |
| Find My Profession | $5,000 for 3 months, then $1,350 a month | Full search execution | Third-party quotes conflict ($1,499–3,999 a month) | [official page, snippet only](https://www.findmyprofession.com/rr-pricing) [U] |
| TopStack / My Personal Recruiter | $1,149 a month / $799–1,999 a month | Applications done for you | No outcome guarantee | [Careery](https://careery.pro/blog/job-search-strategy/is-reverse-recruiter-worth-it), [F1Jobs](https://www.f1jobs.io/resources/blog/reverse-recruiting-cost-2026-what-companies-actually-charge) [S] |
| Interview Kickstart | ~$2,400–12,000 | 50% money-back only if strict conditions are met (e.g., onsite interviews at 6 or more companies) | Refund-denial complaints | [techinterview.org](https://www.techinterview.org/bootcamp_directory/p/interview-kickstart/) [S] |
| Leland coaches | $25–650+ an hour; packages $612–7,580 | Coaches set their own prices | Quality varies | [Leland package](https://www.joinleland.com/coach/melissa-lyons/p/career-development-start-to-finish) [V]; [IGotAnOffer](https://igotanoffer.com/en/advice/leland-alternatives) [S] |
| interviewing.io | From $179 a session | Anonymous mock interviews | Refund promise is not in its terms | [techinterview.org, 2026-10-08](https://www.techinterview.org/bootcamp_directory/p/interviewing-io/) [S] |
| ICF coaching fee | ~$234 an hour average worldwide (2025 study) | — | — | [simply.coach](https://simply.coach/blog/icf-coaching-statistics-industry-insights/) [S] |

### 1.6 Refund and guarantee norms
- **LinkedIn:** refund within 7 days of a charge if Premium was not used. EU users get 14 days. ([LinkedIn Help](https://www.linkedin.com/help/billing/answer/5704) [V])
- **TopResume:** promises 2× more interviews in 60 days. The remedy is a free rewrite, not a refund. ([Sonary, Jan 2026](https://sonary.com/reviews/topresume/) [S])
- **Internshala placement-guarantee courses:** 100% refund only with 75% course marks, 10+ applications a week and attendance at every session. Refund complaints exist. ([College Vidya](https://collegevidya.com/university/internshala/) [S]; [Trustpilot](https://nl.trustpilot.com/review/www.internshala.com) [U])
- **California job listing services:** must refund the full advance fee if they can't supply 3 matching openings within 7 business days. They must refund everything above $25 if the seeker gets no job, or a job that lasts under 90 days. ([Cal. Civ. Code §1812.518](https://codes.findlaw.com/ca/civil-code/civ-sect-1812-518/) [V])
- **US auto-renewal rules:** the FTC "click-to-cancel" rule was vacated on 2025-07-08. The FTC restarted rulemaking with an advance notice (ANPRM) on 2026-03-11. ROSCA and state auto-renewal laws still apply. ([AGG](https://www.agg.com/news-insights/publications/ftc-negative-option-rulemaking-resumes-in-2026-key-compliance-risks-for-subscription-and-auto-renewal-programs/) [S])

### 1.7 Earning from "referral at any cost" users without selling referrals: ethics and law
- **Why they would pay.** From 38M applications (2021–2024):
  - Referred applicants reach interview at **40% vs 3%** for inbound, and get offers at **7.3% vs 0.2%**.
  - Referrals are only about 1% of applications.
  - ([Ashby, 2025-05-16](https://www.ashbyhq.com/talent-trends-report/reports/referrals) [V])
- **A market for paid referrals has existed.** Rooftop Slushie (from Blind's founders):
  - buyers paid $20–50 per referral, with about 11,000 purchases;
  - the platform kept 15–30%.
  - Amazon said that taking outside payment for referrals breaks its conflict-of-interest policy and can lead to discipline. ([TNW, 2020-06-30](https://thenextweb.com/news/google-facebook-job-paid-referral) [V])
  - Blind users reported the site closing around 2022. ([Blind threads](https://www.teamblind.com/search/rooftopslushie) [U])
- **Competitors that sell priority (avoid copying):**
  - Aced (formerly Exponent) shows members' profiles to referrers **before** non-members' profiles. ([aced.io](https://www.aced.io/jobs/referrals) [V])
  - Naukri sells "Priority Applicant". ([receipt](https://www.scribd.com/document/639315013/FastForward) [U])
- **New York.** GBL §171(2)(c) counts these as an "employment agency" when a fee is charged for career guidance:
  - representing that you can procure employment;
  - claiming access to jobs not otherwise available;
  - any service presented as leading to employment.
  - Under §185, agency fees may only be charged after the seeker is placed. ([NY GBL §171](https://newyork.public.law/laws/n.y._general_business_law_section_171) [V]; [Justia §185](https://law.justia.com/codes/new-york/2022/gbs/article-11/192/) [S])
- **California.**
  - "Employment counseling service" covers career management and résumé development for a fee, except providers who charge strictly by the hour.
  - "Job listing service" covers matching seekers with openings for an advance fee.
  - ([Cal. Civ. Code §1812.501](https://codes.findlaw.com/ca/civil-code/civ-sect-1812-501/) [V])
- **Visa deadlines make urgent buyers easy to exploit.**
  - F-1 OPT allows 90 days of unemployment, 150 with the STEM extension. ([DHS Study in the States](https://studyinthestates.dhs.gov/sevis-help-hub/student-records/fm-student-employment/unemployment-counter) [V])
  - DHS has proposed removing the 60-day H-1B grace period. It is not final.
  - 71% of approved H-1B petitions in FY2024 went to Indian-born workers. ([Business Today, 2026-09-11](https://www.businesstoday.in/nri/story/trump-moves-to-scrap-h-1b-visa-60-day-grace-period-why-indian-workers-face-a-new-risk-554772-2026-09-11) [V])

---

## 2. Segment table
These WTP (willingness-to-pay) ranges are **my estimates built from the anchors above**. They need validating with SkipWait's own data.

| Segment | Core need | WTP India (est.) | WTP global (est.) | Key anchors | Best offer |
|---|---|---|---|---|---|
| **Just exploring** (passive or curious) | See whether it works, with no risk | ₹0; impulse buys ₹49–99 | $0; impulse buys $3–5 | Spotify Mini ₹25 a week; ChatGPT Go ₹399; freemium Day-35 conversion 2.1% | Free 3 asks forever, plus a no-card 14-day reverse trial after the first ask. ₹99 / $5 week pass. "Keep warm" annual ₹999 / $29 |
| **Students / freshers** | First referral, credible asks, interview basics | ₹0–299 a month; ≤₹999 per search | $0–10 a month; ≤$30 per search | Fresher pay ₹3.5–4.5 LPA; Spotify Student ₹69; Topmate referral group ₹299 for 3 months; US recent-grad unemployment 5.6% | Free plan, ₹99 week pass, Start ₹299 / $8. Campus cohorts |
| **Early career** (1–4 years) | Switch faster, with better asks to 5–15 companies | ₹299–1,499 a month | $8–40 a month | Naukri ₹495–890 a month [U]; LinkedIn ₹1,899 [U]; Teal $29; Jobright $39.99 | Momentum 30/90-day pass: ₹999 / ₹2,399; $24 / $55 |
| **Mid / senior** | Targeted companies, top-quality asks, interview and salary prep | ₹2,000–15,000 per search | $100–600 per search | Topmate median ₹809 a session; interviewing.io $179+; Final Round $90–150 a month | Land Focus pass plus human-review add-ons priced for each market |
| **Laid off / urgent** | Speed, structure, many companies at once, accountability | ₹5,000–25,000 per 30–90 days | $150–1,500 per 30–90 days | 27.1% of unemployed out 27+ weeks; reverse recruiters $1,149–3,000 a month | Land Sprint 30-day pass, with a human kickoff within 24 hours |
| **International relocation / visa** | Hard deadlines; targeting companies that sponsor | ₹10,000–60,000 per search (India to abroad) | $300–2,500 per search | OPT 90/150-day limit; H-1B grace period at risk; visa searches need ~924 applications [company-reported] | Concierge 60/90-day pass with sponsor-history research. No immigration advice. No pressure tactics |
| **"Referral at any cost" power users** | Most parallel attempts, best preparation, human help | ₹10,000–60,000 per search | $500–3,000+ per search | Paid referrals ₹10–15k each [U]; Rooftop Slushie $20–50 each; RRA $1,500 a month + 10% | Sprint/Concierge 90-day passes, human-time products sold separately, a published "what money can't buy" policy |

---

## 3. Ten recommendations

**1. Make paid tiers non-renewing passes (7/30/90 days) by default. Offer auto-renew as an opt-in "auto-extend".**
- Price a 90-day pass at about 2.3–2.4× the 30-day pass. That matches the 9–40% quarterly discount competitors give.
- Chargebee supports this: fixed billing cycles set to 1 produce a non-renewing subscription ([docs](https://www.chargebee.com/docs/billing/2.0/kb/subscriptions/how-to-create-a-non-renewing-subscription-via-chargebee-ui) [V]).
- **Product rule:** when a pass ends, asks already open stay live until they resolve or expire. Only the ability to open new asks drops back to the Free limit.
- Unused plan credits follow the carryover rules. Purchased credits never expire, as today.

**2. Rebase INR prices: price the cheap tiers to Indian incomes, keep the top tiers near half the USD price, and stay under payment-rail limits.**
- Proposed prices:
  - Start: ₹299 per 30 days, or ₹249 a month on UPI autopay.
  - Momentum: ₹999 per 30 days, or ₹899 a month on autopay.
  - Land Focus: **₹4,999** per 30 days. This sits under the ₹5,000 default UPI mandate.
  - Land Sprint: ₹9,999 per 30 days.
  - Concierge: ₹24,999 per 30 days.
- These are about 39% of USD for Start and about 52% for the rest at ₹95.46 (*computed*). That is close to the 37.5% ratio of median monthly prices in India/SEA vs North America, and to LinkedIn's ~50% [U].
- Sell Land in India **only as one-time payments** (UPI or Pay Now). That avoids extra authentication above ₹15,000 and covers foreign cards, which can't hold a mandate.
- Two A/B tests: Land Focus at ₹4,999 vs ₹6,999, and Concierge at ₹24,999 vs ₹34,999.
- INR credits: aim for about ₹45–55 per credit (today's pack is ₹80). Check AI costs per unit first, because model costs are billed in USD.

**3. Keep "just exploring" users with a free tier that does real work and a reverse trial with no card.**
- Free stays at 3 open asks forever.
- After the **first ask is sent**, unlock Momentum-level breadth for 14 days with no card.
- Use 14 days, not 3–7: referrer replies take days, and trials of 17–32 days convert better (42.5% vs 25.5%).
- One trial per canonical person.
- No card is legally required in India: CCPA treats forced auto-debit for a free offer as a dark pattern. It also avoids the up to 80% drop-off at card screens.
- Expected lift: freemium Day-35 conversion is 2.1%. A good reverse trial should aim for 4–6%. That target is my estimate; the ChartMogul figure behind it is [U].

**4. Give a low-friction first purchase that is always one-time and never a trial that turns into a subscription.**
- India: ₹49 for one finished item (for example, an ask polish), or a ₹99 week pass with Start breadth and 2 credits.
- Global: a $3 three-credit starter pack, once per account, or a $5 week pass.
- Spotify's Mini plans showed that small UPI payments with no card work as an entry funnel.
- Avoid the Zety-style pattern of £2.95 for 14 days that renews at £20.95 every 4 weeks. It draws complaints and falls under ROSCA, state auto-renewal laws and the CCPA subscription-trap rule.
- Check the fixed fees for PayPal and Razorpay before going below $3. I did not verify those fees.

**5. Earn from power users by selling breadth, speed and human depth, not position.**
- 90-day passes in USD:
  - Land Focus $239.
  - Land Sprint $479.
  - Concierge **$1,199, with the human hours stated**, for example 8 hours per 30 days.
  - These are still below reverse recruiters ($1,149–3,000 a month; Find My Profession $5,000 for 3 months [U]).
- **Price human time separately from the global credit:**
  - Today, human expert review costs 25 credits, which is $25 in the US. That is far below interviewing.io's $179+ and the ~$234/hour coaching average.
  - In INR the same review costs ₹2,000, about 2.5× Topmate's ₹809 median.
  - Suggested prices: US $79–149 a session; India ₹799–1,499.
- Products to sell:
  - more parallel open asks across **different** companies;
  - human review within 24 hours;
  - company and team research dossiers;
  - mock interviews;
  - a weekly sprint plan with check-ins;
  - a concierge who drafts asks for the seeker to approve and send;
  - salary and offer coaching.

**6. Protect referrer attention with hard rules in the code.**
- Plan tier never appears in anything a referrer sees.
- No paid sorting, no badges, no extra nudges to referrers.
- On every plan: at most 2 open asks per company and 1 per referrer, plus a cooldown.
- Track fairness: time to first referrer view and reply rate, broken down by plan. They should match.
- Publish a "What money can't buy" page.
- Why: Aced's member priority and Naukri's Priority Applicant are the model to avoid. Amazon's conflict-of-interest stance shows what employers think of paid referrals.

**7. Give everyone a free baseline quality check, so paying buys speed and depth of preparation, not access.**
- Every ask gets a free check: does the job URL match, is a résumé attached, does the ask have structure.
- This keeps the rule "money never buys acceptance odds" true in practice and defensible in marketing.

**8. No job or referral guarantees, no success fees, no income-share agreements. Offer service guarantees instead.**
- What to guarantee:
  - 7-day refund if the pass hasn't been used (LinkedIn's norm);
  - prorated refund of unused human hours on Concierge;
  - credits returned automatically if a human-review deadline is missed.
- What to avoid:
  - success fees like RRA's 10% of first-year salary;
  - income-share deals like Pathrise's reported 9% ([Built In](https://builtin.com/articles/income-sharing-agreements) [S]).
  - These look like placement fees under NY GBL §185, where fees may only be charged after placement.

**9. Get a lawyer's review of the Concierge and paid-breadth copy before launch. Consider not selling Concierge to New York and California residents until then.**
- Never market paid tiers as "get referred", "insider access" or "guaranteed".
- Use wording like "Prepare and send more thoughtful asks; employees decide".
- Risks:
  - NY GBL §171(2)(c) covers paid guidance that implies access to jobs, or services presented as leading to employment.
  - California's counselling-service definition covers career management and résumés for a fee unless charged strictly by the hour.
  - California's job-listing rules apply if the paid research starts to look like lists of openings.
- For visa candidates: research only, never immigration advice.

**10. Play down yearly plans for active seekers, add a cheap "Keep warm" annual, and fix the honesty gaps in the draft.**
- "Yearly = 10× monthly" doesn't fit a 1–3 month need; nearly 30% of annual subscribers cancel in month 1.
- Add Keep warm at **$29 / ₹999 a year**: 5 open asks plus 1 credit a month, for employed passive candidates. Comparables: CareerHound $50 a year; Unstop Pro ₹1,999 a year ([Outlook Startup](https://startup.outlookindia.com/sector/saas/unstop-launches-subscription-membership-unstop-pro-news-9537) [U: page did not load]).
- Rename "Most chosen" to "Recommended" until real purchase data supports the claim. It appears on Momentum and on a credit pack in `PRICING.md` (this repository, as of 2026-10-14).
- Reconcile the credit packs, which disagree:
  - PRICING.md: 5/$5, 25/$22, 60/$48, 150/$105.
  - `shared/planCatalog.ts` (this repository, as of 2026-10-14): 10/$9, 30/$24, 100/$69, 300/$179.
- Test plan:
  - Run a Van Westendorp price-sensitivity survey in each market, plus 4-week A/B tests: Momentum $20 vs $29, Concierge $500 vs $750 per 30 days.
  - Track Day-35 conversion (benchmark 2.1%), the share of passes extended, and refund rate (benchmark 7.7% for India/SEA, 3.4% for North America).
  - Track the plan-fairness numbers from recommendation 6.

---

## 4. Proposed price grid (to test)
| Product | USD | INR | Renewal |
|---|---|---|---|
| Free | $0: 3 open asks | ₹0: 3 open asks | — |
| Single item / starter | $3 for 3 credits (once per account) | ₹49 for 1 item | One-time |
| Week pass (Start breadth) | $5 | ₹99 | One-time |
| Start, 30 days | $9 pass / $8 a month auto | ₹299 pass / ₹249 a month UPI auto | Opt-in auto |
| Momentum, 30 / 90 days | $24 / $55 (or $20 a month auto) | ₹999 / ₹2,399 (or ₹899 a month auto) | Opt-in auto |
| Land Focus, 30 / 90 days | $100 / $239 | ₹4,999 / ₹11,999 | Pass (INR always one-time) |
| Land Sprint, 30 / 90 days | $200 / $479 | ₹9,999 / ₹23,999 | Pass |
| Concierge, 30 / 90 days (human hours stated) | $500 / $1,199 | ₹24,999 / ₹59,999 | Pass |
| Human session (review or mock) | $79–149 | ₹799–1,499 | One-time |
| Keep warm annual | $29 | ₹999 | Yearly, reminder before renewal |

## 5. Not verified / gaps
- **Vendor prices:** the vendor's own page was not confirmed for Teal, Jobscan, Huntr, Jobright, Final Round, LinkedIn India, Naukri, Find My Profession or Interview Kickstart.
- **Zety UK:** the official page timed out, so its prices come from a search snippet.
- **India search length:** I found no India-specific data on how long a job search takes.
- **Missing 2025–26 data:**
  - typical US referral-bonus amounts (SHRM 2023 found 59% of employers offer referral bonuses ([SHRM](https://www.shrm.org/in/topics-tools/research/employee-benefits-survey-2023/other) [S]));
  - the reverse-trial conversion benchmark;
  - why Rooftop Slushie closed.
- **India law:** I did not check India-specific rules on fees for domestic placement services, or the Emigration Act's rules on recruiting agents for jobs abroad. Ask counsel.