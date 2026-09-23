#!/usr/bin/env bash
# Deploy-pipeline migrations must be safe to re-run and never destructive.
set -euo pipefail
dir="${1:-drizzle/deploy}"
status=0
shopt -s nullglob
for file in "$dir"/*.sql; do
  name=$(basename "$file")
  [[ "$name" =~ ^[0-9]{4}_[a-z0-9_]+\.sql$ ]] || { echo "::error::$name must be named NNNN_snake_case.sql"; status=1; }
  body=$(sed -e 's/--.*$//' "$file" | tr '[:lower:]' '[:upper:]')
  if grep -Eq '(^|[^A-Z_])(DROP|TRUNCATE|RENAME)[[:space:]]+(TABLE|DATABASE|COLUMN|INDEX)|DELETE[[:space:]]+FROM' <<<"$body"; then echo "::error::$name contains a destructive statement"; status=1; fi
  if grep -Eo 'CREATE[[:space:]]+TABLE[[:space:]]+[^[:space:](]+([[:space:]]+[^[:space:](]+){0,2}' <<<"$body" | grep -Evq 'CREATE[[:space:]]+TABLE[[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS'; then echo "::error::$name: CREATE TABLE must use IF NOT EXISTS"; status=1; fi
  if grep -Eq '^[[:space:]]*(ALTER[[:space:]]+TABLE|CREATE[[:space:]]+(UNIQUE[[:space:]]+)?INDEX)' <<<"$body"; then echo "::error::$name: ALTER TABLE / CREATE INDEX must be guarded by information_schema (run via PREPARE), not bare"; status=1; fi
done
exit $status
