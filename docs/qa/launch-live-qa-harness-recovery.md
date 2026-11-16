# Recover the rebuilt anonymous plans harness

This is source recovery, not release acceptance. The six files in `launch-live-qa-harness/` preserve the reviewed October 31 rev2 rebuilt subset. They do not restore the earlier 59-URL crawl, `api-legs.py`, signed-in tests or E2E coverage. No secret or session data is included.

## Local reconstruction only

From a fresh clone at the carrier's exact reviewed commit:

```sh
cd docs/qa/launch-live-qa-harness
sha256sum -c MANIFEST.sha256
npm ci --ignore-scripts --no-audit --no-fund
node --check packs.js
node --check packshots.js
node -p "require('playwright-core/package.json').version"
```

Expected: every manifest entry OK, both syntax checks exit 0, Playwright Core 1.64.1. This verifies source integrity and local dependency reconstruction only. The package's `npm test` is a failing placeholder, not a usable QA test. Do not report it as passing.

## Live execution is separate

`packs.js` and `packshots.js` request `https://skipwait.me/plans`, use `/usr/bin/google-chrome`, and write under `/downloads/`. They do not sign in or click. The scripts' presence does not grant permission to run a production test. Check the current permitted scope first. A future run needs its own output and pixel inspection before any visual claim.

The scripts retain the source's historical credits/expiry selectors and narrow pack-state assertions. Those words are not current pricing authority. Product terminology and pricing remain with their existing owner lanes; do not change prices, allowances or expiry through this recovery task.

## Holds remain

LAUNCH-live-qa is owner-held, #710 remains draft, D-216 and #709 remain unresolved. The old empty takeover marker was void, not a current owner grant. No shared branch is overwritten and no replacement holder identity is created by this source carrier. Local reconstruction is not a live QA pass, full restoration, product review or landing permission for #710.
