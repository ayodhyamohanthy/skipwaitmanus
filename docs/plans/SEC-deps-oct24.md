# SEC-deps-oct24: patch four production dependencies with known advisories (D-191)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085) on Oct 24 2026. The picker hands out this row; do only what it prints.

| Field | Value |
|---|---|
| Row | `SEC-deps-oct24` (Tier 2, lane `deps`) |
| Verified against | `main` `02a8a028` |
| Decisions | D-191, D-019 (basics always work), D-082 |

## Why
`pnpm audit --prod` on `main` `02a8a028` (Oct 24) reports 1 critical and 4 high advisories in four packages the product ships:

| Package (resolved) | Path | Advisory | Patched |
|---|---|---|---|
| `dompurify` 3.4.16 | `streamdown` > `mermaid` > `dompurify` (client) | `SAFE_FOR_TEMPLATES` bypass (critical); `IN_PLACE` hook (high) | `>=3.4.17` |
| `zod` 4.1.12 | direct (server and client validation) | memory exhaustion while validating oversized input (high) | `>=4.6.6` |
| `body-parser` 1.20.6 | `express` > `body-parser` (pinned by a pnpm override) | denial of service (high) | `>=1.20.9` |
| `undici` 7.29.1 | direct (`server/jobLinkPreview.ts` fetches job pages) | denial of service (high) | `>=7.30.1` |

Three of them sit on the API's request path, so each is an availability risk for a basic (D-019).

## What
1. `package.json`: raise the `dompurify` override to `>=3.4.17`, the `body-parser` override to `1.20.9` or the newest 1.20.x, `zod` to `^4.6.6`, and `undici` to `^7.30.1`. Nothing else.
2. Regenerate `pnpm-lock.yaml` with pnpm 10.34.7 (`pnpm install`), and review the lockfile diff: only these packages and what they pull in may move.
3. No source change. If `pnpm check` or a test fails because of a changed type or behaviour (most likely `zod`), stop and report it with the failing output; do not patch around it.

## Tests and proof
- The full gate on the branch merged with `main`: `pnpm check`, `pnpm vitest run`, `pnpm build`, and the design-token audit.
- `pnpm audit --prod` before and after, both pasted in the pull request: no critical or high advisory left for these four packages.
- After landing, watch CI, Deploy API and Deploy Web to the end, and confirm `/api/health` serves the landed commit (D-082).

## Owns
`package.json`, `pnpm-lock.yaml`, and this file's Status line.

## Status
- SEC-deps-oct24: todo (D-191).
