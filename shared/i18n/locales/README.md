# Locale files (D-093)

Each language the product offers lives here as `<code>.json`, mirroring the key
paths of `design/goal-ui/content.json` (the English catalogue, which is *not*
moved). A locale file may be partial: any key it lacks falls back to English at
render time, and the fallback share is published by `scripts/i18n-coverage.mjs`.

Contract, enforced by `shared/i18n/catalog.test.ts` and `scripts/i18n-coverage.mjs`:

- Only leaf values: strings, or plural objects keyed by CLDR category
  (`zero`, `one`, `two`, `few`, `many`, `other`) chosen with `Intl.PluralRules`.
- A key the file invents fails the check (`extraKeys`).
- A `{placeholder}` renamed from the English source fails the check
  (`placeholderMismatches`); the set of placeholders must match exactly.
- A language marked `reviewed: true` in `shared/languages.ts` is visible, and its
  file must carry every English leaf key — no fallback inside a visible language.
- `_meta` in content.json is design-deck metadata and is never translated.
- English is the source of truth and has no file here.

Adding a language is its own row: the file, one registration line in
`shared/i18n/catalog.ts` (`LOCALE_TREES`), `reviewed: true` in `shared/languages.ts`,
a human review of the money, credit, legal and trust strings recorded in the PR,
and captures at 390px with real strings. Today only English exists and is visible.
