# Packet PICKER-dep-about-to-land: a parked dependency is never "about to land"

Row `PICKER-dep-about-to-land` (Tier 2, picker only). Ruling: D-412 (3), applied by D-415 (4)(c).

## Problem
D-412 (3): a withheld draft is refreshed only when every unmet dependency already has an open pull request with green required CI. In `scripts/nextTaskCore.mjs` (around line 1330), `depAboutToLand = dep.pr && dep.ci === "green" && !dep.statusOnly`, and `statusOnly` is computed only for `todo` rows. So a dependency parked at `owner`, or a blocked one, whose open pull request changes only documentation, counts as about to land.

That is why D-048-dark-mode (only unmet dependency: D-048-K-kit, status `owner`, 11 of 39 dependencies not done, PR #1656 docs-only) was handed out 8 times since Nov 26 as a refresh. The latest refresh turned PR #1691's CI red (32 boundary failures).

## Change
`depAboutToLand(dep)` is true only when all of these hold:
- the dependency has an open pull request with green required CI;
- that pull request is not documentation-only for a row that owns source (the D-412 (4)(b) rule, applied whatever the dependency's status);
- the dependency's own status is not `owner`;
- it is not blocked waiting for evidence;
- it has no unmet dependencies of its own.

## Tests first
In `scripts/nextTaskRefreshDrafts.test.ts`:
- A dependency parked at `owner` with a green docs-only PR does not trigger a refresh.
- A blocked dependency does not trigger one.
- A dependency waiting on its own unmet dependencies does not trigger one.
- A dependency with a green PR that changes its owned source still does, as today.
- The D-048-dark-mode / D-048-K-kit shape from the board is covered as a fixture.

## Never
No other hand-out, hold, review or landing rule changes. PR #1691's CI is not repaired by this row: it stays as it is until D-048-K-kit can actually land.

## Owns
`scripts/nextTaskCore.mjs`, `scripts/nextTaskRefreshDrafts.test.ts`, this packet.

## Status
- PICKER-dep-about-to-land: registered by Claude Code · 77ec, 2026-11-28 (D-415); nothing built.
