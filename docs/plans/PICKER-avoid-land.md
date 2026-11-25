# PICKER-avoid-land

Issue: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/744
Evidence: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/650#issuecomment-6439578734

## Scope

`scripts/nextTaskCore.mjs`, `scripts/nextTaskAvoidLand.test.ts`. Depends on PICKER-avoid-unblock and its transitive core-file owners. This is distinct from #740's UNBLOCK fixture; do not silently broaden that row.

## Reproduced on current source

Correction (2026-11-03): at build time (main `fa462f69`), this case no longer reproduces on current source. It had already been fixed on main (the avoid guard at `scripts/nextTaskCore.mjs:674`), so there is no original reproduction red. As first registered, the case read: Tier-1 M built by DeepSeek, fresh pass verdict by reviewer, green open PR, disjoint eligible N; a reviewer with avoid M returns continue/land M; another session selects build N; marking M done makes the original reviewer select N. In this build that case is kept only as regression pins in `scripts/nextTaskAvoidLand.test.ts`. It was not a current hold on #579/#650, which are already merged and registered done.

## Acceptance

Write failing tests first for avoided owned land continuation, fresh pass state, done-row control, and preservation of review/landing-slot/blocked-lane exclusions. Select eligible work or honest wait without offering avoided M. No marker override, identity change or silent lock release. Broader own-stage changes need explicit tests/scope and independent review. Run existing picker tests, typecheck and required CI. No product, migration, settings or flag changes.

## Status

- PICKER-avoid-land: in progress — Hark · 5de4 — 2026-11-02 — branch agent/queue/picker-avoid-land
- PICKER-avoid-land: done — 4a2567bb (code head; this status commit on top) — landed by DeepSeek V4.1 Flash Free · 4fb6 on 2026-11-05 under D-082: `origin/main` `a8ac6f71` merged in, all four required checks green on `4a2567bb` (CI run 41886548837), main CI green. Local gate on the merged commit: `tsc --noEmit` clean, design-token audit OK, migrations lint 0, deploy-trigger pin OK, `pnpm build` OK, full vitest 5920 passed with 2 load-flakes (`scripts/classifyCiChange.test.ts`, `client/src/pages/explore.test.tsx`; both pass in isolation, neither file is in this change). The lane-hold fix for an avoided red/blocked hand-out is on `scripts/nextTaskCore.mjs` with its tests in `scripts/nextTaskAvoidLand.test.ts`; no product, migration, settings or flag change. The earlier Hark-built review line stays above as history; Hark's model identity remains unverified.
- PICKER-avoid-land: review — Hark · 5de4 — 2026-11-03 — implementation head `b0c34e66` (ordinary merge of current `main` `fa462f69`). The original avoided-LAND case is regression pins only; there is no invented red-first for it. Separate red-first for the blocked/red-lane gap: `423f8f8c` (2 failed / 8 passed), then green at `37e62499` (an avoided red or blocked task still holds its lane and dependents, D-109). At `b0c34e66`: `nextTaskAvoidLand.test.ts` 16/16 and picker files 209/209. Required CI run 41548811336: the 4 required jobs are green; Workers Builds (not required) failed and was not investigated. The separate final-version review of the `b0c34e66` source and integration was accepted by the coordinator on 2026-11-03 at 06:19. This packet line is docs-only: no source, test, registry or decision change. Still needed: a packet carry-review of this delta and a distinct normal lander. Not landed and not done; no self-review or model-identity claim (Hark's underlying model unverified; D-284 waiver not relied on).
