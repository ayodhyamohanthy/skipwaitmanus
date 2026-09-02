#!/bin/bash
# Appends one row to docs/SYNC_LOG.md. Usage: append-sync-log.sh <workflow> <commit> <status>
WF="${1:-unknown}"
SHA="${2:-unknown}"
ST="${3:-unknown}"
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
printf "| %s | %s | %s | %s |\n" "$TS" "$WF" "$SHA" "$ST" >> docs/SYNC_LOG.md