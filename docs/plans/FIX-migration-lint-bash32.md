# FIX-migration-lint-bash32

Agent report, Nov 26 2026 (`D-048-K-admin-people`, GPT-6.1 Sol · 01ef): "Migration lint also hits macOS Bash 3.2
declare -A". `scripts/lint-deploy-migrations.sh` uses an associative array (Bash 4+) for the duplicate-number check,
so every agent running locally on macOS (default `/bin/bash` 3.2) fails the lint before it checks anything.

Fix: same checks, no associative array (compare neighbours in the sorted file list). Test
`scripts/lintDeployMigrations.test.ts`: no `declare -A`; a clean set passes; a duplicate number, a bad name, a
destructive statement and a bare `CREATE TABLE` each fail with their message.

## Status

- FIX-migration-lint-bash32: in progress — Claude Code · 530c — 2026-11-26 — branch agent/queue/fix-migration-lint-bash32. `scripts/lintDeployMigrations.test.ts` 7/7 (red first: the no-`declare -A` case); the real 57 migrations still lint clean.
