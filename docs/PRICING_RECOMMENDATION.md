> Historical record (Oct 14 2026). Not current guidance; docs/DECISIONS.md and docs/plans/assignments.json win.
> Pricing today: `docs/PRICING.md` is the one source (D-146).

# Pricing recommendation and owner decisions (Oct 14 2026)

## Owner decisions (Oct 14 2026) — these govern the build
1. **Billing shape:** 30-day and 90-day passes paid once; auto-extend is opt-in at checkout (same price, reminder before each renewal) and offered only where the payment method can renew without extra authentication (INR UPI AutoPay up to ₹5,000; INR card/netbanking mandates up to ₹15,000; USD only after PayPal reference transactions or a card route are confirmed). Yearly exists only for **Keep warm**. The Plans screen's Monthly/Yearly toggle becomes **30 days / 90 days** (owner-approved deviation from the kit PNG).
2. **Prices:** the recommended prices in section 3 below (India INR shown as the "India price" with no GST — item 5, D-007 — and global USD), Concierge by application.
3. **Regions:** **India (INR) + one global USD price first.** Regional tiers T2–T4 and EUR/GBP come later, after the first prices are proven (and EU/UK VAT registration or a merchant of record).
4. **Free plan:** 3 open asks, 3 credits every UTC calendar month (no carryover), no welcome credits (D-039), a free ask quality check, and a one-time 14-day Momentum reverse trial (15 open asks, 5 trial credits) kept in code but off the public catalog until its trigger ships (D-051; recommended trigger: the seeker's first ask that reaches an available verified referrer), never asking for a card.

5. **Tax status (owner, Oct 14 2026):** SkipWait is an Indian **sole proprietorship with Udyam (MSME) registration, NOT GST-registered yet.** So: charge **no GST** on any sale (INR or USD); show INR prices as **"India price"** with no "incl. GST" wording; invoices carry no tax lines or GSTIN. Build this behind ONE server-side setting (e.g. `indiaGstRegistered: false` in the catalog contract) that switches labels, Chargebee tax handling and invoice details to GST mode the day a GSTIN exists. GST registration becomes mandatory once aggregate service turnover (including USD/export sales) nears ₹20 lakh a year — add an admin-visible trailing-12-month turnover figure vs that threshold. Sole proprietorship => no DPIIT Startup India benefits.

Still open (section 8): per-tool AI cost, students/campus pricing. Answered by D-059 (Oct 18): CA/SAC advice once a GSTIN exists; human expert review stays off until someone can deliver it (human sessions unpurchasable until staffed; Concierge by application); USD auto-renewal stays off until PayPal confirms reference transactions; no counsel spend for Concierge (by application).

---

# SkipWait pricing recommendation: India (INR) and global (USD and regional prices)

*Sources: the four research briefs, plus `PRICING.md`, `UPGRADE_NUDGES.md` and `shared/planCatalog.ts` in `/Users/ayodhyarammohanthy/Documents/GitHub/skipwaitmanus-screens`. Every source was seen on 2026-10-14 unless another date is given. **[U]** marks a figure that is unverified or comes from a third party only. Exchange rates are the ECB reference rates for 2026-10-13: ₹95.28, €0.894 and £0.755 per US$ ([ECB](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml)). AED is pegged at 3.6725 per US$ ([World Bank FCRF](https://api.worldbank.org/v2/country/IND;BRA;IDN;PHL;NGA;ARE;GBR;DEU;USA;FRA/indicator/PA.NUS.FCRF)). All willingness-to-pay figures and recommended prices are my judgement, not research findings.*

## 1. Executive summary

- **Sell a job search, not a subscription.** The median US unemployment spell is 11.5 weeks ([BLS A-12, 2026-10-02](https://www.bls.gov/web/empsit/cpseea12.htm)). Quarterly is the plan labeled "Most popular" at both [Jobscan](https://app.jobscan.co/plan) and [Simplify](https://help.simplify.jobs/articles/5623502-whats-included-in-simplify-features-and-pricing).
  - Paid plans become **30-day and 90-day passes paid once**. Automatic renewal ("auto-extend") is opt-in.
  - The yearly plan survives only as a **$29 / ₹999 "Keep warm"** plan.
  - Passes also avoid two payment problems. PayPal recurring billing for an Indian merchant is unconfirmed: India is not one of PayPal's markets for storing payment methods ([PayPal](https://developer.paypal.com/docs/checkout/save-payment-methods/during-purchase/orders-api/paypal/)). And Indian recurring payments are capped at ₹5,000 for UPI and ₹15,000 for cards and netbanking.
- **Base India prices on Indian job-tool prices, not on the exchange rate.** The draft converted at ₹86 per US$. At ₹95.28 its prices are **0.89–0.92× the US price**, while Indian consumer subscriptions sit at 0.10–0.25× (Spotify, Netflix).
  - New prices: **Start ₹299, Momentum ₹999** (the same as Naukri Pro and Unstop Pro monthly), and **Land passes ₹5,999 / ₹11,999 / ₹34,999**.
  - All prices include GST, and no item reaches ₹1 lakh.
- **Global: keep the $8 entry plan and raise the middle and top.**
  - Momentum goes to **$24** (test $29); comparable tools charge $29–40.
  - New **Momentum 90-day pass at $59**; comparable quarterly plans cost $79–90.
  - **Concierge becomes by application, from $750 with stated human hours**. The current $500 is below the $1,149–3,000 a month that reverse recruiters charge.
- **Explorers:** Free stays generous and never asks for a card. It gains **2 credits a month** and a **14-day trial of a higher plan with no card ("reverse trial")** after the first ask. Add a **non-renewing first purchase at ₹99 / $5** and Keep warm.
- **Power users pay for breadth across companies, finished work and human time. They never pay for position.**
  - Human review moves out of credits into separately priced sessions: **$49 / $99, or ₹799 / ₹1,499**. Today it costs 25 credits ($25), while the market charges $179 or more.
  - Concierge's unlimited open asks become **75**.
  - The per-company and per-referrer limits are the same on every plan, and referrers never see a seeker's plan.

## 2. Segments: what each needs and will pay

| Segment | Core need | India WTP (est.) | Global WTP (est.) | Evidence | What we sell them |
|---|---|---|---|---|---|
| **Just exploring** (employed, curious) | See whether it works, with no risk | ₹0; impulse buys ₹49–99 | $0; impulse buys $3–5 | Freemium converts 2.1% by Day 35 vs 10.7% for a hard paywall ([RevenueCat, 2026-03-19](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026.md)); ChatGPT Go ₹399 ([TechCrunch](https://techcrunch.com/2025/08/18/openai-launches-a-sub-5-chatgpt-plan-in-india)) | Free plan, reverse trial, ₹99 / $5 credit pack, Keep warm |
| **Students / freshers** | First referral, credible asks | ₹0–299/mo | $0–10/mo | Typical fresher pay ₹3.5–4.5 LPA ([Hyring](https://hyring.com/blog/fresher-salary-guide-india-2026/)); Spotify Student ₹69 ([FoneArena](https://www.fonearena.com/blog/482851/spotify-india-price-cut-may-2026.html)) | Free plan, Start ₹299 / $8 |
| **Early career** (1–4 years) | Better asks to 5–15 companies | ₹299–1,499/mo | $8–40/mo | Naukri Pro ₹999 a month, ₹1,999 for 3 months ([App Store IN](https://apps.apple.com/in/app/naukri-job-search-app/id482877505)); Teal $29 ([tealhq](https://www.tealhq.com/pricing)) | Momentum 90-day pass |
| **Mid / senior** | Targeted companies, prep, salary | ₹2,000–15,000 per search | $100–600 per search | Topmate mock interview median ₹809 ([topmate](https://topmate.io/s/mock-interviews)); interviewing.io $179+ **[U]** | Land Focus plus human sessions |
| **Laid off / urgent** | Speed, structure, many companies | ₹5,000–25,000 per 30–90 days | $150–1,500 | 27.1% of unemployed out 27+ weeks ([BLS](https://www.bls.gov/web/empsit/cpseea12.htm)) | Land Sprint 30-day or 90-day pass |
| **Relocation / visa** | Hard deadline; companies that sponsor | ₹10,000–60,000 per search | $300–2,500 | OPT allows 90/150 days unemployed ([DHS](https://studyinthestates.dhs.gov/sevis-help-hub/student-records/fm-student-employment/unemployment-counter)) | Sprint or Concierge with research on employers' sponsorship history; no immigration advice |
| **"Referral at any cost"** | Most parallel attempts, best prep, human help | ₹10,000–60,000+ per search | $500–3,000+ | Find My Profession $1,500–3,000 a month ([findmyprofession](https://www.findmyprofession.com/)); Topmate sells "referrals" for ₹5–1,500, one listing at $500 ([topmate](https://topmate.io/s/referral)); scammers charge ₹1,000 "reviews" over UPI ([Decode](https://www.decodeinternet.in/decode/linkedin-job-scams-fake-resume-reviews-upskilling-trap-job-seekers-fake-job-offers-recruitment-fraud-26455)) | Concierge by application, human sessions, a published "what money can't buy" policy |

People pay this much because referrals work. Referred applicants reach interview **40% of the time vs 3%** for inbound applicants ([Ashby, 2025-05-16](https://www.ashbyhq.com/talent-trends-report/reports/referrals)).

## 3. Recommended plan architecture

**Rules that apply to every paid plan:**
- **Passes end cleanly.** When a pass ends, asks already open stay live until they are answered, passed or expire. Only the limit on *new* asks falls back to the Free cap.
- **90-day passes grant credits in three 30-day cycles.** The ledger already opens monthly cycles inside yearly terms (commit `b356b1d`).
- **Auto-extend** is a checkbox at checkout, at the same price, with a reminder before each renewal. It is offered only where the payment method can renew without extra authentication.
- **Labels:** the "Most chosen" label on Momentum and on the 25-credit pack becomes **"Recommended"** until real purchase data supports the claim.

### 3.1 Plan contents (the same in every region)

| Plan | Open asks | Credits per 30 days | Carryover | Human time included |
|---|---|---|---|---|
| Free | 3 (15 during the 14-day trial, which comes off the public catalog until its trigger is built, D-051) | **3 each UTC month** (no carryover), no welcome credits (D-039) | — | — |
| Keep warm (yearly) | 5 | 4 | 1 month | — |
| Start | 8 | 10 | 1 month | — |
| Momentum | 15 | 36 | 3 months | — |
| Land Focus | 30 | 120 | While any Land pass is active | 1 written review (coming later, D-041) |
| Land Sprint | 50 | 300 | Same | 1 written review + 1 live session (coming later, D-041) |
| Land Concierge (by application) | **75** (was unlimited) | 1,000 | Same | **6 human hours** (18 per 90 days) |

**What credits buy (AI-made finished work, current costs kept):**

| Tool | Credits |
|---|---|
| Ask rewrite | 1 |
| Profile check | 1 |
| Thank-you pack | 1 |
| Ask One-Pager | 2 |
| Extra open ask for 30 days | 2 |
| Company research | 3 |
| Resume overhaul | 3 |
| Offer comparison | 3 |
| Interview dossier | 4 |
| AI mock interview | 5 |
| Salary coach | 5 |

**Human expert review is removed from the credit system** and sold as a session instead (3.2).

### 3.2 Prices: global USD (Tier 1) and India INR

| Product | USD | INR (GST incl.) | INR ÷ USD | INR net of 18% GST | How it is paid in India |
|---|---|---|---|---|---|
| Free | $0 | ₹0 | — | — | No card or payment method asked |
| First credit pack (never renews) | 5 credits $5 | **2 credits ₹99** | 0.52× | ₹84 | One-time UPI |
| Keep warm, 12 months | $29 | ₹999 | 0.36× | ₹847 | One-time; opt-in UPI AutoPay |
| Start, 30 / 90 days | $8 / $19 | **₹299 / ₹699** | 0.39× | ₹253 / ₹592 | UPI one-time or AutoPay (under ₹5,000) |
| Momentum, 30 / 90 days | **$24 / $59** | **₹999 / ₹2,499** | 0.44× | ₹847 / ₹2,118 | Same |
| Land Focus, 30 / 90 days | $100 / $249 | ₹5,999 / ₹13,999 | 0.63× / 0.59× | ₹5,084 / ₹11,864 | One-time; 30-day auto-extend by card or netbanking only |
| Land Sprint, 30 / 90 days | $200 / $499 | ₹11,999 / ₹27,999 | 0.63× / 0.59× | ₹10,169 / ₹23,728 | Same |
| Land Concierge, 30 / 90 days (by application) | **$750 / $1,990** | ₹34,999 / ₹84,999 | 0.49× / 0.45× | ₹29,660 / ₹72,033 | One-time only |
| Written expert review (within 48 h) | $49 | ₹799 | 0.17× | ₹677 | One-time |
| Live 45-minute session (mock interview or strategy) | $99 | ₹1,499 | 0.16× | ₹1,270 | One-time |
| Credit packs | 5/$5 · 25/$22 · 60/$48 · 150/$105 (unchanged) | 25/₹1,199 · 60/₹2,599 · 150/₹5,999 | 0.57–0.60× | — | One-time UPI |

The 90-day passes cost 2.3–2.65× the 30-day price, a saving of 12–22%. Competitors' quarterly discounts run 9–40%.

**How high INR tiers are sold:**
- The most expensive INR item is **₹84,999**. Nothing reaches ₹1,00,000, the cap on a single UPI payment to a business ([newsonair](https://www.newsonair.gov.in/npci-raises-upi-person-to-merchant-transaction-limit-to-%E2%82%B95-lakh)). Every pass can therefore be paid once by UPI, card or netbanking through Chargebee's hosted checkout with Razorpay.
- **UPI AutoPay** is offered only for items up to ₹5,000. That is Chargebee's default UPI mandate maximum, and it can only be lowered ([Chargebee](https://www.chargebee.com/docs/payments/2.0/razorpay-rbi-e-mandate.html)).
- **Card and netbanking mandates** are offered only up to ₹15,000, the RBI limit for skipping extra authentication ([RBI](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13374)).
- **Land 90-day and Concierge never auto-renew.** The buyer gets reminders 7 days and 1 day before the end, with one-tap re-buy.

**Why these India prices:**
- **Momentum ₹999** matches [Naukri Pro](https://apps.apple.com/in/app/naukri-job-search-app/id482877505) and [Unstop Pro](https://unstop.com/pro). LinkedIn's ₹1,899 is **[U]**.
- **Land sits near 0.6×** to keep a floor under AI and human costs. Duolingo keeps Max at about 0.42× in India for the same reason **[U]**.
- **Concierge is cheaper in India** because Indian human time costs Topmate rates, not US rates.
- **Revenue break-even:** to earn the same per visitor as the draft, the new INR prices need **2.34× (Start), 1.70× (Momentum) and 1.42× (Land)** the draft's conversion. I expect that, because ₹1,699 is above every Indian job-platform Pro plan. It is still a bet, and it gets measured.
- **Display:** always "incl. GST". The regulator fined FirstCry ₹2 lakh for adding GST at checkout ([Medianama, 2025-09-29](https://www.medianama.com/2025/09/223-ccpas-rs-2-lakh-fine-firstcry-e-commerce-discount/)). Label the price "India price". A struck-through USD reference is allowed only because that price is genuinely offered elsewhere (`research/ppp-pricing-policy.md`).

### 3.3 Regional tiers

| Tier | Markets | Multiplier (Start, Momentum / Land / credits) | Currency and payment | Start 30d | Momentum 30d / 90d | Keep warm | Focus / Sprint / Concierge 30d | Smallest pack |
|---|---|---|---|---|---|---|---|---|
| **T1** | US, CA, UK, IE, DE, FR, NL, BE, AT, Nordics, CH, AU, NZ, **SG**, IL, JP | 1.00 / 1.00 / 1.00 | USD. **GBP and EUR use the same number as USD, VAT included**, only after VAT registration | $8 · £8 · €8 | $24/$59 · £24/£59 · €24/€59 | $29 | $100 / $200 / $750 | 5 for $5 |
| **T2** | **UAE**, KSA, QA, KW, BH, OM, PL, CZ, PT, GR, HU, RO, HR, CL, UY | 0.70 / 0.85 / 0.85 | USD (Gulf) and EUR (EU) as Chargebee Price Variants | $5.99 | $16.99 / $39.99 | $19.99 | $85 / $170 / $649 | 5 for $4.49 |
| **T3** | BR, MX, CO, AR, PE, ID, PH, TH, VN, MY, TR, ZA | 0.45 / 0.65 / 0.70 | USD variant (PayPal has no IDR; BRL works only with in-country accounts) | $3.99 | $10.99 / $26.99 | $12.99 | $65 / $130 / $490 | 5 for $3.49 |
| **India** | IN | ≈0.40 / ≈0.60 (Concierge ≈0.47) / ≈0.58 | INR through Razorpay only | ₹299 | ₹999 / ₹2,499 | ₹999 | ₹5,999 / ₹11,999 / ₹34,999 | 2 for ₹99 |
| **T4** | NG, PK, BD, EG, KE, LK, NP, GH | 0.35 with a $2.99 floor / 0.60 / 0.60 | USD. Launch each country only after a payment method is confirmed (PayPal for Nigeria is **[U]**) | $2.99 | $7.99 / $19.99 | $9.99 | $60 / $120 / $450 | 5 for $2.99 |

**How the tiers were set:**
- The bands follow World Bank price-level ratios: India 0.23, Brazil 0.46, UAE 0.69, UK 0.92 ([World Bank](https://api.worldbank.org/v2/country/IND;BRA;IDN;PHL;NGA;ARE;GBR;DEU;USA;FRA/indicator/PA.NUS.PRVT.PP)). They also follow Spotify and Netflix's regional prices.
- In T1, £8 including VAT nets about $8.83, and €8 in Germany nets about $7.52.
- **AED and SGD stay in USD.** No competitor shows local prices there.
  - For reference, the AED peg gives T2 Start ≈ AED 22 and Momentum ≈ AED 62.40.
  - The research has no SGD exchange rate, so SGD is not localized.
  - UAE 5% VAT for foreign digital sellers was not researched **[U]**.

**Guarding against VPN arbitrage:**
- Assign the tier from Cloudflare's `CF-IPCountry` header.
- Lock it to the billing country at checkout.
- Accept INR only with Indian payment methods.
- Send any mismatch between billing country and payment-method country to a review queue.

## 4. How power users spend more without buying referrals

| Paid lever | Price | Why it is safe |
|---|---|---|
| **Breadth:** more open asks across *different* companies (tiers, 2-credit extra ask) | Plan or credits | Every plan has the same limits: no more than **2 open asks per company and 1 per referrer**. Each referrer sees one ask, judged on its own, and never sees the seeker's plan. |
| **Finished AI work:** research, dossiers, AI mock interviews, salary coach | $1 a credit, down to $0.70 in packs | It is preparation for the seeker. Nothing reaches a referrer except the ask the seeker writes and sends. |
| **Human time:** written reviews, live sessions, Concierge hours | $49 / $99 / Concierge | Reviewers are **never employees of the seeker's target company and never SkipWait referrers for it**, and they never contact employees on the seeker's behalf. I reject the India brief's idea of "review by a senior person at the target company", because that is paid insider attention. |
| **Speed and structure:** Sprint and Concierge get a weekly plan, a human kickoff within 24 hours, and check-ins | Land | It changes how fast the seeker prepares, not where they sit in a referrer's queue. |
| **Interview and offer stage:** mock interviews, salary and offer coaching | Credits or sessions | This happens after the referral. |
| **Longer coverage:** repeat passes and 90-day passes | Passes | Buys time, not position. |
| **Gifting credits** to a friend through invite rewards | Packs | The spend goes into another seeker's preparation. Kickresume includes $72 / $120 of friend vouchers in its plans ([Kickresume](https://www.kickresume.com/en/help-center/alternative-to-enhancv/)). |

**Concierge rules:**
- The concierge drafts asks; **the seeker approves and sends them**.
- Human hours are stated up front, and unused hours are refunded pro rata.
- Sold by application only.
- **Not sold to New York or California residents until counsel has reviewed the copy.** NY GBL [§171(2)(c)](https://newyork.public.law/laws/n.y._general_business_law_section_171) and §185 can make a paid service an "employment agency", which may only charge after placement. Cal. Civ. Code [§1812.501](https://codes.findlaw.com/ca/civil-code/civ-sect-1812-501/) covers paid career counselling.

**Never sold:**
- **Referral access:** a referral, or an ask aimed at a named person outside the normal flow.
- **Priority or visibility:**
  - Priority, ordering, "boost", "featured" or badges. Competitors do sell these: Aced's "Priority job referrals" ([aced.io](https://www.aced.io/upgrade)) and Naukri's Priority Applicant from ₹971 ([resume.naukri.com](https://resume.naukri.com/)).
  - Showing a seeker's plan to referrers.
  - Extra nudges sent to referrers.
- **Any money from seeker to referrer:** FindMyReferral charges ₹1,299–2,499 per referral ([findmyreferral](https://www.findmyreferral.com/)).
- **Outcome claims:**
  - Guarantees of a referral, interview or job.
  - Success fees or income-share deals, such as Refer's 20% **[U]** or the Reverse Recruiting Agency's 10% ([Fortune](https://fortune.com/2026/03/25/reverse-recruiting-agency-job-search-ai-applications-cost/)).
  - "Insider access" or "get referred" copy.
- **Misleading pricing:** fake "was" prices or scarcity.

**Fairness proof:** publish a "What money can't buy" page. Track how long referrers take to first view an ask and how often they reply, broken down by plan. These must match across plans.

## 5. How to keep exploring users

- **Free does real work and never asks for a card.** Requiring payment details or auto-debit for a free plan counts as a "subscription trap" ([SCC Online](https://www.scconline.com/blog/post/2023/12/04/ccpa-notifies-guidelines-for-prevention-and-regulation-of-dark-patterns-2023-legal-news/)).
  - Every ask gets a **free quality check**: job URL matches, résumé attached, ask has a clear structure.
  - **2 credits each month**, compared with Naukri's 3 AI attempts in total and Unstop's 3 credits a year.
- **Reverse trial:** after the first ask is sent, the seeker gets 14 days of Momentum's 15 open asks and 5 trial credits, with no card, once per canonical person.
  - Why 14 days: referrers take days to reply, and trials of 17–32 days convert at 42.5% vs 25.5% for trials under 4 days ([RevenueCat](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026.md)).
  - Target: Day-35 paid conversion of 4–6%, against 2.1% for freemium. The target is my estimate.
- **First purchase never renews:** ₹99 for 2 credits (enough for one extra open ask) or $5 for 5 credits.
  - Nothing is priced under $2.99. PayPal's 4.4% + $0.30 fee plus a 3% currency spread already takes 17% of a $2.99 sale ([PayPal IN](https://www.paypal.com/in/webapps/mpp/merchant-fees)).
- **Keep warm** at $29 / ₹999 a year, for employed people who are not actively searching.
- **7-day full refund on a person's first purchase.** LinkedIn's norm is a refund within 7 days if the plan was unused ([LinkedIn Help](https://www.linkedin.com/help/billing/answer/5704)).
- **Nudges** follow `UPGRADE_NUDGES.md` rules: at most one per session per trigger, and dismissals remembered for 7 days.
  - At the open-ask cap, offer the cheapest fix first: "One more ask for 30 days" (2 credits), then "See Start". Today it says "See Momentum". Keep the line "Paying never changes how referrers see your asks."
  - New: "Trial ends in 2 days" and "Pass ends in 3 days", shown once each.
  - Honest anchors only:
    - "₹999 is ₹33 a day."
    - The real 17–22% saving on a 90-day pass.
    - "Paid referral calls elsewhere cost ₹200–₹1,500; asks here are free" ([Topmate](https://topmate.io/s/referral)).

## 6. Comparison with the current draft

| Area | Current draft | Recommended | Why |
|---|---|---|---|
| Billing shape | Monthly, plus yearly at 10× | 30/90-day passes with opt-in auto-extend; yearly only for Keep warm | Searches last 1–3 months. ~30% of annual subscribers cancel in month 1 ([RevenueCat](https://www.revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch.md)). PayPal recurring is unconfirmed. |
| Free | 3 asks, 3 one-time credits | Adds 2 credits a month, a 14-day trial, a free quality check | Freemium converts only 2.1%. Quotas that reset bring people back. |
| Explorer entry | 5 credits for $5 / ₹429 | $5 for 5; **₹99 for 2**; Keep warm | ₹429 costs more than Topmate's median résumé review (₹410) |
| Start | $8 / ₹699; yearly $80 / ₹6,990 | $8 / $19 for 90 days; **₹299 / ₹699** | ₹699 is 0.92× the US price |
| Momentum | $20 / ₹1,699; yearly ₹16,990 | **$24 / $59; ₹999 / ₹2,499** | Global comparables cost $29–40. ₹16,990 needs extra authentication on every renewal. |
| Land Focus / Sprint | $100 / $200; ₹8,499 / ₹16,999 monthly | Same USD plus 90-day passes; ₹5,999 / ₹11,999 paid once | ₹16,999 needs extra authentication on every debit. ₹8,499 is above the ₹5,000 UPI cap. |
| Concierge | $500+ / ₹42,999; unlimited asks | By application, $750 / ₹34,999; 75 asks; 6 hours stated | $500 is below the market for human services. Unlimited asks flood referrers. |
| Human review | 25 credits ($25, about ₹1,900–2,150), Land only | $49 / ₹799 written; $99 / ₹1,499 live | $25 is 7–14× below TopResume ([topresume](https://topresume.com/resume-writing)) |
| INR packs | ₹429 / ₹1,899 / ₹4,099 / ₹8,999 (₹86 per US$) | ₹99 for 2; ₹1,199 / ₹2,599 / ₹5,999 | Keeps the AI-cost floor at ₹40–50 a credit. (The pack mismatch flagged in the research is already resolved in `planCatalog.ts`.) |
| Exchange rate / regions | ₹86 per US$; USD and INR only | ₹95.28, rechecked quarterly; 4 tiers plus India | — |
| Labels / tax / refund | "Most chosen"; GST handling unspecified; no refund rule | "Recommended"; INR always incl. GST; 7-day first-purchase refund | No fabricated claims; consumer law |
| Referrer protection | Copy only | Equal per-company and per-referrer limits, plan hidden, published fairness metric | Selling more open asks is selling volume ([Refer Me sells 40 requests/mo](https://refer.me/pricing)) |

## 7. Risks, measurement and setup

**Risks:**
- India revenue drops if conversion does not reach the break-even levels in 3.2.
- More open asks overloads referrers.
- New York / California law. India's rules for domestic placement fees and overseas recruitment are **[U]**.
- PayPal renewals fail.
- AI cost per credit takes more than 40% of what an India credit nets. An included Start credit nets only about $0.27, and AI mock interviews are the item to watch.
- Not enough human reviewers to meet Concierge commitments.
- Keep warm cannibalizes Start.
- VPN arbitrage.
- GST at 18% after the 22 September 2025 reform is **[U]**. EU and UK VAT apply from the first sale.

**Metrics:**
- Conversion and repeat purchase: Day-35 free-to-paid; trial-to-paid; first-purchase rate; share of pass buyers who buy again or extend.
- Revenue: revenue per paying user, by tier.
- Refunds: compare with 7.7% for India/SEA and 3.4% for North America ([PricePush summary](https://pricepush.app/blog/revenuecat-sosa-2026-pricing-localization-insights) **[U]**).
- Concierge: application-to-purchase rate.
- Cost and service: AI cost per credit by tool; how often human-review deadlines are met.
- Referrer fairness and load: time to first view and reply rate by plan; asks per referrer per week; referrer pass rate.
- Arbitrage: billing-country mismatch rate.

**Experiments, in order:**
1. A Van Westendorp price-sensitivity survey in India and the US.
2. Reverse trial vs no trial: 50/50 split by canonical person, run for 4 weeks.
3. Momentum $24 vs $29 in T1. Run these as **back-to-back 2-week cohorts**, so no two people see different prices at the same time.
4. India Land Focus at ₹5,999 vs ₹7,999.
5. Concierge at $750 vs $1,000 on the application page.

**Chargebee setup:**
- One item price per plan for each of 30 days, 90 days and each currency.
- Passes are non-renewing subscriptions with billing cycles set to 1 ([Chargebee KB](https://www.chargebee.com/docs/billing/2.0/kb/subscriptions/how-to-create-a-non-renewing-subscription-via-chargebee-ui)). Auto-extend uses the same item price without that limit.
- Packs and human sessions are one-time charges.
- USD Price Variants for T2, T3 and T4: about 45 prices, within the cap of 100 per site.
- Prices include tax for INR, and for GBP/EUR after registration.
- A 4-day grace period while Razorpay renewals are "pending confirmation".
- Catalog code changes: an interval for 30 days and 90 days; pack sets that differ by currency; Free at 2 credits a month; Concierge capped at 75 asks; human review removed from credit costs.

**Razorpay setup:**
- Ask Chargebee Support to enable the e-mandate workflow (about a week).
- Confirm whether the UPI cap on our account is ₹5,000 or ₹15,000; Chargebee's docs give both.
- Use one-time UPI for every pack and pass.
- Do not enable international cards on the account that sells INR prices.

**PayPal setup (P0):**
- Confirm reference transactions, which PayPal must approve to store payment methods, then test a renewal in sandbox. Until that works, USD sells passes as one-time payments only.
- Add a USD card route: Stripe (Chargebee lists it for recurring billing in India) or Razorpay international cards (**[U]** through Chargebee). Or use a merchant of record, which also handles EU/UK VAT; Chargebee's Reach is in private beta.
- Use sandbox and test modes only. No real-money tests.

## 8. Open questions for the founder

1. Does SkipWait bill from an Indian entity? We need a CA's opinion on whether 18% GST still applies, and whether foreign sales count as exports or as an "intermediary" service (the latter would make them taxable at 18%).
2. What does each credit cost us, tool by tool? This sets the INR credit floor and decides whether Free can afford 2 credits a month.
3. Who delivers human sessions and Concierge, at what hourly cost? Can contracts stop reviewers from reviewing asks to their own employer?
4. Do the limits of 2 open asks per company and 1 per referrer exist today? If not, they must ship before any plan adds more asks.
5. Are any yearly or Land item prices already live with buyers? (The second half, how legacy subscribers move to passes, is answered by D-067: there were none, and the legacy plans are removed completely with no migration.)
6. How long does an open ask stay live after a pass ends (the expiry sweep window)?
7. For the EU and UK: register for VAT (EU non-Union OSS and HMRC), use a merchant of record, or block checkout until then?
8. Are you comfortable with Concierge at $750 by application, and holding it back from New York and California residents?
9. Should student or campus pricing be part of the launch?
10. Should Start and Momentum in INR default to UPI AutoPay renewal rather than passes?