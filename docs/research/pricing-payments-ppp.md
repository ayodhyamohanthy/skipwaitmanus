# SkipWait payment and regional pricing: constraints and recommended tiers

All sources were seen on 2026-10-14. FX basis: ECB reference rates for 2026-10-13 [24] give **₹95.28, R$5.02, Rp17,881, ₱62.77, £0.755 and €0.894 per US$**. AED is pegged at 3.6725 per US$ (per the World Bank FCRF series [26]). NGN is about ₦1,328 per US$ (NFEM, 2026-10-02 [25]). A separate press report puts the rupee at ₹95.46 per US$ on 2026-08-25 [41].

**Assumption:** SkipWait bills from an Indian entity. This follows from the domestic Razorpay merchant account and the live Chargebee site configured in `research/chargebee-gateway-routing-audit.md` [42].

## Summary

1. **The INR draft is effectively not regionally priced.** It assumes ₹86 per US$, but the rupee is now about ₹95.28. At that rate ₹699, ₹1,699, ₹8,499, ₹16,999 and ₹42,999 come to **0.92x, 0.89x, 0.89x, 0.89x and 0.90x of the US price**. Indian consumer subscriptions are priced at 0.10x to 0.25x of their US price.
2. **Three hard ceilings apply to Indian recurring billing:**
   - **₹5,000:** the default UPI mandate maximum in Chargebee plus Razorpay. It can only be set lower.
   - **₹15,000:** the RBI limit per debit without extra authentication (called AFA).
   - **₹25,000:** Razorpay's UPI maximum for "as presented" mandates.

   Under the draft, Momentum yearly (₹16,990), Land Sprint (₹16,999) and Land Concierge (₹42,999) would need the customer to authenticate on every renewal.
3. **Global renewals through PayPal are unconfirmed (P0).** PayPal can only store a payment method for recurring charges in its listed markets, and India is not listed. That storage also needs PayPal to approve "reference transactions". Chargebee lists only Razorpay and Stripe for recurring billing in India, and it no longer onboards new customers onto PayPal Express Checkout. The live site has **no USD card route**.
4. **EU and UK VAT apply from the first sale** to consumers for a non-EU or non-UK seller. Chargebee calculates tax but does not file it, unless you use Reach, its merchant-of-record service, which is in private beta.
5. **Recommendation:** four regional tiers, with smaller discounts on the higher plans. The discount is deepest on Start and Momentum, which keeps "just exploring" users. It is shallower on Land and credits, which keeps power users and covers AI and human costs. India Land Sprint and Concierge become prepaid time-boxed passes kept at or under ₹15,000 per debit, or paid as one-time payments.

---

## 1. RBI e-mandates and UPI AutoPay

| # | Constraint | Value | Source |
|---|---|---|---|
| R1 | RBI "Digital Payments – E-mandate Framework, 2026", RBI/DPSS/2026-27/396, dated 21 Apr 2026, effective immediately. It covers cards, prepaid instruments and UPI, domestic or cross-border, and repeals the 2019–2024 circulars. | — | [1][2] |
| R2 | Recurring debits can skip AFA **up to ₹15,000 per transaction**. Anything above that "shall be subject to AFA". | ₹15,000 | [1] |
| R3 | The higher ₹1,00,000 limit applies **only** to insurance premiums, mutual funds and credit card bill payments. SkipWait does not qualify. | ₹1,00,000 | [1] |
| R4 | Registration, the first transaction, any change, any withdrawal and any opt-out all require AFA. Mandates can be fixed or variable, and the customer can set a maximum. | — | [1][2] |
| R5 | The bank sends a pre-debit notice **at least 24 hours before** each debit, naming the merchant, amount, date, mandate reference and reason. The customer can opt out of a single debit. | 24 h | [1][2] |
| R6 | Customers cannot be charged for using e-mandates. | ₹0 | [2] |
| R7 | Razorpay UPI AutoPay limits: ₹15,000 per debit by default (₹1,00,000 for selected merchant categories). Mandate maximum for other categories is **₹25,000 for "as presented"** and ₹1,00,000 for fixed frequencies. Razorpay says AFA "applies across all Recurring Payment methods". | ₹15k / ₹25k | [6][7] |
| R8 | Razorpay locks `max_amount` when the mandate is registered. Raising a price above it **requires a new mandate**. | — | [7] |
| R9 | UPI apps that support mandates above ₹15,000: Google Pay, Paytm and Amazon Pay. **PhonePe and BHIM do not.** | — | [5][6] |
| R10 | Chargebee plus Razorpay supports cards, UPI mandates and netbanking e-mandates, **in INR and on Indian-issued cards only**. | — | [3][4] |
| R11 | **In Chargebee, the default UPI mandate maximum is ₹5,000** and netbanking is ₹10,00,000. Custom limits can only be "below the default maximum". | ₹5,000 | [4] |
| R12 | Chargebee registers card mandates at ₹15,000 maximum with "sporadic" frequency. Debits above ₹15,000 need AFA during the pre-debit notice, and not every bank supports this. Recovery is a dunning "Pay Now" link. | — | [4] |
| R13 | Renewal confirmation can take **up to about 3 extra days** (a debit due on the 1st may confirm on the 4th). The e-mandate workflow must be enabled through Chargebee Support, which coordinates with Razorpay (about 1 week). 3DS is required. | +3 days | [4] |
| R14 | Netbanking is not available in the Gateway JS or Razorpay Checkout integration modes. Domestic and import modes need separate Razorpay merchant accounts. | — | [3] |

**How the INR draft fits these limits:**

| Plan (draft) | Monthly | UPI mandate (≤₹5k) | Card/netbanking without AFA (≤₹15k) | Yearly at 10x | Yearly fit |
|---|---|---|---|---|---|
| Start | ₹699 | Yes | Yes | ₹6,990 | No UPI. Card OK |
| Momentum | ₹1,699 | Yes | Yes | ₹16,990 | **AFA on every renewal** |
| Land Focus | ₹8,499 | **No** | Yes | ₹84,990 | AFA |
| Land Sprint | ₹16,999 | No | **AFA every month** | — | AFA |
| Land Concierge | ₹42,999 | No (also over ₹25k) | **AFA every month** | — | AFA |

What this means:
- Any renewal above ₹15,000 effectively becomes a manual payment through a dunning link.
- Entitlements should allow a grace period of at least 4 days while a renewal is "pending confirmation" [4], so open asks are not cut off.

## 2. Chargebee multi-currency and PayPal

| # | Constraint | Source |
|---|---|---|
| C1 | One plan can be priced in many currencies, with a price point per currency and billing frequency. **The currency of an existing subscription cannot change**: you cancel and recreate it. Coupons and credits must match the invoice currency. | [9] |
| C2 | Several prices in the **same currency** (for example "USD for a lower-price tier") need **Price Variants**. There is a cap of **100 per site**. Variant changes are "not fully supported in the self-serve portal". | [10] |
| C3 | Not every gateway handles every currency. Each enabled currency needs a gateway that can process it. | [9] |
| C4 | PayPal Express Checkout needs **reference transactions**, which PayPal approves "usually takes some time". Chargebee is **"not onboarding any new customers for PayPal Express Checkout"**. It works on hosted pages only (Minimal, Elegant or Inspire themes), with no iframe. 22 currencies are shared with Chargebee, and BRL and MYR need an in-country PayPal account. | [11] |
| C5 | PayPal Commerce/Wallet recurring billing stores the payment method in PayPal's vault. If the customer pays in a currency not configured on the Chargebee site, the invoice is voided. | [12] |
| C6 | PayPal's markets for storing payment methods are US, CA, the EU/EEA, UK, AU, SG, HK, JP and CN. **India is not listed.** Storing PayPal "requires reference transaction approval". | [14] |
| C7 | Chargebee states: "The gateways that are supported for recurring businesses in India are RazorPay and Stripe" (an RBI constraint). | [13] |
| C8 | PayPal currencies: 25. **No INR, IDR, NGN or AED.** PHP is supported. BRL is only for in-country accounts. | [15] |
| C9 | PayPal fees for an Indian merchant (page last updated 2024-03-28): **4.40% + $0.30, €0.35 or £0.20** per transaction, plus a **3.0%** conversion spread. Indian accounts can receive international payments only. | [16] |
| C10 | The live Chargebee site routes USD only through PayPal Express (`Paypal-1`). There is **no USD card gateway**. | [42] |
| C11 | Razorpay Subscriptions can bill **international cards** in about 100 currencies and settles in INR. UPI and e-mandates are INR only. Chargebee's "export-enabled domestic" mode allows this. Recurring international-card billing **through Chargebee** is unverified. | [3][8] |

**Effective PayPal plus FX cost** (my calculation from C9):

| Price | Total cost |
|---|---|
| $20 | 8.7% |
| $8 | 10.9% |
| $3.99 | 14.6% |
| $2.99 | 17.0% |
| $2.49 | 19.0% |
| $29.90 yearly | 8.2% |

The fixed $0.30 fee is why low-priced regions need a price floor and yearly billing by default.

## 3. How regional pricing works in practice

**Spotify, Premium Individual or Standard, monthly after any introductory offer** (official country pages [17]):

| Market | Local price | US$ | vs US $12.99 |
|---|---|---|---|
| India | ₹139 (Standard). Prepaid year ₹1,390, **does not auto-renew** | 1.46 | **0.11x** |
| Nigeria | ₦1,600 | 1.20 | 0.09x |
| Philippines | ₱169 | 2.69 | 0.21x |
| Indonesia | Rp59,900 (Standard) | 3.35 | 0.26x |
| Brazil | R$23.90 | 4.76 | 0.37x |
| UAE | AED 23.99 (prepaid year AED 239) | 6.53 | 0.50x |
| Germany | €12.99 (includes VAT) | 14.53 | 1.12x |
| UK | £12.99 (includes VAT) | 17.21 | 1.32x |

**Netflix, cheapest to most expensive plan** (official country pages [18]; US prices from a 2026-03-27 report of $8.99 to $26.99 [19]):

| Market | Range | vs US (lowest / Premium) |
|---|---|---|
| India | ₹149–₹649 | 0.17x / **0.25x** |
| Nigeria | ₦2,500–₦8,500 | 0.21x / 0.24x |
| Philippines | ₱169–₱619 | 0.30x / 0.37x |
| Indonesia | Rp54k–Rp186k | 0.34x / 0.39x |
| Brazil | R$20.90–R$59.90 | 0.46x / 0.44x |
| UAE | AED 35–71 | 1.06x / 0.72x |
| Germany | €6.99–€21.99 | 0.87x / 0.91x |
| UK | £7.99–£20.99 | 1.18x / 1.03x |

**YouTube Premium:**
- US individual is $15.99 (report of 2026-04-10 [20]).
- India is ₹149, or **0.10x**. This comes from a 2024-08-27 report [21]; I found no confirmed 2026 India change.
- Other markets: unverified.

**LinkedIn Premium Career:**
- US is $29.99 or $39.99 per month; secondary sources conflict [23].
- **No official INR price found (unverified).**

**Duolingo:**
- Secondary summaries of the Q1 2025 earnings call say Max costs about **$70 a year in India** against about $168 a year in the US, or about 0.42x. Management said the price is kept high because of AI costs [22].
- This is unverified, but it is a useful pattern: tiers with heavy AI or human costs keep a price floor.

**World Bank price-level ratio** (household-consumption PPP ÷ market FX, 2025 [26]):

| Market | Ratio |
|---|---|
| Nigeria | 0.21 |
| India | 0.23 |
| Indonesia | 0.31 |
| Philippines | 0.36 |
| Brazil | 0.46 |
| UAE | 0.69 |
| Germany | 0.81 |
| France | 0.83 |
| UK | 0.92 |

**What the established practice looks like:**
- **Group countries into 3 or 4 bands** rather than pricing every country separately.
- **Round to local price points.** In euro and sterling markets, use the same numeral as the US dollar price, with VAT included.
- **Guard against arbitrage** by requiring a local payment method or billing country. Paddle supports country-level price overrides inside a shared currency [27], and practitioner guides recommend banding plus VPN controls [28].
- Uplift claims for localized pricing (often "+30%") are vendor marketing and **unverified**, so test before committing.

## 4. Tax

| # | Constraint | Source |
|---|---|---|
| T1 | India: online and SaaS services are generally taxed at **18% GST**. The 22 Sep 2025 reform moved goods and some services to 5%/18%/40%, and I found no change for these services (no official notification confirms 18% specifically). | [35] |
| T2 | Show Indian prices **with GST included**. The CCPA Dark Patterns Guidelines (in force 30 Nov 2023) ban "drip pricing", meaning price elements not revealed upfront. | [37] |
| T3 | Sales to foreign customers can be zero-rated exports under IGST s.2(6)/s.16 if all five conditions hold, including payment in convertible foreign exchange. Exporting without paying IGST requires an LUT (Form RFD-11) filed every financial year. **Risk:** if SkipWait is classed as an "intermediary" (matching seekers to referrers), place of supply is India and 18% applies to foreign customers too. Get a CA opinion. | [36] |
| T4 | EU: a seller not established in the EU registers for the **non-Union OSS** to sell services to EU consumers. **The €10k threshold applies only to EU-established sellers**, so registration is needed from the first sale (EC page, plus secondary sources). Prices to consumers must include taxes (CRD Art. 6(1)(e); Directive 98/6/EC). | [33][39] |
| T5 | UK: an overseas business must register "regardless of taxable turnover". The £90,000 threshold applies only to UK businesses. The DMCC Act drip-pricing ban has been in force since 6 Apr 2025, with CMA price-transparency guidance from 18 Nov 2025. Fines go up to 10% of turnover. | [34][38] |
| T6 | Chargebee: tax-inclusive or tax-exclusive can be set **per currency**, with an override per country and per customer (some of this from search summaries). There is native EU VAT (VIES) and UK VAT (HMRC) number validation. **But** the EU VAT page still refers to MOSS (rates last updated 2019-05-29) and assumes an EU-incorporated seller. Avalara is available. | [29][30][31] |
| T7 | Chargebee **does not file or remit tax** unless you use **Reach** (merchant of record; Avalara; regions NA/EU/AU/Asia/Africa). Reach is a **private beta**, and Brazil tax calculation is not supported. | [32] |

---

## 5. Recommended regional tiers

### Multipliers against the US price

| Tier | Markets (initial list) | Start / Momentum | Land (Focus / Sprint / Concierge) | Credit packs | Currency and payment rail |
|---|---|---|---|---|---|
| **T1 Global** | US, CA, UK, IE, DE, FR, NL, BE, AT, Nordics, CH, AU, NZ, SG, IL, JP | **1.00** | **1.00** | **1.00** | USD; **£/€ at the same numeral as US$, VAT included** (£8 nets about $8.83; €8 in DE nets about $7.52) |
| **T2 Upper-middle** | UAE, KSA, QA, KW, BH, OM, PL, CZ, PT, GR, HU, RO, HR, CL, UY | **0.70** | **0.85** | **0.85** | USD (Gulf), EUR (EU), using Chargebee Price Variants |
| **T3 Emerging** | BR, MX, CO, AR, PE, ID, PH, TH, VN, MY, TR, ZA | **0.45** | **0.65** | **0.70** | USD variant through PayPal (no IDR or NGN; BRL only for in-country accounts) |
| **T4 PPP-deep** | **India (INR, Razorpay)**, NG, PK, BD, EG, KE, LK, NP, GH | **0.25 (India) / 0.30–0.37 (USD; $2.99 floor)** | **0.60** | **0.60** | INR through Razorpay; others USD with a **$2.99 floor and yearly billing by default** |

**How the bands were set:**
- **T4** follows India and Nigeria benchmarks (Netflix 0.17–0.25, World Bank ratio 0.21–0.23).
- **T3** follows Brazil, Indonesia and the Philippines (Netflix 0.37–0.46, World Bank ratio 0.31–0.46).
- **T2** follows the UAE (Spotify 0.50, Netflix 0.72, World Bank ratio 0.69).
- **T1** follows the UK and Germany (Netflix 0.91–1.18).

**Why Land gets a smaller discount:**
- People who "want a referral at any cost" are high-intent. I am assuming they are less price-sensitive than entry users; this is a hypothesis to test.
- Human concierge and expert review have a cost floor, as with Duolingo Max in India.
- India's ₹15,000 debit ceiling caps how far the monthly price can usefully rise anyway.

### Prices in each tier (monthly; yearly is 10x unless noted)

| Plan | T1 | T2 | T3 | T4 in USD | **India (INR, GST included)** |
|---|---|---|---|---|---|
| Start | $8 / £8 / €8 | $5.99 | $3.99 | $2.99 (default $29.90/yr) | **₹199** (0.26x) · yr ₹1,990 |
| Momentum | $20 / £20 / €20 | $13.99 | $8.99 | $5.99 | **₹499** (0.26x) · yr **₹4,990** |
| Land Focus | $100 | $85 | $65 | $60 | **₹5,999** (0.63x) |
| Land Sprint | $200 | $170 | $130 | $120 | **₹11,999** (0.63x) |
| Land Concierge | $500+ | $425 | $325 | $300 | **₹29,999 per 30-day prepaid pass** (0.63x) |
| Credit packs 5/25/60/150 | $5/$22/$48/$105 | 0.85x | 0.70x | 0.60x | **₹299 / ₹1,299 / ₹2,799 / ₹5,999** |

**How the India prices fit the payment limits:**
- **Start and Momentum** (monthly and yearly) all fit within the ₹5,000 UPI default, so UPI AutoPay works without any Chargebee limit change. ₹499 is deliberately set so the ₹4,990 yearly price fits.
- **Focus and Sprint** stay at or under ₹15,000 per month, so card and netbanking mandates renew without AFA.
- **Concierge and all Land yearly plans** should be **prepaid passes that do not auto-renew**. This matches Spotify's and YouTube's Indian prepaid plans. A one-time UPI payment allows up to ₹1,00,000 [8], or use direct Razorpay Orders.

**Net of 18% GST:**

| Plan | Net per month | vs US |
|---|---|---|
| Start ₹199 | $1.77 | 0.22x |
| Momentum ₹499 | $4.44 | 0.22x |
| Land Focus ₹5,999 | $53.36 | 0.53x |

**Pricing test to run:** Land Focus at ₹5,999 against ₹7,999. Both are below ₹15,000. This measures how much "at any cost" demand exists in India.

**Credit-cost check:**
- India Start works out to about ₹17 net per included credit.
- Check that the cost of delivering each credit stays at or below about 40% of the regional credit revenue. Mock interviews are the item to watch.
- Human expert review (25 credits) should stay at the 0.6x credit floor in every tier.

### Guarding against VPN arbitrage, and how to implement it in Chargebee

1. Assign the tier on the server from the Cloudflare `CF-IPCountry` header. Pass the matching price variant's `item_price_id` to hosted checkout.
2. Lock the tier to the **billing country at signup**. On the Chargebee webhook, check it against the card or PayPal country, and send mismatches to a review queue.
3. The INR price can only be paid with Indian payment methods. Do **not** turn on international cards on the same Razorpay account that sells INR prices; use a separate route.
4. Show the regional price as an "India price" or "regional price", never as a sale. This matches `research/ppp-pricing-policy.md`.
5. A customer who moves country keeps their price until they re-subscribe, because a subscription's currency cannot change (C1).

### P0 items to verify before launch (no real-money tests)

1. **PayPal recurring billing for an Indian merchant account.** Confirm reference transactions or vault access with PayPal merchant support, then test a renewal in sandbox. If it isn't available, global renewals will fail. Fallbacks:
   - Razorpay international cards in export mode (confirm Chargebee supports recurring billing on them),
   - Stripe (Chargebee lists it for India recurring), or
   - a merchant of record (Paddle, or Chargebee Reach in beta). This also handles EU and UK VAT.
2. **Add a USD card route.** Today only PayPal wallet checkout is configured (C10).
3. **Ask Chargebee Support** to enable the Razorpay e-mandate workflow, and ask whether the ₹5,000 UPI maximum can be raised (the docs say it can only go lower).
4. **EU OSS and UK VAT.** Register under the EU non-Union OSS and with HMRC before taking EU or UK consumer payments, or block those sales until then. Get a CA opinion on GST export versus intermediary classification. Set Chargebee prices to tax-inclusive for INR, EUR and GBP.
5. **Update the INR catalog** from the ₹86 per US$ assumption, and re-check prices at least once a quarter against ECB rates.

### Not verified
- LinkedIn Premium price in India.
- YouTube Premium prices in 2026 outside the US.
- Duolingo's regional prices (secondary sources only).
- Whether netbanking e-NACH falls outside the RBI framework's ₹15,000 limit. Razorpay says AFA applies to all its methods, so I assumed it does.
- Whether Nigerian payers can use PayPal.
- Razorpay's fees.
- US state sales tax on SaaS, and UAE (5%) and Saudi (15%) VAT for foreign sellers of digital services. These were not researched.

---

## Sources (all seen 2026-10-14)

[1] https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13374 · [2] https://taxguru.in/rbi/rbi-issues-consolidated-directions-digital-payments-e-mandate-framework-2026.html · [3] https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/razorpay · [4] https://www.chargebee.com/docs/payments/2.0/razorpay-rbi-e-mandate.html · [5] https://www.chargebee.com/docs/payments/2.0/kb/billing/razorpay-upi-autopay-supported-applications-and-their-handles · [6] https://razorpay.com/docs/payments/subscriptions/supported-banks-apps/?preferred-country=IN · [7] https://razorpay.com/docs/payments/recurring-payments/overview/integrate · [8] https://razorpay.com/docs/payments/subscriptions/faqs/?preferred-country=IN (from search excerpt) · [9] https://www.chargebee.com/docs/billing/2.0/site-configuration/multi-currency-pricing · [10] https://www.chargebee.com/docs/billing/2.0/product-catalog/variant-pricing-overview · [11] https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/paypal_express_checkout · [12] https://chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/paypal-wallet · [13] https://www.chargebee.com/docs/payments/2.0/kb/billing/how-to-set-up-paypal-as-an-indian-business · [14] https://developer.paypal.com/docs/checkout/save-payment-methods/during-purchase/orders-api/paypal/ · [15] https://developer.paypal.com/api/rest/reference/currency-codes/ · [16] https://www.paypal.com/in/webapps/mpp/merchant-fees · [17] spotify.com/{in-en,us,br-pt,id-en,ph-en,ng,ae-en,uk,de-en}/premium/ · [18] https://help.netflix.com/en/node/24926 (INR), netflix.com/{br,id-en,ph,ng,ae-en,gb,de-en}/ · [19] https://www.ktvu.com/news/netflix-raising-prices-again-all-plans-how-much-more-youll-be-paying (2026-03-27) · [20] https://9to5google.com/2026/04/10/youtube-premium-us-price-hike/ · [21] https://www.thetechoutlook.com/news/apps/youtube-premiums-price-surge-indian-subscribers-face-up-to-%e2%82%b9110-monthly-hike/ (2024-08-27) · [22] https://sergeycyw.substack.com/p/duolingo-q1-2025-earnings-analysis ; https://nibble-app.com/blog/is-duolingo-max-worth-it (secondary) · [23] https://salesbread.com/how-much-does-linkedin-premium-cost/ (secondary) · [24] https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml · [25] https://www.techeconomy.ng/dollar-to-naira-exchange-rate-today-october-2-2026 · [26] https://api.worldbank.org/v2/country/IND;BRA;IDN;PHL;NGA;ARE;GBR;DEU;USA;FRA/indicator/PA.NUS.PRVT.PP and …/PA.NUS.FCRF · [27] https://developer.paddle.com/build/products/offer-localized-pricing/ · [28] https://docs.tebex.io/creators/growth-and-success/what-is-regional-pricing/regional-pricing-best-practices · [29] https://www.chargebee.com/docs/billing/2.0/taxes/eu-vat · [30] https://www.chargebee.com/docs/billing/2.0/taxes/uk-vat · [31] https://www.chargebee.com/docs/billing/2.0/kb/billing/how-to-configure-inclusive-or-exclusive-taxes-in-chargebee · [32] https://chargebee.com/docs/payments/2.0/others/reach · [33] https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/register-oss_en · [34] https://www.gov.uk/register-for-vat · [35] https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/alerts-hub/2025/09/gst-council-announces-major-rate-rationalization-and-trade-facilitation-measures.pdf ; https://www.india-briefing.com/news/tax-digital-services-oidar-in-india-gst-applicability-and-compliance-22465.html · [36] https://taxguru.in/goods-and-service-tax/procedures-export-lut-refund-igst-gst-regime-analysis.html · [37] https://www.scconline.com/blog/post/2023/12/04/ccpa-notifies-guidelines-for-prevention-and-regulation-of-dark-patterns-2023-legal-news/ · [38] https://www.taylorwessing.com/en/insights-and-events/insights/2025/04/dmcca-drip-pricing ; https://cms.law/en/gbr/legal-updates/price-transparency-guidance-lands-as-cma-launches-first-consumer-law-investigations-using-its-new-dmcc-act-powers · [39] https://eur-lex.europa.eu/eli/dir/2011/83/oj/eng · [41] https://hdfcsky.com/news/rupee-rises-24-paise-to-close-at-95-46-against-us-dollar · [42] /Users/ayodhyarammohanthy/Documents/GitHub/skipwaitmanus-screens/research/chargebee-gateway-routing-audit.md

Scratch calculations: /private/tmp/claude-501/-Users-ayodhyarammohanthy-Documents-GitHub-skipwaitmanus/311864a6-1c6f-48c1-8237-16c6cfacefbc/scratchpad/ratios.py and net.py