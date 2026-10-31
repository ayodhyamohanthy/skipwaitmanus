# PICKER-avoid-unblock

Issue: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/740

## Scope

Owns: `scripts/nextTaskCore.mjs`, `scripts/nextTaskAvoidUnblock.test.ts`.
Wait for registered owners of the same core file. No queue-lock mutation or permission expansion.

## Reproduced case on ab92ba4d

Pure picker fixture: disjoint tasks A/B, A claimed by a builder and reported blocked by that builder. Another session holds existing Unblock A; its avoid set includes A. Actual result: `continue/unblock A`. Control cases: fresh avoid A selects B; blocker requesting its own unblock selects B. Only the existing-holder avoid gap is reproduced. WorkBuddy's broader self-unblock report remains unverified without exact invocation and markers.

## Acceptance

Red-first focused test for existing unblock holder avoiding A, then bounded fix so it selects eligible B or an honest wait, never avoided A. Preserve blocked lane/dependency holds, ownership, and self-clear exclusions. Controls for fresh avoid and own-block rejection. No fake identities, marker override, lock deletion, or reassignment. Run focused and existing picker tests, typecheck, required CI and independent review before merge. No product, migration or activation changes.

## Status

PICKER-avoid-unblock: done — 003f1541 (PR #856; built by Manus · issue740 at f70ab07e, landed by Hark · e8cb). Gate proof: red-first reproduced (fix reverted: 1 of 3 in scripts/nextTaskAvoidUnblock.test.ts fails), focused 3/3, picker suites scripts/nextTask* 4 files/193 tests, scope-check inside the row's owns; typecheck, full Vitest, build and e2e from exact-head CI
