# Packet D-093: language experience (endonym picker, no flags; measure first)

> Read `docs/BRIEF.md` first, then this packet. Each row in §5 is its own task (D-223): claim it with the picker, build only that row, and edit only the paths in its `owns` (scope-check fails anything else). Rows that share plan row D-093 write their status line in the Status section at the end, never in a shared §3b row (D-134).
>
> This packet changes no runtime behaviour. It registers rows in `docs/plans/assignments.json` and records its rulings as D-274 (decided under D-200; changeable). In this change set only the packet file and the parent row's `packet`/`syncedTo`/`status` land: the six rows it defines are held by the owner's Oct 31 "new rows paused" restriction and are listed, ready to apply, in §9.1. Nothing below is built or live.

| Field | Value |
|---|---|
| Queue rows | `D-093.capture` (Tier 1), `D-093.metrics` (Tier 2), `D-093.runtime` (Tier 2), `D-093.picker` (Tier 2), `D-093.mount` (Tier 2), `D-093.menu` (Tier 2); the parent `D-093-language` becomes the release row (Tier 1, D-223 (3)) — **all seven held by the Oct 31 "new rows paused" restriction, so the parent sits at `status: "owner"` until the owner answers (D-274)** |
| Decisions | D-093 (the spec), D-091 (pre-approval), D-092 (global north star), D-059 (its translation answer is superseded by D-093), D-031/D-204 (free tools only), D-153 (writing rule), D-167 (goal UI coverage), D-200, D-202, D-223, D-225; login rule D-030/D-049/D-057 (untouched) |
| Verified against | `origin/main` `a67b6f2a` (Nov 2 2026, re-synced by `Cline · d353`; the packet body's code citations were first verified on `94c697b4`, Oct 30 2026 and §0 records that check). No production query, API or provider call was made. |
| Migrations, env keys, dependencies | One additive migration (`D-093.capture`: two nullable columns). No env key. No new dependency in any row here; a per-script Noto font package is added only by a future per-language row (§6.3). |
| Writer | Hark · 66fd, architect lock `agent/architect/d093-language` (packet body, Oct 31 2026). Re-synced and handed to landing by `Cline · d353` on the same lock (D-274). Under D-190 a writer never lands this packet; an eligible session lands it through the architect-landing steps. |

## 0. Read receipt (D-225)
- **Main:** `94c697b4`, after `git fetch origin`. Highest register entry on `main`: D-248.
- **Read:** `AGENTS.md` (product compass, login rule, team rules), `START_HERE.md`, `docs/DELEGATION.md` §§1-4, `docs/BUILD_CONTINUITY.md`, register entries D-059, D-091, D-092, D-093, D-109, D-153, D-167, D-193, D-200, D-223 and the titles of D-227 to D-248 (none touches language, i18n or the files below), `docs/plans/global-readiness-i18n-ai-plan.md` (Oct 21 build-desk plan; this packet replaces its §2 as the executable plan), `docs/plans/D-086-demand-list.md` (format) and `docs/plans/D-222-referral-count.md`.
- **Prior repo-only outcome:** none. The task row had `packet: null`, status `architect`, no lock commits before the claim `a2d00cfb`, and no PR. The plan's §3b has no row "D-093" (`grep -n D-093 docs/KIT_V4_BUILD_PLAN.md` finds nothing); `docs/BACKLOG.md:92` lists the item.
- **Goal contribution:** D-092's global north star and D-093's "let users use the platform in their own language". The first slice is the one D-093 itself names first: count which languages people actually sign up in and whether they reach their first referral request, so translation effort follows real users instead of a guess (D-093 records "no user language data yet").
- **Re-sync, Nov 2 2026 (`Cline · d353`, D-274):** main `a67b6f2a`, register head D-273 (the highest ID on `main` and on every `origin/*` branch, checked before numbering this entry as D-274). The body above was written against `94c697b4`; nothing in D-227 to D-273 touches language, i18n, `accountPreferences`, `schemaReconcile`, `AppShell`, `AccountMenu` or `TrustPrivacy`, and no register entry names `D-093-language` (checked by `grep`). **Prior repo-only outcome for this row:** packet commit `642b0b4d` on `agent/architect/d093-language` (Oct 30, complete), then four takeover markers (`8ffb232b`, `45c0a4d9`, `0d8c9a56`, `5acc41c5`) and five `blocked` reports (`fc5359fd`, `ec5ee282` and earlier) that all asked the same thing: the packet's six rows need new registry rows, and the Oct 31 "new rows paused" restriction forbids them, so each re-hand only churned the lock head. This re-sync answers that without churn: the packet and the parent row land now, the six rows stay defined here in §9.1 and the row parks at `owner` (D-274).

## 1. Goal
1. **Measure first (D-093 "First:").** Record each new account's browser language (primary subtag only) at signup and the person's chosen language, and give admins a private count: signups by language and first-request completion by language. Publish the English-fallback share of every catalogue in CI.
2. **Build the language machinery once, English only.** A string catalogue seeded from `design/goal-ui/content.json`, an English fallback, plurals through `Intl.PluralRules`, a language store (device first, account on sign-in), an endonym picker and the one-time consent line. With no reviewed translation the picker shows nothing new: "unreviewed languages stay hidden".
3. **Open each language only when its money, credit, legal and trust copy is human-reviewed** (§6.3, owner question Q2).

## 2. Binding rules (quoted)
- **D-093** (owner 03:15 IST Oct 21: "Let users use the platform in their own language"; pre-approved under D-091): "Endonym picker, no flags: signed-in account menu + signed-out top-bar text switcher; first list English, हिन्दी, తెలుగు, ଓଡ଼ିଆ, தமிழ், ಕನ್ನಡ. One-time dismissible consent line for a detected language, never a silent redirect (Google Search Central guidance). Choice stored locally, syncs to account on sign-in; signed-out choice wins until an account preference exists; per-user, never inferred from company or country. Logical CSS properties so RTL mirrors; LTR mono numerals with bidi isolation; no fixed-width labels, 30-100% string expansion, 390px verified; Noto Sans per script alongside Instrument Sans and JetBrains Mono. content.json is the catalogue seed: full-sentence keyed strings, ICU plurals, Intl for dates/numbers/currency; prices stay data, never translated. Human-reviewed translations only for money, credit, legal and trust copy; unreviewed languages stay hidden. Arabic (first RTL) ships only after the RTL pass. First: capture browser language + a signup language field and count it (signups by language, signup and first-ask completion by language, fallback-string share)."
- **D-091:** still needs the owner's yes: "spending real cash", "taste calls on brand", "anything that could annoy users".
- **D-031/D-204:** never a paid tool; free first.
- **AGENTS.md login rule (founder-locked):** sign-in methods and referrer surfaces do not change. No row here edits a sign-in page, `SeekerSignIn`, `referrerSignIn.ts` or the login pins.
- **D-059 (repo is public):** no business numbers in repo docs. The language counts are served to admins only, never committed.

## 3. Current behaviour (verified on `94c697b4`; line numbers drift, find by name)
1. **The document is English and says so.** `client/index.html:2` `<html lang="en">`. `client/src/lib/device.ts:2` `CONTENT_LANGUAGE="en"`; `initializeDevicePreferences` (`device.ts:10`) resolves the device locale for Intl formatting and pins `root.lang` to `en`; `device.ts:5` comment: "Device preference for Intl date/number formatting. It does not describe UI copy." `client/src/main.tsx:38-42` calls it once.
2. **No catalogue runtime exists.** `design/goal-ui/content.json` (1,148 lines; top keys `_meta, shell, screenA, screenB, screenC, otherStates, shareImpact, shareWin, companySignal, claimCompany`) is read verbatim by `client/src/pages/CompanyClaim.tsx:7`, `shared/companySignalCopy.ts` (pinned by `shared/companySignalCopy.test.ts:8`), `shared/shareImpactCard.test.ts:2` and `scripts/design-token-audit.mjs:66-76`. Every other surface hardcodes English. No `useT`, no locale files, no `navigator.language` use for copy.
3. **Display preferences exist and are the model to extend.** `shared/accountPreferences.ts:5` `AccountPreferences = { timeZone, dateFormat }`. `server/accountPreferences.ts`: `parsePreferencesPatch` rejects any key other than `timeZone`/`dateFormat` with "Unknown setting" (`:18-19`); `registerAccountPreferenceRoutes` serves `GET/PUT /api/account/preferences` with `private, no-store` and takes `resolveIdentity`, `getPreferences`, `savePreferences` as deps. It is mounted at `server/_core/index.ts:207` with `db.getAccountPreferences`/`db.saveAccountPreferences` (`server/db.ts:5696-5708`, columns `timeZone`, `dateFormat` only). Client store: `client/src/lib/displayPrefs.ts` (localStorage `sw:display-prefs`, account wins when signed in); sync: `client/src/components/DisplayPrefsSync.tsx`, mounted at `client/src/main.tsx:140`.
4. **Table.** `drizzle/schema.ts:141-147` `accountPreferences(id, userId unique FK cascade, timeZone varchar(64), dateFormat varchar(8), updatedAt)`; created by `drizzle/deploy/0088_account_preferences.sql`; boot reconcile at `server/schemaReconcile.ts:58` (`DESIRED_TABLES`), `:85` (`DESIRED_COLUMNS`, the place additive columns are reconciled). Deploy migrations are applied by `scripts/apply-deploy-migrations.sh` from `drizzle/deploy/*.sql` in `deploy-api.yml`; each statement is `information_schema`-guarded (pattern: `drizzle/deploy/0104_company_suggestion_demand.sql`). Highest file on `main`: `0120_job_catalog.sql`.
5. **Settings already has a dead "Language" field.** `client/src/components/settings/RegionPanel.tsx`: `deviceRegion()` returns `language: "English"` (`:33`); `RegionField` renders a one-option select (`:42-44`, `:80`); footnote "Language and currency follow this device." (`:95`). Time zone and date format save through `PUT /api/account/preferences` (`save`, `:60-73`).
6. **Shell.** `client/src/components/AppShell.tsx`: signed out, `account.menu` is a ghost "Sign in" link (`:52-61`); signed in, `<AccountMenu />` (`:63-66`). `client/src/components/goal/GoalShell.tsx` renders `AccountSlot` in the rail (`:139`) and the phone top bar (`:147`). `AccountMenu.tsx` is owned by `D-048-F-shell-parts` (status `owner`, D-231); `AppShell.tsx` by `D-222-referral-count-shell` (todo) and `PRICING-banded-oct25` (in review).
7. **Fonts.** `client/src/index.css:1-8` imports `@fontsource/instrument-sans` and `@fontsource/jetbrains-mono` (and IBM Plex Mono); no Noto script font is installed.
8. **Privacy text.** `client/src/pages/TrustPrivacy.tsx` "What we collect" (`:53-55`) lists account details, referral content and transaction records; "Cookies & on-device storage" (`:61-63`) lists a session cookie, a security cookie and an offline cache. Neither mentions a language. The file is owned by `LAUNCH-legal-copy` (status `owner`).
9. **Funnel data available.** `users.createdAt` (`drizzle/schema.ts:27`); `referralRequests.jobSeekerId` and `createdAt` (`:511-`). The admin flow-health funnel (`server/db.ts:2891-`, `client/src/pages/AdminFlowHealth.tsx`) has no language dimension.

## 4. Rulings (decided under D-200 by this packet; changeable; register entry D-274)
1. **Order: measure, then machinery, then languages.** D-093 names capture first. The release row turns on capture only; no non-English language becomes visible from this packet.
2. **"Signup language field" is a stored data field, not a new form field.** No sign-in or sign-up page changes (login rule). At account creation the client reports the primary subtag of the browser's first language; the server stores it once.
3. **Data minimisation.** Only the primary language subtag is stored, mapped to the registry (`en`, `hi`, `te`, `or`, `ta`, `kn`) or `other`. Never the full `navigator.languages` list, region subtag, country, IP or billing region (D-093 "never inferred from company or country").
4. **Write-once and truthful.** `signupLanguage` is written only while the account is less than 24 h old and only if empty. Accounts older than that never get one, so "signups by language" counts only real signups after the switch.
5. **The chosen language is a setting like the time zone.** `accountPreferences.language`, null = follow the device/local choice. The server accepts only a language that is currently visible (§4.7) or null.
6. **The catalogue.** `design/goal-ui/content.json` stays the English source; it is not moved (four existing pins read it). Other languages live in `shared/i18n/locales/<code>.json`, mirroring content.json's key paths, partial allowed. A missing key falls back to English. Plurals are objects `{ "one": "...", "other": "..." }` (plus any CLDR category the language needs) chosen by `Intl.PluralRules`; placeholders are `{name}`. No message-format dependency (D-204: already-wired tools first). Prices, amounts and counts are data passed in, never translated text.
7. **Visibility.** `shared/languages.ts` lists each language with `code`, `endonym`, `script`, `dir`, and `reviewed: boolean`. A language is visible only when `reviewed` is true and its locale file has every English key (no fallback inside a visible language; §5.3 test 4). On this packet only English is visible.
8. **Precedence (D-093).** Signed out: local choice, else English (the consent line may offer the detected language; it never switches on its own). Signing in: if the account has no `language` and a local choice exists, the local choice is saved to the account; if the account has one, it wins and the local copy is updated. Never from company, work email domain, `CF-IPCountry` or billing region.
9. **Formatting stays on the device locale.** Dates and numbers keep `getDeviceLocale()` (`device.ts`) and the existing display preferences; currency keeps the billing region. The UI language changes copy and `<html lang dir>` only.
10. **Signed-in placement until the account menu is free.** D-093 says "signed-in account menu". `AccountMenu.tsx` is held by the owner (D-231), so `D-093.menu` waits for `D-048-F-shell-parts`; meanwhile signed-in people choose in Settings → Language & region (the existing field, §3.5). Both places stay once the menu row lands.
11. **"Signup completion" is not measured yet.** Measuring signup starts per language needs signed-out tracking, which `TrustPrivacy` says skipwait.me does not do. This packet counts completed signups and first-request completion; signup-start counting is a gap (§8 Q3), not built.
12. **"Fallback-string share" is measured statically.** `scripts/i18n-coverage.mjs` prints, per locale file, the share of English leaf strings it lacks. No runtime telemetry.
13. **RTL, emails, SEO.** Arabic and the logical-CSS pass across existing components, translated email/notification bodies and `hreflang` are out of scope (§6). New code in these rows uses logical properties (`ms-`, `ps-`, `text-start`) and wraps numerals in `GoalNum` or `dir="ltr"` with `unicode-bidi: isolate`.

## 5. The rows

### 5.1 `D-093.capture` (Tier 1: additive migration + account write path; M)
**Owns:** `shared/languages.ts`, `shared/languages.test.ts`, `shared/accountPreferences.ts`, `server/accountPreferences.ts`, `server/accountPreferences.test.ts`, `server/accountLanguage.ts`, `server/accountLanguage.test.ts`, `drizzle/schema.ts`, `server/schemaReconcile.ts`, `drizzle/deploy/*_account_language.sql`. **Depends on:** `D-090-BYOR` (which waits for `D-057-session-gate`; both own `drizzle/schema.ts` and `server/schemaReconcile.ts`).

Build:
1. `shared/languages.ts`: `LANGUAGES` (en English/English/Latn/ltr/reviewed true; hi हिन्दी/Deva; te తెలుగు/Telu; or ଓଡ଼ିଆ/Orya; ta தமிழ்/Taml; kn ಕನ್ನಡ/Knda; all others `reviewed: false`, ltr), `type LanguageCode`, `visibleLanguages()`, `isVisibleLanguage(code)`, `signupLanguageOf(tag: unknown): LanguageCode | "other" | null` (canonicalise with `Intl.getCanonicalLocales`, take `new Intl.Locale(tag).language`, map to a registry code or `"other"`; null on junk), and `export const LANGUAGE_CAPTURE_ENABLED = false`.
2. Migration `drizzle/deploy/<next free number>_account_language.sql` (decision-id-check enforces the number): two guarded statements adding `accountPreferences.language VARCHAR(16) NULL` and `accountPreferences.signupLanguage VARCHAR(16) NULL`. Header comment in the 0104 style: additive, no backfill, re-runs are no-ops, null = behaviour as before. Matching `DESIRED_COLUMNS` entries and `drizzle/schema.ts` columns.
3. `server/accountLanguage.ts`: `getAccountLanguage(userId)`, `saveAccountLanguage(userId, code|null)` (upsert on the existing unique `userId`), `recordSignupLanguage(userId, value, now)` that writes only when the switch is on, the row's `signupLanguage` is null and `users.createdAt` is within 24 h of `now` (single conditional `UPDATE`/insert; never overwrites). It imports `getDb` and the schema; it does not edit `server/db.ts`.
4. `shared/accountPreferences.ts`: add `language: LanguageCode | null` to `AccountPreferences`. `server/accountPreferences.ts`: `parsePreferencesPatch` accepts `language` (visible code or null; otherwise 400 "Choose a language we offer"); `registerAccountPreferenceRoutes` gains optional deps `getLanguage`/`saveLanguage`/`recordSignupLanguage` defaulting to `server/accountLanguage.ts`, so `server/_core/index.ts` is unchanged. GET returns `language`; PUT saves it. New `POST /api/account/signup-language` (`express.json({ limit: "1kb" })`, signed in) body `{ language: string }` → always `204` (no oracle on age or state); it calls `recordSignupLanguage(identity.account.id, signupLanguageOf(body.language), new Date())`. `signupLanguage` is never returned by any endpoint.

Red-first tests (write first; each must fail on `main` for the reason given):
1. `shared/languages.test.ts`: the registry holds exactly the six D-093 codes with those endonyms; only `en` is visible; `signupLanguageOf("te-IN") === "te"`, `("pt-BR") === "other"`, `("") === null`, `(42) === null`; no registry entry or function reads a country or region (fails: file missing).
2. `server/accountPreferences.test.ts` (extend): `language: "en"` and `null` parse; `"te"` (not visible) returns the error; `signupLanguage` in a PUT is still "Unknown setting"; GET includes `language` and never `signupLanguage`.
3. `server/accountLanguage.test.ts`: with fakes, switch off → no write; account 23 h old and empty → writes `te`; 25 h old → no write; already set → unchanged; route answers 204 in every case, 401 signed out.
4. Migration contract: the SQL file is guarded per column (two `information_schema.COLUMNS` checks) and `DESIRED_COLUMNS` lists both columns with the same definition as the SQL (extend the existing reconcile test pattern if one covers `DESIRED_COLUMNS`; otherwise assert in `server/accountLanguage.test.ts` by reading the file).

Done when: focused tests green, `pnpm check`, exact-head CI green, one independent D-151 review (Tier 1; schema). The switch stays false.

### 5.2 `D-093.metrics` (Tier 2: admin-only aggregate; S)
**Owns:** `server/languageFunnel.ts`, `server/languageFunnel.test.ts`, `server/_core/index.ts (switch only)`. **Depends on:** `D-093.capture`.

Build `GET /api/admin/language-funnel` (admin only, `private, no-store`, 404 while `LANGUAGE_CAPTURE_ENABLED` is false) returning, for windows `7d`, `30d` and `all` (since the first recorded signup language): per `signupLanguage` value, `signups` (accounts with that value created in the window) and `firstRequest` (of those, accounts with at least one `referralRequests` row as `jobSeekerId`), plus `chosen` (count of accounts whose `language` is each visible code). No user ids, emails or dates per person. Registration is one wiring line in `server/_core/index.ts`. Tests: admin gate (401/403), switch off → 404, aggregate correctness on fixtures, no identifying field in the payload, cache header. The numbers are never committed to the repo (D-059). Admins read JSON until an admin-ops row adds a panel (§6).

### 5.3 `D-093.runtime` (Tier 2: catalogue and language store; M)
**Owns:** `shared/i18n/catalog.ts`, `shared/i18n/catalog.test.ts`, `shared/i18n/locales/**`, `client/src/lib/i18n.ts`, `client/src/lib/i18n.test.ts`, `client/src/lib/useLanguageSync.ts`, `client/src/lib/useLanguageSync.test.ts`, `scripts/i18n-coverage.mjs`, `scripts/i18nCoverage.test.ts`, `client/src/App.tsx (switch only)`. **Depends on:** `D-093.capture`.

Build:
1. `shared/i18n/catalog.ts`: `translate(code, keyPath, params?, count?)` reading content.json for English and `shared/i18n/locales/<code>.json` for others; English fallback per key; `{name}` interpolation; plural objects via `Intl.PluralRules(code)`; returns `{ text, fellBack }`.
2. `client/src/lib/i18n.ts`: a `useSyncExternalStore` language store (localStorage `sw:language`, only visible codes accepted, else `en`), `useT()`, `setLanguage(code, { persistLocal })`, and an effect that sets `document.documentElement.lang`/`dir` from the active visible language (default stays `en`/`ltr`, so nothing changes on English). It does not change `device.ts` or Intl formatting (§4.9).
3. `client/src/lib/useLanguageSync.ts`: after sign-in, GET preferences; apply §4.8 precedence (PUT the local choice when the account has none); once per account per device (localStorage marker) POST `/api/account/signup-language` with `resolveDeviceLocale(navigator)`'s value. Fail-soft like `DisplayPrefsSync`. Mounted with one line in `App.tsx`.
4. `scripts/i18n-coverage.mjs`: for each locale file, leaf keys present / English leaf keys, keys that do not exist in English (an error), and placeholder mismatches (an error). Prints the fallback share; exits non-zero only on errors.

Red-first tests: (1) English lookup equals content.json verbatim for three existing keys; (2) missing key in a fake `te` locale falls back with `fellBack: true`; (3) plural `one/other` picks by `Intl.PluralRules`; (4) a locale with an extra key or a renamed `{placeholder}` fails `catalog.test.ts`, and a language marked `reviewed` fails unless its file has every English key; (5) the store ignores an invisible code in localStorage; (6) sync: local `en` + account null → PUT; account set → local updated; signup-language POST sent once; nothing reads `CF-IPCountry`, billing region or email domain (grep pin on the new files).

### 5.4 `D-093.picker` (Tier 2: components and the Settings field; S)
**Owns:** `client/src/components/goal/GoalLanguagePicker.tsx`, `client/src/components/goal/GoalLanguageConsent.tsx`, `client/src/components/goal/goalLanguage.test.tsx`, `client/src/components/settings/RegionPanel.tsx`, `client/src/components/settings/regionPanel.language.test.tsx`. **Depends on:** `D-093.runtime`.

- `GoalLanguagePicker` (`variant: "bar" | "settings"`): a text control listing visible languages by endonym, each option wrapped with its own `lang` attribute; no flags, no country names, no icon-only control; 44 px targets on phones; renders nothing when fewer than two languages are visible. Choosing calls `setLanguage` (and the account PUT when signed in). Goal tokens only, logical properties.
- `GoalLanguageConsent`: one dismissible line when the device's primary language is visible, differs from the active one and no choice or dismissal is stored: "Use skipwait.me in {endonym}?" in that language (from its catalogue), a ghost "Switch" and a plain "Keep {current endonym}". Dismiss or choose stores `sw:language-consent` and it never shows again on that device. It never navigates or changes the URL (D-093: never a silent redirect).
- `RegionPanel`: the dead "Language" select becomes the real choice (`GoalLanguagePicker variant="settings"` or the panel's own select, the builder's call), saved like time zone with rollback on failure; with only English visible it shows "English" and a short line "More languages are coming. We add one only after a person checks its money and privacy wording." The footnote (`:95`) changes to say the language follows the user's choice and currency follows the device. Copy obeys D-153.

Tests: no `<img>`/emoji flag; endonyms rendered with `lang`; hidden with one visible language; consent shows once, dismiss persists, no `location` change; RegionPanel saves and rolls back. Captures (fixtures, fictional): picker and consent at 1280 and 390 with a test-only second visible language and a 100% expanded pseudo-locale string, under `design/goal-ui/captures/language/` (committed by `D-093.mount`).

### 5.5 `D-093.mount` (Tier 2: shell placement; S)
**Owns:** `client/src/components/AppShell.tsx`, `client/src/components/appShell.language.test.tsx`, `design/goal-ui/captures/language/**`. **Depends on:** `D-093.picker`, `D-222-referral-count-shell` (owns `AppShell.tsx`; it waits for `PRICING-banded-oct25`, which also owns it).

Signed out: `account.menu` becomes the `bar` picker beside the existing "Sign in" ghost link (the link, its href and the referrer sign-in links are unchanged). Every shell route: `GoalLanguageConsent` above `children`. Captures of the whole rendered page at 1280 and 390, signed out and signed in, English-only (nothing new visible) and with the test-only second language, goal-native across the page. Tests: signed-out bar shows the picker only when two languages are visible; the Sign in link and `referrerSignInHref` usage are unchanged (login pins stay green).

### 5.6 `D-093.menu` (Tier 2: account-menu entry; XS)
**Owns:** `client/src/components/AccountMenu.tsx (switch only)`, `client/src/components/accountMenu.language.test.tsx`. **Depends on:** `D-093.picker`, `D-048-F-shell-parts` (owner hold, D-231).

A "Language" item in the signed-in account menu opening the picker; hidden with one visible language. Not a dependency of the release row.

### 5.7 `D-093-language`: the release row (Tier 1; status `todo`, waiting on its rows)
**Owns:** `shared/languages.ts (switch only)`, `client/src/pages/TrustPrivacy.tsx`. **Depends on:** `D-093.capture`, `D-093.metrics`, `D-093.runtime`, `D-093.picker`, `D-093.mount`, `LAUNCH-legal-copy` (owns `TrustPrivacy.tsx`; owner).

Flips `LANGUAGE_CAPTURE_ENABLED` to true and adds the owner-approved privacy sentence (Q1) in the same PR, after QA on the preview, the independent Tier 1 review (privacy) and the owner's yes on Q1 (legal text is owner-only, D-223 (3)). It makes no language other than English visible.

## 6. Out of scope (every row)
1. Arabic, RTL and the logical-CSS migration of existing components (D-093: Arabic only after the RTL pass; a later packet).
2. Translating emails, notifications, Skippy output, SEO pages and `hreflang`.
3. **Per-language rows.** Each language (hi, te, or, ta, kn) gets its own row once a reviewer exists (Q2): its `shared/i18n/locales/<code>.json`, its `@fontsource/noto-sans-<script>` package (free, OFL; loaded by dynamic `import()` only when that language is active), a human review of the money, credit, legal and trust keys recorded in the PR, `reviewed: true`, and captures at 390 with real strings. Not registered here.
4. An admin panel for the funnel (a later admin-ops row; JSON until then).
5. Any change to sign-in, prices, plans, credit rules or legal text beyond the Q1 sentence.

## 7. Privacy and legal text
Capture adds a new item to what skipwait.me collects. The release row may not ship until the owner approves wording for `TrustPrivacy.tsx` (Q1). Proposed, changeable: in "What we collect", add "Your language choice and, when you sign up, your browser's main language (for example Telugu), used only to decide which languages to offer and to count sign-ups by language." In "Cookies & on-device storage", add "Your language and display choices are saved on this device." (the second also covers the existing `sw:display-prefs`, which the current text omits).

## 8. Owner questions (batched for the weekly review, D-064)
- **Q1 (legal text, blocks only the release row):** approve or edit the §7 sentences.
- **Q2 (blocks only per-language rows):** who reviews the money, credit, legal and trust strings for हिन्दी, తెలుగు, ଓଡ଼ିଆ, தமிழ், ಕನ್ನಡ? Free options first (D-031/D-204): the owner for languages he reads, or a named native-speaker volunteer. A paid translator needs the owner's yes. Default until answered: no language beyond English is visible.
- **Q3 (optional):** should signup *starts* by language be counted with a first-party, cookie-less aggregate counter on the sign-in page? Default: no (§4.11).

## 9. Registry delta

**Landed by this change set (docs only, D-274):**
- This packet, `docs/plans/D-093-language.md`.
- `D-093-language` in `docs/plans/assignments.json`: `packet` → this file, `status` `architect` → `owner`, `syncedTo` → `D-274`, and a note naming the hold. `tier` stays 2 and `dependsOn`/`owns` stay empty: a row that cannot be built must not claim the release row's `owns`.

**Held by the owner's Oct 31 "new rows paused" restriction (D-274; the question is in `docs/DECISIONS.md` → Open owner questions):**
- The six rows in §9.1, each with `epic: "D-093-language"` and branches `agent/queue/d093-<slug>`.
- `D-093-language`'s promotion to the Tier 1 release row: `tier` 1, `status` `todo`, and `dependsOn`/`owns` per §5.7.
- `D-099-bonus-pages` gains `D-093.capture` in `dependsOn`: both own `drizzle/schema.ts` and `server/schemaReconcile.ts`, and D-099 already waits for `D-090-BYOR` and owner-held rows, so ordering capture first delays nothing.

Nothing above is registered today. Until it is, no row of this packet is buildable and the parent row is parked at `owner`.

### 9.1 The six rows, exactly as they will be added

Apply verbatim in one docs-only PR once the pause lifts, setting `syncedTo` to the newest register entry at that moment (it reads `D-274` here, the entry that created this packet). Nothing else in `docs/plans/assignments.json` changes except the parent row and `D-099-bonus-pages` per §9.

```json
[
  {
    "id": "D-093.capture",
    "title": "Language capture (D-093): browser language at signup (primary subtag, write-once, under 24 h) and the chosen language as an account setting; one additive guarded migration; switch starts false",
    "row": "D-093",
    "packet": "docs/plans/D-093-language.md",
    "tier": 1,
    "lane": "i18n-capture",
    "branch": "agent/queue/d093-capture",
    "status": "todo",
    "syncedTo": "D-274",
    "epic": "D-093-language",
    "dependsOn": [
      "D-090-BYOR"
    ],
    "owns": [
      "shared/languages.ts",
      "shared/languages.test.ts",
      "shared/accountPreferences.ts",
      "server/accountPreferences.ts",
      "server/accountPreferences.test.ts",
      "server/accountLanguage.ts",
      "server/accountLanguage.test.ts",
      "drizzle/schema.ts",
      "server/schemaReconcile.ts",
      "drizzle/deploy/*_account_language.sql"
    ],
    "note": "D-093 packet §5.1. Waits for D-090-BYOR (and through it D-057-session-gate): all three own drizzle/schema.ts and server/schemaReconcile.ts. Does not edit server/db.ts or server/_core/index.ts (optional deps default to server/accountLanguage.ts). LANGUAGE_CAPTURE_ENABLED stays false; only English is visible. Tier 1: independent D-151 review."
  },
  {
    "id": "D-093.metrics",
    "title": "Language funnel (D-093): admin-only, no-store JSON of signups and first-request completion by signup language; 404 while the capture switch is off",
    "row": "D-093",
    "packet": "docs/plans/D-093-language.md",
    "tier": 2,
    "lane": "i18n-metrics",
    "branch": "agent/queue/d093-metrics",
    "status": "todo",
    "syncedTo": "D-274",
    "epic": "D-093-language",
    "dependsOn": [
      "D-093.capture"
    ],
    "owns": [
      "server/languageFunnel.ts",
      "server/languageFunnel.test.ts",
      "server/_core/index.ts (switch only)"
    ],
    "note": "D-093 packet §5.2. Aggregates only, no user ids or per-person dates; numbers never committed (D-059). Admins read JSON until a later admin-ops panel."
  },
  {
    "id": "D-093.runtime",
    "title": "i18n runtime (D-093): content.json as the English catalogue, partial locale files with English fallback, Intl.PluralRules plurals, the language store and account sync, CI fallback-share report",
    "row": "D-093",
    "packet": "docs/plans/D-093-language.md",
    "tier": 2,
    "lane": "i18n-runtime",
    "branch": "agent/queue/d093-runtime",
    "status": "todo",
    "syncedTo": "D-274",
    "epic": "D-093-language",
    "dependsOn": [
      "D-093.capture"
    ],
    "owns": [
      "shared/i18n/catalog.ts",
      "shared/i18n/catalog.test.ts",
      "shared/i18n/locales/**",
      "client/src/lib/i18n.ts",
      "client/src/lib/i18n.test.ts",
      "client/src/lib/useLanguageSync.ts",
      "client/src/lib/useLanguageSync.test.ts",
      "scripts/i18n-coverage.mjs",
      "scripts/i18nCoverage.test.ts",
      "client/src/App.tsx (switch only)"
    ],
    "note": "D-093 packet §5.3. No new dependency. Formatting stays on the device locale (device.ts unchanged). Signed-out choice wins until the account has one; never from country, company, email domain or billing region."
  },
  {
    "id": "D-093.picker",
    "title": "Endonym language picker and one-time consent line (D-093), plus the real Language field in Settings; no flags; hidden while only English is visible",
    "row": "D-093",
    "packet": "docs/plans/D-093-language.md",
    "tier": 2,
    "lane": "i18n-picker",
    "branch": "agent/queue/d093-picker",
    "status": "todo",
    "syncedTo": "D-274",
    "epic": "D-093-language",
    "dependsOn": [
      "D-093.runtime"
    ],
    "owns": [
      "client/src/components/goal/GoalLanguagePicker.tsx",
      "client/src/components/goal/GoalLanguageConsent.tsx",
      "client/src/components/goal/goalLanguage.test.tsx",
      "client/src/components/settings/RegionPanel.tsx",
      "client/src/components/settings/regionPanel.language.test.tsx"
    ],
    "note": "D-093 packet §5.4. The consent line never navigates or changes the URL. Goal tokens and logical properties only."
  },
  {
    "id": "D-093.mount",
    "title": "Mount the language picker in the signed-out top bar and the consent line on every shell route (D-093); captures at 1280 and 390",
    "row": "D-093",
    "packet": "docs/plans/D-093-language.md",
    "tier": 2,
    "lane": "i18n-mount",
    "branch": "agent/queue/d093-mount",
    "status": "todo",
    "syncedTo": "D-274",
    "epic": "D-093-language",
    "dependsOn": [
      "D-093.picker",
      "D-222-referral-count-shell"
    ],
    "owns": [
      "client/src/components/AppShell.tsx",
      "client/src/components/appShell.language.test.tsx",
      "design/goal-ui/captures/language/**"
    ],
    "note": "D-093 packet §5.5. Waits for D-222-referral-count-shell (and through it PRICING-banded-oct25), which own AppShell.tsx. The Sign in link and referrer sign-in links stay unchanged."
  },
  {
    "id": "D-093.menu",
    "title": "Language entry in the signed-in account menu (D-093); hidden while only English is visible",
    "row": "D-093",
    "packet": "docs/plans/D-093-language.md",
    "tier": 2,
    "lane": "i18n-menu",
    "branch": "agent/queue/d093-menu",
    "status": "todo",
    "syncedTo": "D-274",
    "epic": "D-093-language",
    "dependsOn": [
      "D-093.picker",
      "D-048-F-shell-parts"
    ],
    "owns": [
      "client/src/components/AccountMenu.tsx (switch only)",
      "client/src/components/accountMenu.language.test.tsx"
    ],
    "note": "D-093 packet §5.6. Waits for the owner-held D-048-F-shell-parts (D-231); Settings carries the choice until then. Not a dependency of the release row."
  }
]
```

## 10. Review checklist (any row)
1. Edits only its `owns`; no new dependency, env key or migration beyond §5.1.
2. No sign-in surface, referrer link or login pin changed.
3. Nothing derives language from country, company, email domain, IP or billing region.
4. Only English visible; an unreviewed language cannot be selected, stored (server 400) or rendered.
5. `signupLanguage` is primary subtag or `other`, write-once, under 24 h, never returned.
6. Captures at 1280 and 390, whole page, goal-native; 100% expansion survives at 390.
7. Prices and counts are data; no translated amount.

## 11. Stop and ask
Stop with `--report blocked` if: a row needs a file outside its `owns`; a function cited in §3 no longer matches; the migration cannot be guarded; anything would change sign-in, prices, credits or legal text; or a newer register entry changes these rulings (D-202).

## Status
- Packet: Hark · 66fd, `agent/architect/d093-language`, Oct 31 2026.
- Re-sync and landing hand-off: `Cline · d353`, `agent/architect/d093-language`, Nov 2 2026 (D-274). Re-verified against main `a67b6f2a`; §9 rewritten so the packet can land without creating rows; `D-093-language` set to `packet` + `syncedTo: "D-274"` + `status: "owner"`.
- Row status: **held at `owner`.** Nothing is buildable: the six rows are registered nowhere, and the owner's Oct 31 "new rows paused" restriction forbids adding them. The one question that unblocks it is in `docs/DECISIONS.md` → *Open owner questions* (D-274). This packet is not landed by its writers (D-190); any other eligible session lands it on green required CI, then a later docs-only PR applies §9.1 if the owner releases the rows.
- Pull request: [#891](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/891) (`agent/architect/d093-language` → `main`), docs/registry only. Landing is another session's step (D-190): both writers of this packet hold the lock, so neither lands it.
