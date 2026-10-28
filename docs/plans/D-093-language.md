# Packet D-093-language: people can switch skipwait.me into their own language from a list of language names written in that language, with no flags

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/plans/assignments.json` `D-093-language` (lane `i18n`, register row D-093). This is an **epic packet**: it splits into the subtask rows in §6 (D-223); each subtask writes its line in the Status section below, never the shared row (D-134). |
| Decisions | D-093 (binding, quoted in §2); D-092, D-153, D-180, D-219, D-030/D-049/D-057, D-031, D-204, D-048/D-120/D-150, D-223, D-224, D-059 (its translation answer, superseded by D-093) |
| Risk tier | 2 overall. Rows L1-L3 are Tier 2 (server logic and user flow, one additive column). Row L5 (money, credit, legal and trust strings in another language) is **Tier 1** for review purposes: an independent model reviews every reviewed-copy diff (D-151). |
| Size | L in total, split into S/M rows (§6). No row is larger than M. |
| Implementer | any model, from the row it is handed by the picker. Claude sessions write rulings and revisions to this packet only (D-225). |
| Branch | each row: `agent/<model>/d093-<row slug>` from the latest `origin/main` |
| Depends on | nothing for L1. L2 depends on L1. L3 depends on L2. L4 depends on L3 and on `D-048-F-shell-parts` (it owns `client/src/components/AccountMenu.tsx`). L5 depends on L3 and an owner answer (§12 Q1). L6 depends on L3. L7 (RTL) depends on L3 and owner Q4. |
| Do not run at the same time as | `D-048-dark-mode` (owns `client/index.html` and `GoalMoreMenu.tsx`; L3 touches the `<html lang/dir>` switch); `D-048-F-shell-parts` (owns `AccountMenu.tsx`); `D-222-referral-count-shell` (owns `GoalShell.tsx`); `D-180-a-free-asks-chip` (owns `shared/moneyCopy.ts`, the first strings L5 translates). |
| Verified against | `main` `25ebfd2cdbbc3c4b9ced6f725c3036d8b05afaf9` on 2026-10-28 (register newest entry D-229; row `syncedTo` D-227) |

## 1. Goal

A job seeker in Hyderabad or Bhubaneswar, or a referrer in Bengaluru, can read skipwait.me in Telugu, Odia or Kannada instead of decoding English. Language is chosen by the person, from a list where every option is written in its own script (हिन्दी, not "Hindi"; no flag, because a flag names a country, not a language, and India alone has 22 scheduled languages). A detected browser language is offered once, never forced. Money, credit, legal and trust wording appears in another language only after a human has reviewed it; any string without a reviewed translation shows in English, so nobody ever sees a half-translated promise. This moves the north star (D-010, D-092: the global go-to site) by removing the language barrier at the two steps that decide whether someone gets referred: writing a referral request and deciding on one. Evidence in the register: CSA Research 2020 (76% prefer information in their own language). There is **no SkipWait user language data yet**, so the first slice (L1) only measures, and the language list after the D-093 six is ranked from that data.

## 2. Binding rules (quoted, not paraphrased)

D-093 (2026-10-21, status "approved — sequenced with the goal-UI waves"):

> **Language experience spec (owner 03:15 IST: "Let users use the platform in their own language"; pre-approved under D-091).** Endonym picker, no flags: signed-in account menu + signed-out top-bar text switcher; first list English, हिन्दी, తెలుగు, ଓଡ଼ିଆ, தமிழ், ಕನ್ನಡ. One-time dismissible consent line for a detected language, never a silent redirect (Google Search Central guidance). Choice stored locally, syncs to account on sign-in; signed-out choice wins until an account preference exists; per-user, never inferred from company or country. Logical CSS properties so RTL mirrors; LTR mono numerals with bidi isolation; no fixed-width labels, 30-100% string expansion, 390px verified; Noto Sans per script alongside Instrument Sans and JetBrains Mono. content.json is the catalogue seed: full-sentence keyed strings, ICU plurals, Intl for dates/numbers/currency; prices stay data, never translated. Human-reviewed translations only for money, credit, legal and trust copy; unreviewed languages stay hidden. Arabic (first RTL) ships only after the RTL pass. First: capture browser language + a signup language field and count it (signups by language, signup and first-ask completion by language, fallback-string share).

Affects cell: "Affects every surface, content.json -> shared/i18n catalogue, emails/notifications, SEO, displayPrefs, goal-UI waves sequencing. Plan: docs/plans/global-readiness-i18n-ai-plan.md".

Other binding text this packet obeys:

- **D-180:** "Public terminology is "referral" only … User-facing surfaces, seeker and referrer, use referral vocabulary; the ask/referral split … is internal routing only." Every translation glossary maps the product noun to the language's word for *referral*, never a separate word for "ask" or "credit".
- **D-153 (FROZEN):** "Intent should be reached to users faster anywhere … the promise has to match what actually works." A translated string may not promise more than the English source.
- **D-219 / `docs/PRICING.md`:** prices are data, never translated; currency follows the billing region, never the language (also `global-readiness-i18n-ai-plan.md` §2: "currency from billing region, never from locale").
- **AGENTS.md standing principles:** "Terms/Privacy keep owner-approved legal text unchanged unless the owner approves new wording." → legal pages stay English until the owner approves reviewed translations (§12 Q2).
- **Login rule (D-030/D-049/D-057, FROZEN):** translation changes words only. Sign-in methods, the referrer work-email-code-only rule and `referrerSignInHref()` are untouched; the pins `client/src/pages/loginRule.test.tsx` and `signIn.test.tsx` stay green in English and must not be weakened to pass in another language.
- **D-031 / D-204:** no paid translation service, font CDN or i18n SaaS. Fonts and runtime are free and self-hosted.
- **AGENTS.md §2 package gate:** no new npm dependency without explicit approval and a written reason. This packet proposes **no i18n library** (Intl.PluralRules, Intl.DisplayNames, Intl.NumberFormat are native). Noto fonts need an approval (§12 Q3).
- **D-048/D-120/D-150:** goal UI only; the switcher uses goal primitives and tokens; no flag icons, no Unicode glyph icons, no new colours.

**Superseded, do not build:** D-059's "translation: language preferences only until supply exists" (register line 275: superseded by D-093).

## 3. Current behaviour (verified on `25ebfd2c`)

1. The app ships English only. `client/index.html:2` hard-codes `<html lang="en">`; no `dir` attribute is set anywhere.
2. `client/src/components/settings/RegionPanel.tsx` `deviceRegion()` returns `language: "English"`; `RegionField` renders Language as a read-only one-option `<select>` (comment at the top: "each field lists only what is in effect today: the one shipped language"). `docs/KIT_V4_BUILD_PLAN.md` §3b row 25 records "Currency and language stay read-only (founder-approved cuts)"; D-093 is the newer decision that opens language (not currency).
3. Per-account display preferences exist end to end for time zone and date format only:
   - contract `shared/accountPreferences.ts` (`AccountPreferences = { timeZone, dateFormat }`, null = this device);
   - table `accountPreferences` in `drizzle/schema.ts` (`userId` unique, `timeZone varchar(64)`, `dateFormat varchar(8)`), migration `drizzle/deploy/0088_account_preferences.sql`, boot reconcile entry in `server/schemaReconcile.ts` (`table: "accountPreferences"`);
   - routes `GET/PUT /api/account/preferences` in `server/accountPreferences.ts` (`parsePreferencesPatch` rejects unknown keys with 400 "Unknown setting"; `private, no-store`), wired in `server/_core/index.ts` via `db.getAccountPreferences` / `db.saveAccountPreferences` (`server/db.ts`);
   - client store `client/src/lib/displayPrefs.ts` (`sw:display-prefs` in localStorage for guests, `useSyncExternalStore`), loader `client/src/components/DisplayPrefsSync.tsx` (signed-in: account values replace the local copy; fail-soft).
   This is the persistence path L2 extends; no new table is needed.
4. Copy is hard-coded English in components. The goal-UI copy is centralised in `design/goal-ui/content.json` (752 leaf strings today across `_meta`, `shell`, `screenA`-`C`, `otherStates`, `shareImpact`, `shareWin`, `companySignal`, `claimCompany`), read by `shared/shareImpactCard.ts`, `shared/shareWinCard.ts`, `shared/companySignalCopy.ts`, `client/src/pages/CompanyClaim.tsx` and `ShareImpactCard.tsx`. Money copy lives in `shared/moneyCopy.ts`. There is no `shared/i18n/`, no translation runtime and no i18n dependency.
5. Language signals are read today only for payment routing: `client/src/lib/paymentRoute.ts` `detectPaymentRoute()` reads `navigator.languages` / time zone to pick INR vs USD. Language must never feed back into that (D-093 "never inferred from company or country"; currency from billing region).
6. Fonts: `client/src/index.css` imports `@fontsource/instrument-sans` and `@fontsource/jetbrains-mono` (also IBM Plex Mono for unmoved Kit surfaces); goal tokens `--g-font-sans: "Instrument Sans", system-ui, sans-serif; --g-font-mono: "JetBrains Mono", …` (`index.css` ~line 296). No Indic or Arabic font is loaded; Devanagari/Telugu/Odia/Tamil/Kannada would render in whatever system font the device has.
7. Numerals: `.g-num` (`index.css` ~line 323) renders mono, `white-space: nowrap`, no `unicode-bidi` isolation. `client/src/components/goal/GoalNum.tsx` is the primitive.
8. Physical direction classes remain in goal primitives (counts of `ml-|mr-|pl-|pr-|left-|right-|text-left|text-right` matches): `GoalListRow.tsx` 5, `GoalButton.tsx` 3, `GoalPassReasons.tsx` 3, `GoalShell.tsx` 3, `GoalSearchInput.tsx` 2, and 1 each in `GoalDetailPane`, `GoalDrawer`, `GoalFilterChip`, `GoalLockedPanel`, `GoalMoreMenu`. RTL is not safe yet.
9. Surfaces for the switcher: signed-in account menu is `client/src/components/AccountMenu.tsx` (mounted by `AppShell.tsx` as `menu: <AccountMenu />`), owned by row `D-048-F-shell-parts` (todo). Signed-out top bar is the `<header>` in `client/src/components/goal/GoalStaticFrame.tsx` (the "Sign in" link at ~line 48).
10. Emails: `server/emailDelivery.ts` takes a finished `{ to, subject, html, text }`; subjects and bodies are English strings built by callers. No locale is passed.
11. Analytics: `client/src/lib/clarity.ts` `trackClarityEvent(name)` (consent-gated, sensitive-path guarded). No language is recorded anywhere; there is no server-side language count.
12. Endonym data is available natively: on Node 22 (the repo's runtime) `new Intl.DisplayNames([t], { type: "language" }).of(t)` returns exactly the D-093 list — `en` English, `hi` हिन्दी, `te` తెలుగు, `or` ଓଡ଼ିଆ, `ta` தமிழ், `kn` ಕನ್ನಡ — and `ar` العربية with `new Intl.Locale("ar").textInfo.direction === "rtl"` (verified 2026-10-28). Browser ICU coverage varies, so runtime must not depend on it (§4 R2).

## 4. Target behaviour

Language model and data

- **R1. One language table, in code.** `shared/i18n/languages.ts` exports a readonly list of `{ tag, endonym, englishName, script, dir, status }` where `tag` is a BCP 47 primary tag (`en`, `hi`, `te`, `or`, `ta`, `kn`; `ar` present with `status: "hidden"`), `dir` is `"ltr" | "rtl"`, and `status` is `"live" | "hidden"`. Order is the D-093 order. `en` is always live and is the fallback.
- **R2. Endonyms are static strings, checked against CLDR in a test, never computed at runtime.** The test asserts each `endonym` equals `Intl.DisplayNames([tag]).of(tag)` under Node's full ICU, so a typo fails CI; the browser never needs `Intl.DisplayNames`.
- **R3. A language is offered only when it is `live`.** A language becomes `live` only when its catalogue (R9) has every key of the `reviewed` tier reviewed (R11). Until then the picker does not list it. While only `en` is live the switcher is not rendered at all (no one-option control), so shipping L3/L4 changes nothing visible.
- **R4. Persistence.** `AccountPreferences` gains `language: LanguageTag | null` (null = "use this device's choice"). Additive nullable column `accountPreferences.language varchar(16) NULL` (new migration in `drizzle/deploy/`, next free number at build time, plus the matching `server/schemaReconcile.ts` column entry). `parsePreferencesPatch` accepts `language` only when it is a `live` tag or null; anything else is 400 "Choose a language we offer". The existing 400 for unknown keys stays.
- **R5. Signed-out choice.** Stored in localStorage under the existing `sw:display-prefs` object (new `language` field; `readLocal` validates it against live tags). Storage failure keeps the choice in memory for the tab (same as today's fail-soft).
- **R6. Precedence (D-093 verbatim intent).** (a) Signed in with a saved account `language` → that wins. (b) Signed in, account `language` null, and a local choice exists → the local choice applies **and is written to the account once** (that is "syncs to account on sign-in"; one PUT, idempotent, failure keeps the local choice and shows nothing). (c) No choice anywhere → English. Detected browser language never applies by itself (R7). Language is never derived from company domain, billing region, IP, `CF-IPCountry` or time zone.
- **R7. Detection is an offer, not a switch.** If no choice exists and the first `navigator.languages` entry whose primary tag is `live` and not `en`, the page shows one dismissible line at the top of the content, written **in the detected language with the English beside it** (e.g. "हिन्दी में देखें? · View in Hindi?"), with two text buttons: switch, and dismiss. Either action records `languageOffer: "accepted" | "dismissed"` locally and the line never returns on that device. No redirect, no URL change, no reload (D-093, Google Search Central "avoid automatic redirection based on language").
- **R8. Signup language capture (D-093 "First:").** Before any translation exists, the server records, once per account, the first `navigator.language` seen at account creation (`accountPreferences.signupBrowserLanguage varchar(35) NULL`, write-once, BCP 47 validated by `Intl.getCanonicalLocales`, never shown to anyone, never used to pick a language) and the D-093 "signup language field": an optional question in the existing onboarding step, "Which language do you prefer to read in?", answers = the endonym list including not-yet-live languages plus "Other", stored as `accountPreferences.preferredLanguageAnswer varchar(16) NULL`. Answering a not-yet-live language does not change the UI; it is a demand signal only. Optional, skippable, no default selected.

Catalogue and runtime

- **R9. Catalogue.** `shared/i18n/en.json` is generated from `design/goal-ui/content.json` (the seed) plus strings migrated surface by surface; keys are stable dotted paths (`shell.nav.requests`), values are **whole sentences** (never concatenated fragments), plurals as ICU-style `{count, plural, one {…} other {…}}` resolved with `Intl.PluralRules`, variables as `{name}`. Each other language is `shared/i18n/<tag>.json` with a subset of the same keys. `content.json` stays the design source; the generator (a script in `scripts/`) is the only writer of `en.json` (AGENTS "fix generators, not generated output").
- **R10. Resolver.** `shared/i18n/t.ts` exports `createT(tag)` → `t(key, vars?)`: chain `tag → en`; a missing key in `en` throws in tests and returns the key in production with one Sentry event per key per release (no silent failure). A React hook `useT()` in `client/src/lib/i18n.ts` reads the current tag from the display-prefs store. No new dependency.
- **R11. Review tiers.** Every key carries a tier in `shared/i18n/tiers.json`: `reviewed` (money, credit/referral counts, prices labels, checkout, refunds, legal, trust and safety, verification, sign-in, privacy) or `standard`. A non-English value for a `reviewed` key is used only when `shared/i18n/review/<tag>.json` records `{ key, sourceHash, reviewer, date }` and the `sourceHash` matches the current English. If English changes, the translation falls back to English until re-reviewed. Unreviewed `standard` strings may be machine-drafted but a language is still not `live` until every `reviewed` key passes (R3). Reviewer identity is a role or handle only, never personal data (the repo is public).
- **R12. Formats.** Dates/times keep `displayPrefs` `formatDay`/`formatTimeOfDay` behaviour; when `dateFormat` is null they use the chosen language tag instead of `undefined` (device) as the Intl locale. Numbers use `Intl.NumberFormat(tag)` for grouping; **currency code and price amounts come from the server price data and billing region** (D-219), only the number grouping/glyph follows the language. Digits stay Latin (`numberingSystem: "latn"`) in v1 so referral counts and prices match across surfaces (§12 Q5).
- **R13. Document attributes.** When the language changes, `<html lang>` is set to the tag and `<html dir>` to its `dir`. Prerendered public pages (`scripts/prerender-public-pages.tsx`) stay English with `lang="en"` in v1; locale URLs and `hreflang` are out of scope (§5).

Typography, layout, accessibility

- **R14. Fonts.** Each live non-Latin language loads its Noto Sans script font (Devanagari, Telugu, Oriya, Tamil, Kannada; Arabic later) **only when that language is active**, self-hosted, subset by `unicode-range`, `font-display: swap`. Token: `--g-font-sans` becomes `"Instrument Sans", var(--g-font-script, system-ui), sans-serif`; Latin glyphs keep Instrument Sans, numerals keep JetBrains Mono. Delivery mechanism depends on §12 Q3.
- **R15. Bidi and numerals.** `.g-num` gains `unicode-bidi: isolate; direction: ltr`; user-generated text (names, request notes, company names) renders with `dir="auto"`.
- **R16. Expansion.** No fixed widths on labels, buttons, nav items or chips; text wraps. A pseudo-locale `en-XA` (each string +60% length with accented Latin, brackets at both ends) is generated in tests; every migrated surface renders at 390 px and 1280 px with no horizontal scroll and no clipped text.
- **R17. Logical properties.** Goal primitives replace physical direction utilities with logical ones (`ms-/me-/ps-/pe-/start-/end-/text-start/text-end`); `node scripts/design-token-audit.mjs` gains a rule failing physical direction classes in `client/src/components/goal/**` and migrated surfaces.
- **R18. Switcher UI.** A text control, never a flag or globe-only icon: label "Language" + the current endonym (lucide `Languages` icon allowed beside text, `aria-hidden`). Opens a list (GoalSheet on phone, menu on desktop) of live languages, each option the endonym with `lang="<tag>"` on the option element (so screen readers pronounce it correctly) and the English name as secondary text when the current UI language differs. Current one is marked with text + `aria-checked`/`aria-current`, not colour alone. 44 px rows, keyboard: arrows, Enter, Esc, focus returns to the trigger. Signed-out: in the `GoalStaticFrame` header beside "Sign in". Signed-in: a row in `AccountMenu` (after `D-048-F-shell-parts`), plus `RegionPanel`'s Language field becomes this same control. Changing language announces nothing extra; the page re-renders in place, scroll and focus preserved, no reload. No animation (100+/day rule does not apply; it is a rare action: standard 150-250 ms menu motion only).
- **R19. Emails and notifications.** Transactional emails render in the account `language` when the template's keys are live in that language, else English; the subject and body never mix languages. `server/emailDelivery.ts` itself is unchanged; callers resolve copy via `createT`. Emails for signed-out recipients (e.g. work-email OTP before an account exists) stay English in v1.
- **R20. Analytics (counts only, consent-respecting).** Events: `language.offer_shown`, `language.offer_accepted`, `language.offer_dismissed`, `language.changed` (with from/to tag only), `i18n.fallback_string` (sampled, key + tag, no user id). Server aggregate for the admin flow-health panel: signups by `signupBrowserLanguage` primary tag and by `preferredLanguageAnswer`, signup→first-referral-request completion by those tags, fallback-string share by live language. No per-person language list in any admin view; buckets under 3 people show "fewer than 3". No numbers are written into repo docs (D-059 public-repo rule).

## 5. Files

Each row edits only its own paths; the picker's `owns` must be set to exactly these when the rows are registered.

- **L1 measure (Tier 2, S):** `shared/accountPreferences.ts`, `server/accountPreferences.ts`, `server/accountPreferences.test.ts`, `server/db.ts` (only `getAccountPreferences`/`saveAccountPreferences` + one write-once setter), `drizzle/schema.ts` (the `accountPreferences` table only), `drizzle/deploy/<next>_account_language_signals.sql`, `server/schemaReconcile.ts` (the `accountPreferences` entry only), the onboarding question in `client/src/pages/Onboarding.tsx` or its goal successor (whichever owns the signup step on the build day; check `docs/plans/GOAL_UI_COVERAGE.md`), `server/flowBaseline.ts` (aggregate only), `.env.example` only if a flag is added.
- **L2 language table + preference (Tier 2, S):** `shared/i18n/languages.ts`, `shared/i18n/languages.test.ts`, `shared/accountPreferences.ts`, `server/accountPreferences.ts` (+ test), `client/src/lib/displayPrefs.ts`, `client/src/components/DisplayPrefsSync.tsx` (+ tests).
- **L3 catalogue + resolver + document attrs (Tier 2, M):** `shared/i18n/en.json`, `shared/i18n/tiers.json`, `shared/i18n/t.ts` (+ test), `client/src/lib/i18n.ts` (+ test), `scripts/build-i18n-catalogue.mjs` (+ test), `client/src/main.tsx` (switch only: `lang`/`dir` setter), `client/src/index.css` (switch only: `.g-num` bidi, `--g-font-script` token). No visible change while only `en` is live.
- **L4 switcher (Tier 2, S):** `client/src/components/goal/GoalLanguageSwitcher.tsx` (+ test), `client/src/components/goal/GoalStaticFrame.tsx` (switch only), `client/src/components/AccountMenu.tsx` (switch only, after `D-048-F-shell-parts`), `client/src/components/settings/RegionPanel.tsx`, the detection offer `client/src/components/goal/GoalLanguageOffer.tsx` (+ test), `design/goal-ui/captures/language/**`.
- **L5 first live language (Tier 1 review, M per language):** `shared/i18n/<tag>.json`, `shared/i18n/review/<tag>.json`, `shared/i18n/languages.ts` (status flip only), the font files/imports for that script (§12 Q3), captures.
- **L6 surface migration (Tier 2, S each, one surface per row):** replace literals with `t()` in one goal surface at a time, following `docs/plans/GOAL_UI_COVERAGE.md` ownership; never in a surface another open row owns.
- **L7 RTL pass (Tier 2, M):** goal primitives in `client/src/components/goal/*.tsx` (logical properties only), `scripts/designTokenAuditCore.mjs` + test (physical-direction rule; coordinate with `D-048-dark-mode`, which owns these two files until it lands), captures in RTL. Arabic flips to `live` only after this row and its own L5.
- **Read only:** `design/goal-ui/content.json` (seed; edited only by design rows), `shared/moneyCopy.ts`, `client/src/lib/paymentRoute.ts`, `server/emailDelivery.ts`, `DESIGN.md`, `docs/PRICING.md`.
- **Out of scope (never edit here):** pricing data and checkout (`shared/planCatalog.ts`, `server/kitCheckout.ts`), `client/src/lib/paymentRoute.ts` (language must not touch currency), sign-in methods and `referrerSignInHref()`, Terms/Privacy text (`client/src/pages/goal/policy/**`, owner-controlled), SEO locale URLs/`hreflang`/sitemaps (a later row once a language is live and has data), Skippy/AI copy generation, `package.json` (unless §12 Q3 is approved for that exact package).

## 6. Steps (one row each, one commit per step)

Each row lands alone on green required CI and is behaviour-preserving (D-223): L1-L4 and L6 change nothing visible while only English is live; L5 is the release step for each language.

1. **L1 `D-093-L1-measure`.** Additive migration + reconcile for `signupBrowserLanguage`, `preferredLanguageAnswer` (and `language`, so the table changes once). Write-once capture on first authenticated preferences load after account creation (client sends `navigator.language`; server stores only if null). Optional onboarding question. Flow-health aggregate. Tests §7 T1-T4. Commit: "Record signup browser language and preferred-language answer (D-093 first step)".
2. **L2 `D-093-L2-preference`.** Language table, CLDR test, `language` in contract/patch parser/store/sync with R6 precedence. Tests T5-T9.
3. **L3 `D-093-L3-catalogue`.** Generator from `content.json`, `en.json`, tiers, resolver, `useT`, `lang`/`dir` setter, `.g-num` isolation, pseudo-locale. Tests T10-T14.
4. **L4 `D-093-L4-switcher`.** Switcher + offer line + RegionPanel field; hidden while only `en` is live; captures with a test-only fixture that marks `hi` live (never shipped). Tests T15-T18.
5. **L5 `D-093-L5-<tag>`** per language in D-093 order (हिन्दी first unless L1 data says otherwise). Catalogue + review file + font + status flip. Tier 1 review. Tests T19-T20.
6. **L6 `D-093-L6-<surface>`** per surface, order = the goal-UI waves (D-093 "sequenced with the goal-UI waves").
7. **L7 `D-093-L7-rtl`.** Logical properties, audit rule, RTL captures; then `D-093-L5-ar`.

Registering these rows in `docs/plans/assignments.json` (with `owns`, `dependsOn`, `epic: "D-093-language"`, `syncedTo`) is a separate registry PR, not part of this packet's commit.

## 7. Tests to write first (red before the change)

- **T1** `server/accountPreferences.test.ts` "records signup browser language once": PUT/internal setter with `en-IN` then `hi-IN` → stored `en-IN`. Red: no column.
- **T2** same file "rejects a non-BCP-47 browser language": `"x"*40`, `"<script>"` → not stored, 400 or ignored, no throw.
- **T3** "preferredLanguageAnswer accepts listed tags and 'other' only".
- **T4** `server/flowBaseline` test: aggregate buckets below 3 render as "fewer than 3"; no user id in output.
- **T5** `shared/i18n/languages.test.ts` "endonyms match CLDR": for each entry, `endonym === new Intl.DisplayNames([tag], {type: "language"}).of(tag)`; `dir` matches `new Intl.Locale(tag).textInfo.direction`; order equals D-093 list; `en` live.
- **T6** "no flag emoji or regional-indicator characters anywhere in the table" (U+1F1E6-1F1FF).
- **T7** `parsePreferencesPatch({ language: "hi" })` → 400 while `hi` is hidden; `{ language: "en" }` ok; `{ language: null }` ok; unknown key still 400.
- **T8** `DisplayPrefsSync` "local choice syncs to an account with no language once" (one PUT); "account language beats local choice"; "PUT failure keeps local choice, no error shown".
- **T9** "language is not read from billing region or time zone": with `navigator.languages = ["hi-IN"]`, `Asia/Kolkata`, no choice → resolved language `en`.
- **T10** generator: `content.json` → `en.json` round trip; duplicate or missing keys fail with the source path named.
- **T11** `t()`: fallback `hi → en` per key; ICU plural `one/other` for `en` and `hi` via `Intl.PluralRules`; a missing `en` key throws in test.
- **T12** reviewed-tier gate: a `hi` value for a `reviewed` key with no review record, or a stale `sourceHash`, resolves to English.
- **T13** `<html lang dir>` updates on change; prerendered pages keep `lang="en"`.
- **T14** pseudo-locale render of the shell at 390 px: no element wider than the viewport (jsdom width check in the existing goal harness `client/src/test/goalShellHarness.tsx`).
- **T15** switcher not rendered when only `en` is live.
- **T16** with fixture `hi` live: options show endonyms with `lang` attributes; keyboard open/arrow/Enter/Esc; focus returns; current option has `aria-checked`.
- **T17** offer line: shown once for `hi-IN` browser, text includes both हिन्दी and English; dismiss persists; no `location` change (spy).
- **T18** login pins: `loginRule.test.tsx` and `signIn.test.tsx` unchanged and green.
- **T19** per live language: every `reviewed` key has a matching review record; key parity (no extra keys); placeholders `{…}` identical to English; no price literal (digits followed by ₹/$/Rs) inside any translated value.
- **T20** glossary pin per language: the referral noun from the glossary appears; the internal words ("ask", "credit" equivalents in the glossary's forbidden list) do not (D-180).

**Controls (must stay green, never weakened):** `server/accountPreferences.test.ts` existing cases (time zone/date format, unknown key 400), `displayPrefs` tests, `paymentRoute` tests, `loginRule.test.tsx`, `signIn.test.tsx`, `home.snapshotParity.test.tsx`, design-token audit, goal boundary tests, `moneyCopy` tests.

## 8. Edge cases and races

- **Two tabs change language:** last write wins on the account; the other tab picks it up on next preferences load. No cross-tab broadcast in v1.
- **Choice made signed-out, then sign-in to an account that already has a different language:** account wins (R6a) and the local value is overwritten with it, so the next signed-out visit on this device matches the account.
- **A live language is later hidden (review lapsed):** stored tag stays; resolver falls back to English; the switcher shows English as current; PUT of that tag is refused. No data deleted.
- **Browser without `Intl.PluralRules` for a tag or blocked localStorage:** fall back to `other` form and in-memory choice; never throw.
- **Server preference load fails:** keep local/English, no banner (same as `DisplayPrefsSync` today).
- **Mixed-direction content:** seeker names in Latin inside Arabic UI and vice versa use `dir="auto"`; numerals isolated (R15).
- **Email language for a referrer whose personal and work aliases differ:** language is per canonical person (one `accountPreferences` row per `userId`), never per alias or company.
- **Migration:** additive nullable columns only; old code ignores them; boot reconcile adds them where the deploy SQL has not run; rollback = stop reading them.

## 9. Definition of done (per row)

- [ ] Every §7 test for the row was red first and is green now; every control is green.
- [ ] Gate on the row's commit merged with the latest `origin/main` (commands in `docs/BRIEF.md`, "How to ship").
- [ ] L5 rows: independent Tier 1 review passed (`docs/DELEGATION.md` §6); every reviewed key carries a review record.
- [ ] Docs in the same push (D-068): the row's Status line below; `AGENTS.md` living-map row for display preferences / i18n when L2/L3 land; `docs/DECISIONS.md` D-093 sync cell when L5 for the first language is live; `docs/PRD.md`/`docs/BRIEF.md` language line when a language goes live.
- [ ] Pushed and live-checked; screens at 1280 and 390 for every UI row (pseudo-locale and, for L5, the real language); RTL captures for L7.
- [ ] Status line set to `done — <sha>` with the evidence block (`docs/DELEGATION.md` §5).

## 10. Review checklist (for the independent reviewer)

1. Can any code path set the UI language from IP, `CF-IPCountry`, billing region, time zone or company domain? (Must be no.)
2. Does any path redirect, reload or change the URL on detection? (Must be no.)
3. Does any translated `reviewed` string render without a matching `sourceHash` review record?
4. Does the language ever change a currency code, price amount, credit count or checkout route?
5. Are referrer sign-in methods and copy semantics unchanged in every language (only words translated)?
6. Is there any flag, regional-indicator emoji or country name used to label a language?
7. Are the new columns nullable and additive, with a reconcile entry, and is `signupBrowserLanguage` write-once and absent from every API response?
8. Do admin aggregates suppress buckets below 3 and contain no user identifiers?

## 11. Stop and ask if

- A cited function (`parsePreferencesPatch`, `setDisplayPrefs`, `DisplayPrefsSync`, `GoalStaticFrame` header) no longer matches §3.
- You would need a file outside your row's §5 list, an i18n library, a font CDN, or any package not approved under §12 Q3.
- A translation would need wording the English does not have (new promise, softened refund rule): the English changes first through its own row.
- A newer register entry than `syncedTo` touches language, money copy, the shell or the account menu: `--report blocked "D-093-…: conflicts with D-nnn"`.
- `D-048-F-shell-parts` or `D-048-dark-mode` is still open when your row needs their files.

## 12. Owner questions

Asked verbatim; each with a recommended default and rating (D-023). Rows that do not depend on a question may proceed on the default.

1. **"Who reviews the money, credit, legal and trust strings for each language before it goes live — you, someone you name, or volunteer verified referrers who are native speakers (unpaid, credited by handle)?"** Default: volunteer native-speaker verified referrers, two per language, no payment (D-031). Rating 6/10: free and close to users, but trust copy reviewed by volunteers carries a quality risk and needs a second reviewer. L5 waits on this answer.
2. **"May the Terms and Privacy pages appear in other languages once a reviewed translation exists, with the English version stated as the binding one, or should they stay English-only?"** Default: English-only with a one-line note in the reader's language that the English text is binding. Rating 8/10: avoids unapproved legal wording (AGENTS standing principle) at small cost to readers.
3. **"May we add the free, open-licence Noto Sans font packages for Devanagari, Telugu, Odia, Tamil and Kannada (self-hosted, loaded only when that language is chosen), or should we rely on each phone's built-in fonts?"** Default: add the `@fontsource/noto-sans-<script>` packages (same publisher as the Instrument Sans/JetBrains Mono packages already in `package.json`, OFL licence, no cost), loaded per language. Rating 8/10: consistent rendering on low-end Android; cost is bundle size only for people who choose that language. Needed by the AGENTS §2 package gate before L5.
4. **"Arabic is listed as the first right-to-left language. Do you still want Arabic next after the Indian languages, or should Spanish/Portuguese (left-to-right, larger referral markets) come first and the RTL pass wait?"** Default: Indian languages first, then let L1 signup data rank the next language; RTL pass only when a right-to-left language ranks in the top three. Rating 7/10: data-led ordering matches D-092/D-093's evidence caveat; the risk is delaying RTL readiness.
5. **"Should numbers (referral counts, prices) show in Latin digits in every language, or in each script's own digits (e.g. Devanagari ०१२)?"** Default: Latin digits everywhere in v1. Rating 8/10: Latin digits are the common reading norm on Indian web and keep prices identical to checkout and receipts.

## Status

When several tasks share this epic, each writes one line here, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live, and never edits the shared row (D-134).

- D-093-language (packet): written — Claude Code — 2026-10-28 — against `main` `25ebfd2c`; subtask rows L1-L7 not yet registered.
