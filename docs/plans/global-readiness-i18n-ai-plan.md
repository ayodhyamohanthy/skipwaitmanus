# Global readiness, i18n foundation, AI-in-UI wiring (build desk plan)

Owner steers Oct 21 3:13-3:15 IST (D-091, D-092): global is the north star; "let users use the platform in their own language" (pre-approved); "use intelligence in UI" (pre-approved, suggestions only, honest labels, fallbacks); everything ships fullstack in the same slice.

## 1. Global-readiness audit (repo, Oct 21)

| Area | State today | Gap / first step |
| --- | --- | --- |
| Currency & price books | Two regions (shared/billingRegion.ts): IN -> INR via Razorpay, INTL -> USD via PayPal; region from edge CF-IPCountry, locked to billing country at checkout; VPN-arbitrage guard in the Worker; GST wording switches on registration (D-007) | One global USD price, no PPP books. Pricing is frozen (D-056): any PPP work is research-only until the owner unfreezes. |
| Work-email verification | Consumer-domain detection is already global (shared/const.ts): country-TLD families (yahoo.co.uk), intl providers (qq, 163, naver, yandex, gmx, zoho, rediff), subdomain sweep | No parent/subsidiary concept in company domains: a multinational's country domains (amazon.co.uk vs amazon.com) attach to one company record manually. First step: canonical-company mapping in the demand-list canonicalization work (D-086). |
| Privacy / GDPR | Privacy-requests flow exists (AdminPrivacyRequests) | Region-aware consent and data-residency rules not mapped. First step: inventory what the privacy flow covers vs GDPR/CCPA rights; one-page gap note. |
| Localisation hooks | displayPrefs: account+device time zone, dmy/mdy/iso dates, Intl-based formatting | Numbers render mono with no locale grouping; currency display follows billing region only; all copy hardcoded English outside goal-UI surfaces. |
| Company data | Directory seed is mixed India/global; schema has no India-only fields | Demand-list canonicalization must not assume Indian naming/TLDs. |
| Emails | server/emailDelivery.ts: hardcoded English subjects/bodies | Move to the string catalogue with the user's locale. |

## 2. i18n foundation (fullstack, first slice: goal-UI surfaces)

- **Catalogue:** content.json already centralizes the goal-UI copy (304 leaf strings). Split it into `shared/i18n/<locale>.json` with identical keys; English is the fallback. A CI pin fails a locale with missing/extra keys.
- **Runtime:** a small `useT(surface)` resolver (no new dependency); plurals via Intl.PluralRules; fallback chain locale -> en.
- **Formats:** extend displayPrefs with `locale`; add formatNum/formatMoney on Intl.NumberFormat (currency from billing region, never from locale).
- **Detect + override:** navigator.language first, account preference wins (signed in), picker placement per designer; language names in their own language.
- **Language order (proposal; growth ranks with evidence):** Wave 1 Hindi, Telugu, Tamil, Kannada, Odia. Wave 2 Spanish, Portuguese, French, German, Arabic (proves RTL). Wave 3 by market sequence.
- **Accuracy:** machine draft + human review gate for trust/money/legal copy (payments, credits, terms, referral promises) - never raw machine text there. Locked glossary (skipwait.me, credits, passes).
- **RTL:** goal CSS is mostly flex/grid; audit for physical Tailwind classes (ml-, pl-, text-left); dir=auto on user-generated content; Arabic in wave 2 is the proof.
- **Tests:** pseudo-locale (elongated strings) render check at 390px; catalogue key-parity pin; snapshot per locale for the trust/money strings.
- **Data:** users.locale column (backward-compatible default null = en); emails/notifications render in the account locale.
- **Connects to:** content.json, every surface, emailDelivery, SEO pages (hreflang later), displayPrefs.

## 3. AI-in-UI wiring + cost guard (build part; placements per designer)

- Provider: Bedrock plan stands (aws4fetch SigV4 -> bedrock-runtime.us-west-2 converse, Claude Haiku 4.5; precedence Bedrock -> AI_PROVIDER -> Forge -> template). Waiting on owner + AWS access (IAM bedrock:InvokeModel*, us-west-2 model access, Activate-credit confirmation).
- Cost guard: feature flag per placement; signed-in only; per-user daily call cap; identical-prompt cache (job-link parse); template fallback stays the default path on any failure (today's silent-degradation chain becomes the designed fallback, never a user-facing error).
- Money: credits only, no cash; model spend tracked per feature; kill switch per placement.
- Placements (designer picks 2-3): reasons coach (honest, never invents achievements), job-link auto-fill, plain-language status help.
