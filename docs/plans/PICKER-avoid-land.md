# PICKER-avoid-land

Issue: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/744
Evidence: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/650#issuecomment-6439578734

## Scope

`scripts/nextTaskCore.mjs`, `scripts/nextTaskAvoidLand.test.ts`. Depends on PICKER-avoid-unblock and its transitive core-file owners. This is distinct from #740's UNBLOCK fixture; do not silently broaden that row.

## Reproduced on current source

Tier-1 M built by DeepSeek, fresh pass verdict by reviewer, green open PR, disjoint eligible N. Reviewer with avoid M returns continue/land M; other session selects build N; marking M done makes original reviewer select N. This reproduces the LAND avoid case, not a current hold on #579/#650: those PRs are already merged and registered done.

## Acceptance

Write failing tests first for avoided owned land continuation, fresh pass state, done-row control, and preservation of review/landing-slot/blocked-lane exclusions. Select eligible work or honest wait without offering avoided M. No marker override, identity change or silent lock release. Broader own-stage changes need explicit tests/scope and independent review. Run existing picker tests, typecheck and required CI. No product, migration, settings or flag changes.
