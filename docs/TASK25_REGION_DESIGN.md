> Status (Oct 18 2026): historical record — where it conflicts with docs/DECISIONS.md, the register wins (notably D-048).

# Task 25 design check: region-preferences + settings-kit-shell (DESIGN ONLY, nothing built)

Read from main at cc39db8. Not built; needs approval of the scope cuts below.

## What exists
- /settings already has the 5-section kit shell (Region, Notifications, App, Privacy, Account) and works signed out for Region and App. So `settings-kit-shell` is essentially done; remaining gaps are small fidelity items (signed-out view, panel tokens) that need a per-screen check at 1280 and 390, not a rebuild.
- RegionPanel is read-only: it shows what this device resolves to (one language, device time zone, date sample, checkout currency from `browserPaymentRoute`).
- No account preferences store. 24 client files format dates/numbers on their own (toLocale*/Intl); server code has 1.

## Scope cuts (the reasons matter)
1. Currency: DO NOT persist or expose a currency choice. The checkout currency today comes from the payment route, which is tied to the live Chargebee catalog and what a customer is charged. A user-editable currency preference next to that is money-adjacent and the founder's payments bar says not to touch pricing/checkout. Currency stays display-only exactly as now. (Held with the pricing wave.)
2. Language/RTL: only English ships. Persisting "Arabic" would set dir=rtl on an untranslated UI. Not buildable without translations; leave the language row read-only and say so.
3. Buildable: time zone and date format (12/24h, DMY/MDY/ISO) persisted per account, with a device-local fallback for guests.

## Proposed build (if approved)
- Migration 0088 guarded/additive: `accountPreferences(userId unique, timeZone varchar(64) null, dateFormat varchar(8) null, updatedAt)` + DESIRED_TABLES/index/FK. Null = use the device value, so behaviour is unchanged for everyone until they choose.
- GET/PUT `/api/account/preferences` (validate timeZone against Intl.supportedValuesOf, dateFormat against an enum). Own-row only. No sends.
- One shared formatter `client/src/lib/formatTime.ts`; migrate only the user-facing ask-expiry and message-time displays first (the kit footnote says exactly these), not all 24 files. Footnote "Ask expiry and message times always show in your time zone." only renders once those use the formatter (the audit says the same).
- Emails keep server time formatting for now; routing email times through the formatter is a later, separate send-path change (design-first).
- Risk: low (display only). Does not touch expiry logic: it changes only how an existing timestamp is printed.

## Questions
1. OK to cut currency and language (read-only)?
2. OK to start with time zone + date format and the two time displays?
