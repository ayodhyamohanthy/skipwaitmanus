# Packet FND-1: the toolchain says which Node works, and the never-run `shared/` tests run

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `FND-1` (add it when you claim, under "Drift from approved decisions") |
| Decisions | D-074, D-075 (5); BRIEF "How to ship" |
| Risk tier | 3 |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/fnd1-toolchain` |
| Depends on | nothing; parallel-safe with every lane |
| Verified against | `main` `e6b87f8` |

## 1. Goal
A model on a fresh machine should get a working toolchain the first time, and every test file in the repo should run in CI.

## 2. Current behaviour (measured)
1. `package.json` declares `"engines": { "node": ">=22" }`. The jsdom client tests fail to start on Node 22.11 with `ERR_REQUIRE_ESM` from `html-encoding-sniffer`; `require()` of an ES module is only unflagged from Node 22.12. CI uses the latest Node 22, which works. There is no `.nvmrc`.
2. `vitest.config.ts` `include` has no `shared/**`, so `shared/alerts.test.ts`, `shared/assistant.test.ts` and `shared/referral.test.ts` never run. Run with a temporary include, they give 16 passed and 1 failed. The failure is `shared/assistant.test.ts` › "follows the entitlement: Land, or grandfathered legacy Max": it expects legacy Max to keep assistant access, and the code returns false. Legacy Max is being removed (D-067), so the expectation is stale.
3. `scripts/productCopyGuard.test.ts` about line 21: `expect(files.some(file => /\.test\.[tsx]?$/.test(file))).toBe(false)`. The regex can never match `x.test.ts` or `x.test.tsx`, so the assertion always passes.

## 3. Target behaviour
1. `package.json` `engines.node` is `">=22.12"`. A new `.nvmrc` contains `22`.
2. `vitest.config.ts` `include` adds `"shared/**/*.test.ts"`. In `shared/assistant.test.ts`, the failing case asserts that a legacy Max wallet has **no** assistant access, and its title says so ("a legacy Max wallet has no assistant access (D-067)"). If D-067 already landed and changed that file, keep its version.
3. The copy-guard regex becomes `/\.test\.tsx?$/`. Run the test: if it now fails because the scanner includes test files, fix the scanner's filter in `scripts/productCopyGuard.mjs` so test files are excluded. Never loosen the assertion.
4. `docs/DELEGATION.md` §10 and `AGENTS.md` "Commands" say Node 22.12 or newer. `AGENTS.md` also says pnpm 10.34.7, matching `packageManager`; it currently says 10.4.1.

## 4. Files
- **In scope:** `package.json` (`engines` only), `.nvmrc` (new), `vitest.config.ts` (`include` only), `shared/assistant.test.ts`, `scripts/productCopyGuard.test.ts`, `scripts/productCopyGuard.mjs` (only if step 3 needs it), `docs/DELEGATION.md` §10, `AGENTS.md` (the "Commands" block only), the §3b row.
- **Out of scope:** dependency versions, the lockfile, CI workflows.

## 5. Steps
1. Engines and `.nvmrc`; run `pnpm install --frozen-lockfile` to confirm nothing changes in the lockfile.
2. Collect the `shared/` tests and fix the stale case.
3. Copy-guard regex (and scanner, if needed).
4. Docs.

## 6. Definition of done
Gate green; the full vitest count rises by 3 files and 17 tests; row `done — <sha>`. Tier 3: push to `main` after the gate.

## 7. Stop and ask if
A `shared/` test fails for a reason other than legacy Max, or the lockfile changes.
