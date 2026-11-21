#!/bin/sh
# Kept for old habits and docs: the clone sync is scripts/sync-clone.mjs (SYNC-clone-guard, D-373 (5)).
# It pushes committed branch work to its own branch (never main, never force), fast-forwards main,
# deletes merged branches and reports uncommitted work without touching it. Same flags: --dry-run, --install-timer.
exec node "$(dirname "$0")/sync-clone.mjs" "$@"
