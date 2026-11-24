# SEC-deps-nov24: patch the high advisories on main and let safe Dependabot updates land on green CI (D-388)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. The picker hands out this row; do only what it prints.

| Field | Value |
|---|---|
| Row | `SEC-deps-nov24` (Tier 2, lane `deps`) |
| Verified against | `main` `84d697b1` |
| Decisions | D-388, D-191 (the previous pass), D-019, D-082, D-370 |

## Why

Every push on Nov 24 printed "GitHub found 26 vulnerabilities on ayodhyamohanthy/skipwaitmanus's
default branch (8 high, 13 moderate, 5 low)". `pnpm audit` on `84d697b1` reports 6 high, 14
moderate, 4 low, 0 critical. The high ones:

| Package | Vulnerable | Patched |
|---|---|---|
| `vite` | `>=7.0.0 <=7.3.6` | `>=7.3.7` |
| `undici` (four paths) | `>=8.0.0 <8.12.2` | `>=8.12.2` |
| `follow-redirects` | `>=1.16.0 <=1.16.1` | `>=1.16.2` |

Dependabot PRs #1462 (`tsx`) and #1463 (`@aws-sdk/client-s3`) have been open since Nov 22 with
nobody landing them, so fixes that Dependabot already wrote sit unmerged.

## What

1. Raise the affected packages (direct ranges, or a `pnpm.overrides` entry for transitive ones) to
   the patched versions, staying inside the current major. Regenerate `pnpm-lock.yaml` with pnpm
   10.34.7 and review the diff: only these packages and what they pull in may move.
2. Handle the moderate advisories the same way where the patch stays inside the current major; list
   any left with the reason (no patched version, or a major bump needed).
3. Add `.github/workflows/dependabot-auto-merge.yml`: on `pull_request` from `dependabot[bot]`, read
   `dependabot/fetch-metadata`, and enable auto-merge with a merge commit only for semver-patch
   updates of any dependency and semver-minor updates of devDependencies. Required CI (D-370) still
   gates every merge; nothing merges red. Minor runtime and all major updates stay for a person.
4. Close #1462 and #1463 if step 1 supersedes them; otherwise let step 3 land them.
5. No source change. If `pnpm check`, a test or the build fails because of a changed type or
   behaviour, stop and report the failing output; do not patch around it.

## Tests and proof

The full gate on the branch merged with `main`: `pnpm check`, `pnpm vitest run`, `pnpm build`, the
design-token audit. `pnpm audit` before and after, pasted in the pull request: no high or critical
left. A contract test (`scripts/dependabotAutoMerge.test.ts`) reads the workflow and asserts it runs
only for `dependabot[bot]`, uses `--merge`, and refuses majors and runtime minors.

## Status

- SEC-deps-nov24: in progress — DeepSeek V4.1 Flash · ffe5, taking over the quiet claim of Claude Code · d275 and DeepSeek V4.1 Flash · a490 — 2026-11-24 — branch agent/queue/sec-deps-nov24

### Advisories after the patch

`pnpm audit` on the branch lockfile: 0 critical, 0 high, 2 moderate, 0 low (main before: 0 critical,
6 high, 14 moderate, 4 low). The two left need a major bump, so they stay for a person:

| Package | Installed | Patched | Why it stays |
|---|---|---|---|
| `glob` | 11.1.0 | >=14.0.2 | The patch is a major bump (11 → 14) under `vite-plugin-pwa>workbox-build`; the packet keeps patches inside the current major. |
| `minimatch` | 10.2.6 | >=11.0.1 | The patch is a major bump (10 → 11) under the same `workbox-build>glob` path. |
