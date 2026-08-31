#!/bin/zsh
# Restore a gzipped dump produced by db-backup.sh into the configured database.
# Usage: ./scripts/db-restore.sh backups/skipwait-XXXX.sql.gz [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?usage: db-restore.sh <dump.sql.gz> [--yes]}"
[ -f "$FILE" ] || { echo "no such file: $FILE"; exit 1; }
if [ "${2:-}" != "--yes" ]; then
  printf "This OVERWRITES the configured database with %s. Type RESTORE to continue: " "$FILE"
  read -r ANSWER
  [ "$ANSWER" = "RESTORE" ] && echo "Proceeding..." || { echo "Aborted."; exit 1; }
fi
node -e "
const fs=require('fs');
const line=fs.readFileSync('.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const url=new URL(line.slice(13));
console.log([url.hostname, url.port||3306, url.pathname.slice(1), decodeURIComponent(url.username||''), decodeURIComponent(url.password||'')].join(' '));
" > .openclaw/tmp/db-conn.txt
read -r HOST PORT DB USER PASS < .openclaw/tmp/db-conn.txt
mysql -h "$HOST" -P "$PORT" -u "$USER" -p"$PASS" -e "CREATE DATABASE IF NOT EXISTS \`$DB\`"
gunzip -c "$FILE" | mysql -h "$HOST" -P "$PORT" -u "$USER" -p"$PASS" "$DB"
rm -f .openclaw/tmp/db-conn.txt
echo "restore complete into $DB"
