#!/usr/bin/env bash
# Deploy-pipeline migrations must be safe to re-run and never destructive.
#
# ONE awk PROCESS, NOT ~90 SPAWNS. The previous version ran sed, tr and three
# greps per file; with 18 migrations that is ~90 short-lived processes, and the
# spawn cost dominated everything -- the lint took 24.5s for 72KB of SQL. The
# identical checks in a single pass run in well under a second, which matters
# because this script is invoked by quality:gate and by the deploy pipeline.
set -euo pipefail
dir="${1:-drizzle/deploy}"

awk '
  FNR == 1 {
    # Flush the previous file before starting a new one.
    if (file != "") report()
    file = FILENAME
    n = split(FILENAME, parts, "/"); base = parts[n]
    if (base !~ /^[0-9]{4}_[a-z0-9_]+\.sql$/) {
      printf "::error::%s must be named NNNN_snake_case.sql\n", base; status = 1
    }
    body = ""
  }
  {
    line = $0
    sub(/--.*$/, "", line)          # strip comments, as `sed -e "s/--.*$//"` did
    body = body " " toupper(line)   # uppercase, as `tr` did
  }
  END { if (file != "") report() }

  function report(   m, s) {
    if (body ~ /(^|[^A-Z_])(DROP|TRUNCATE|RENAME)[ \t]+(TABLE|DATABASE|COLUMN|INDEX)/ || body ~ /DELETE[ \t]+FROM/) {
      printf "::error::%s contains a destructive statement\n", base; status = 1
    }
    # Every CREATE TABLE must be IF NOT EXISTS. The capture stops at the table
    # name plus at most two tokens, mirroring the original bounded {0,2}.
    s = body
    while (match(s, /CREATE[ \t]+TABLE[ \t]+[^ \t(]+([ \t]+[^ \t(]+){0,2}/)) {
      chunk = substr(s, RSTART, RLENGTH)
      if (chunk !~ /CREATE[ \t]+TABLE[ \t]+IF[ \t]+NOT[ \t]+EXISTS/) {
        printf "::error::%s: CREATE TABLE must use IF NOT EXISTS\n", base; status = 1
        break
      }
      s = substr(s, RSTART + RLENGTH)
    }
    if (body ~ /(^|\n)[ \t]*(ALTER[ \t]+TABLE|CREATE[ \t]+(UNIQUE[ \t]+)?INDEX)/) {
      printf "::error::%s: ALTER TABLE / CREATE INDEX must be guarded by information_schema (run via PREPARE), not bare\n", base; status = 1
    }
  }
  END { exit status }
' "$dir"/*.sql
