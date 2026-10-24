#!/usr/bin/env bash
# Applies pending drizzle/deploy/*.sql to production MySQL before the API
# deploy. Each file runs once, in filename order, and is recorded with its
# sha256 in schemaDeployMigrations. Any failure exits non-zero so the deploy
# job (which needs this one) never starts. Files must be idempotent.
set -euo pipefail
# macOS self-hosted runners have shasum, not GNU sha256sum; same digest either way.
sha256_portable(){ if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
dir="${DEPLOY_MIGRATIONS_DIR:-drizzle/deploy}"
bash scripts/lint-deploy-migrations.sh "$dir"
: "${DB_HOST:?DB_HOST repository variable is missing}"
: "${DB_USER:?DB_USER repository variable is missing}"
: "${DB_NAME:?DB_NAME repository variable is missing}"
: "${MYSQL_PWD:?SKIPWAIT_DB_PASSWORD secret is missing}"
export MYSQL_PWD
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
mysql_cmd=(mysql --host="$DB_HOST" --port="${DB_PORT:-3306}" --user="$DB_USER" --ssl-mode=REQUIRED --connect-timeout=15 --batch --skip-column-names "$DB_NAME")

if ! "${mysql_cmd[@]}" -e "SELECT 1" >/dev/null 2>/tmp/mysql-connect.err; then
  echo "::error title=Database unreachable::Could not connect to $DB_HOST as $DB_USER: $(head -c 300 /tmp/mysql-connect.err). If this is a timeout, the Azure MySQL firewall is blocking GitHub runners."
  echo "### Migration gate FAILED: database unreachable" >> "$summary"
  exit 2
fi

"${mysql_cmd[@]}" -e "CREATE TABLE IF NOT EXISTS \`schemaDeployMigrations\` (\`filename\` varchar(191) NOT NULL PRIMARY KEY, \`sha256\` char(64) NOT NULL, \`appliedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`commitSha\` varchar(64) NULL)"

applied=0
shopt -s nullglob
for file in $(printf '%s\n' "$dir"/*.sql | sort); do
  name=$(basename "$file")
  sum=$(sha256_portable "$file" | cut -d' ' -f1)
  recorded=$("${mysql_cmd[@]}" -e "SELECT sha256 FROM schemaDeployMigrations WHERE filename='${name//\'/}'")
  if [ -n "$recorded" ]; then
    if [ "$recorded" != "$sum" ]; then
      echo "::error title=Migration changed after apply::$name was applied with sha256 $recorded but now hashes to $sum. Add a new file instead of editing an applied one."
      echo "### Migration gate FAILED: $name changed after it was applied" >> "$summary"
      exit 4
    fi
    echo "skip $name (already applied)"
    continue
  fi
  echo "apply $name"
  if ! "${mysql_cmd[@]}" < "$file" > "/tmp/$name.out" 2> "/tmp/$name.err"; then
    echo "::error title=Migration failed::$name: $(head -c 600 "/tmp/$name.err")"
    echo "### Migration gate FAILED: $name" >> "$summary"
    printf '```\n%s\n```\n' "$(head -c 2000 "/tmp/$name.err")" >> "$summary"
    exit 3
  fi
  cat "/tmp/$name.out"
  "${mysql_cmd[@]}" -e "INSERT INTO schemaDeployMigrations (filename, sha256, commitSha) VALUES ('${name//\'/}', '$sum', '${GITHUB_SHA:-local}')"
  echo "- applied \`$name\`" >> "$summary"
  applied=$((applied + 1))
done
echo "### Migration gate passed ($applied applied)" >> "$summary"
echo "migration gate passed: $applied applied"
