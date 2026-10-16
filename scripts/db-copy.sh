#!/usr/bin/env bash
# Rehearsal tooling for the production MySQL move (old Azure server -> new Azure server).
# Modes: inventory (read-only on both), rehearse (writes ONLY to NEW database $TARGET_DB, default skipwait_rehearsal),
# verify (read-only on both: counts + content hashes + definitions). Never writes to the OLD server.
# Passwords arrive only as env (OLD_PWD, NEW_PWD) and are passed to clients through MYSQL_PWD. Never echoed.
set -euo pipefail
set +x
MODE="${1:?usage: db-copy.sh inventory|rehearse|verify}"
: "${OLD_HOST:?}" "${OLD_USER:?}" "${OLD_NAME:?}" "${OLD_PWD:?}" "${NEW_HOST:?}" "${NEW_USER:?}" "${NEW_PWD:?}"
OLD_PORT="${OLD_PORT:-3306}"; NEW_PORT="${NEW_PORT:-3306}"
TARGET_DB="${TARGET_DB:-skipwait_rehearsal}"
case "$TARGET_DB" in skipwait_rehearsal|skipwait) ;; *) echo "refusing TARGET_DB=$TARGET_DB (only skipwait_rehearsal or skipwait)"; exit 2;; esac
COMMON=(--ssl-mode=REQUIRED --connect-timeout=20 --default-character-set=utf8mb4 --init-command="SET time_zone='+00:00'")
oldq() { MYSQL_PWD="$OLD_PWD" mysql --host="$OLD_HOST" --port="$OLD_PORT" --user="$OLD_USER" "${COMMON[@]}" -N -B "$@"; }
newq() { MYSQL_PWD="$NEW_PWD" mysql --host="$NEW_HOST" --port="$NEW_PORT" --user="$NEW_USER" "${COMMON[@]}" -N -B "$@"; }
command -v mysqldump >/dev/null || { echo "mysqldump missing"; exit 2; }

inventory_one() { # label, function, db
  local label="$1" q="$2" db="$3"
  echo "== $label"
  $q -e "SELECT 'version', VERSION(); SELECT 'character_set_server', @@character_set_server; SELECT 'collation_server', @@collation_server; SELECT 'sql_mode', @@sql_mode; SELECT 'time_zone', @@global.time_zone; SELECT 'max_allowed_packet', @@max_allowed_packet; SELECT 'lower_case_table_names', @@lower_case_table_names; SELECT 'require_secure_transport', @@require_secure_transport; SELECT 'group_concat_max_len', @@group_concat_max_len;"
  if [ -n "$db" ]; then
    echo "-- database $db"
    $q -e "SELECT 'db_default_charset_collation', DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$db'; SELECT 'tables', COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db' AND TABLE_TYPE='BASE TABLE'; SELECT 'views', COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA='$db'; SELECT 'triggers', COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$db'; SELECT 'routines', COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='$db'; SELECT 'events', COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='$db'; SELECT 'foreign_keys', COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='$db' AND CONSTRAINT_TYPE='FOREIGN KEY'; SELECT 'size_mb', ROUND(SUM(DATA_LENGTH+INDEX_LENGTH)/1048576,2) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db'; SELECT 'engines', ENGINE, COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db' AND TABLE_TYPE='BASE TABLE' GROUP BY ENGINE; SELECT 'table_collations', TABLE_COLLATION, COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db' AND TABLE_TYPE='BASE TABLE' GROUP BY TABLE_COLLATION; SELECT 'definers', DEFINER, COUNT(*) FROM (SELECT DEFINER FROM information_schema.VIEWS WHERE TABLE_SCHEMA='$db' UNION ALL SELECT DEFINER FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$db' UNION ALL SELECT DEFINER FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='$db') d GROUP BY DEFINER;"
  fi
}

sig() { # q db -> column+index signature hash (schema-name independent)
  local q="$1" db="$2"
  $q -e "SET SESSION group_concat_max_len=4294967295; SELECT MD5(GROUP_CONCAT(CONCAT_WS('|',TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IFNULL(CHARACTER_SET_NAME,''),IFNULL(COLLATION_NAME,''),IS_NULLABLE,IFNULL(COLUMN_DEFAULT,'~NULL~'),EXTRA) ORDER BY TABLE_NAME,ORDINAL_POSITION SEPARATOR ';')) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$db'" 
  $q -e "SET SESSION group_concat_max_len=4294967295; SELECT MD5(GROUP_CONCAT(CONCAT_WS('|',TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,IFNULL(SUB_PART,'')) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX SEPARATOR ';')) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='$db'"
}

case "$MODE" in
inventory)
  inventory_one "OLD $OLD_HOST" oldq "$OLD_NAME"
  inventory_one "NEW $NEW_HOST" newq ""
  echo "== NEW databases"; newq -e "SHOW DATABASES"
  L_OLD=$(oldq -e "SELECT @@lower_case_table_names"); L_NEW=$(newq -e "SELECT @@lower_case_table_names")
  [ "$L_OLD" = "$L_NEW" ] || { echo "FAIL: lower_case_table_names differs old=$L_OLD new=$L_NEW"; exit 1; }
  echo "OK: lower_case_table_names matches ($L_OLD)"
  ;;
rehearse)
  [ "$TARGET_DB" = skipwait_rehearsal ] || { echo "rehearse only writes skipwait_rehearsal"; exit 2; }
  echo "Recreating $TARGET_DB on NEW only"
  newq -e "DROP DATABASE IF EXISTS \`$TARGET_DB\`; CREATE DATABASE \`$TARGET_DB\` CHARACTER SET utf8mb4;"
  MYSQL_PWD="$OLD_PWD" mysqldump --host="$OLD_HOST" --port="$OLD_PORT" --user="$OLD_USER" --ssl-mode=REQUIRED \
    --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces \
    --default-character-set=utf8mb4 --hex-blob "$OLD_NAME" \
    | sed -E "s/DEFINER=\`[^\`]+\`@\`[^\`]+\`/DEFINER=\`$NEW_USER\`@\`%\`/g" \
    | MYSQL_PWD="$NEW_PWD" mysql --host="$NEW_HOST" --port="$NEW_PORT" --user="$NEW_USER" --ssl-mode=REQUIRED --default-character-set=utf8mb4 "$TARGET_DB"
  echo "Restore finished into $TARGET_DB (run verify next)"
  ;;
inflight)
  echo "== payments in flight on OLD (read-only); anything listed here must settle before the switch"
  oldq -D "$OLD_NAME" -e "SELECT 'paymentFulfillments pending/requires_review', COUNT(*) FROM paymentFulfillments WHERE status IN ('pending','requires_review'); SELECT 'paymentFulfillments created last 30m', COUNT(*) FROM paymentFulfillments WHERE createdAt > NOW() - INTERVAL 30 MINUTE; SELECT 'employerPaymentFulfillments not final (creating/provider_create_in_progress/pending/processing)', COUNT(*) FROM employerPaymentFulfillments WHERE status IN ('creating','provider_create_in_progress','pending','processing'); SELECT 'employerPaymentFulfillments created last 30m', COUNT(*) FROM employerPaymentFulfillments WHERE createdAt > NOW() - INTERVAL 30 MINUTE;"
  ;;
cutover-copy)
  [ "$TARGET_DB" = skipwait ] || { echo "cutover-copy requires TARGET_DB=skipwait"; exit 2; }
  n=$(newq -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='skipwait'")
  [ "$n" = 0 ] || { echo "REFUSING: NEW skipwait already has $n tables (never overwrite)"; exit 3; }
  newq -e "CREATE DATABASE IF NOT EXISTS \`skipwait\` CHARACTER SET utf8mb4;"
  MYSQL_PWD="$OLD_PWD" mysqldump --host="$OLD_HOST" --port="$OLD_PORT" --user="$OLD_USER" --ssl-mode=REQUIRED \
    --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces \
    --default-character-set=utf8mb4 --hex-blob "$OLD_NAME" \
    | sed -E "s/DEFINER=\`[^\`]+\`@\`[^\`]+\`/DEFINER=\`$NEW_USER\`@\`%\`/g" \
    | MYSQL_PWD="$NEW_PWD" mysql --host="$NEW_HOST" --port="$NEW_PORT" --user="$NEW_USER" --ssl-mode=REQUIRED --default-character-set=utf8mb4 skipwait
  echo "Cutover copy finished into skipwait (run verify with target skipwait next)"
  ;;
inspect-late)
  [ "$TARGET_DB" = skipwait ] || { echo "requires TARGET_DB=skipwait"; exit 2; }
  for t in subscriptionCheckoutIntents operationalActivityLogs paymentFulfillments employerPaymentFulfillments; do
    m=$(newq -D "$TARGET_DB" -e "SELECT IFNULL(MAX(id),0) FROM \`$t\`")
    echo "== $t: rows on OLD with id > NEW max ($m)"
    if [ "$t" = subscriptionCheckoutIntents ]; then
      oldq -D "$OLD_NAME" -e "SELECT i.id, i.userId, IFNULL(u.email,'-'), i.status, i.plan, i.amount, i.createdAt FROM \`$t\` i LEFT JOIN users u ON u.id=i.userId WHERE i.id > $m ORDER BY i.id"
    else
      oldq -D "$OLD_NAME" -e "SELECT COUNT(*), MIN(createdAt), MAX(createdAt) FROM \`$t\` WHERE id > $m"
    fi
  done
  ;;
delta-sync)
  [ "$TARGET_DB" = skipwait ] || { echo "requires TARGET_DB=skipwait"; exit 2; }
  : "${DELTA_TABLES:?space separated table names}"
  for t in $DELTA_TABLES; do
    case "$t" in *[!A-Za-z0-9_]*) echo "bad table $t"; exit 2;; esac
    echo "REPLACE-sync $t (old -> new, never deletes, never writes old)"
    MYSQL_PWD="$OLD_PWD" mysqldump --host="$OLD_HOST" --port="$OLD_PORT" --user="$OLD_USER" --ssl-mode=REQUIRED \
      --single-transaction --no-create-info --replace --skip-triggers --set-gtid-purged=OFF --no-tablespaces \
      --default-character-set=utf8mb4 --hex-blob "$OLD_NAME" "$t" \
      | MYSQL_PWD="$NEW_PWD" mysql --host="$NEW_HOST" --port="$NEW_PORT" --user="$NEW_USER" --ssl-mode=REQUIRED --default-character-set=utf8mb4 skipwait
  done
  ;;
oldstats)
  echo "== OLD read-only stats at $(date -u +%FT%TZ)"
  oldq -D "$OLD_NAME" -e "SELECT 'oal_count_max_id_max_createdAt', COUNT(*), MAX(id), MAX(createdAt) FROM operationalActivityLogs; SELECT 'jobruns_count_max_id', COUNT(*), MAX(id) FROM jobRuns; SELECT 'checkoutintents_count_max_id_max_createdAt', COUNT(*), MAX(id), MAX(createdAt) FROM subscriptionCheckoutIntents; SELECT 'balances_count', COUNT(*) FROM balances; SELECT 'users_count_max_createdAt', COUNT(*), MAX(createdAt) FROM users;"
  echo "== paymentFulfillments breakdown (no personal data)"
  oldq -D "$OLD_NAME" -e "SELECT provider, status, role, IFNULL(reconciliationReason,'-'), COUNT(*), COUNT(DISTINCT userId), MIN(createdAt), MAX(createdAt), SUM(amount), MIN(currency), SUM(creditedAt IS NOT NULL), SUM(lastCheckedAt IS NOT NULL), SUM(tokenCount) FROM paymentFulfillments GROUP BY 1,2,3,4 ORDER BY 5 DESC LIMIT 40;"
  echo "== sample providerEventId prefixes"
  oldq -D "$OLD_NAME" -e "SELECT provider, status, LEFT(providerEventId,8), COUNT(*) FROM paymentFulfillments GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 15; SELECT 'users_with_fulfillments', COUNT(DISTINCT userId) FROM paymentFulfillments; SELECT 'distinct_email_domains_of_those_users', COUNT(DISTINCT SUBSTRING_INDEX(u.email,'@',-1)) FROM users u WHERE u.id IN (SELECT userId FROM paymentFulfillments);"
  ;;
verify)
  fail=0
  S_OLD=$(sig oldq "$OLD_NAME" | tr '\n' ' '); S_NEW=$(sig newq "$TARGET_DB" | tr '\n' ' ')
  if [ "$S_OLD" = "$S_NEW" ]; then echo "OK definitions identical (columns+indexes): $S_OLD"; else echo "DIFF definitions: old=$S_OLD new=$S_NEW"; fail=1; fi
  printf '%-40s %10s %10s %s\n' TABLE OLD_ROWS NEW_ROWS RESULT
  for t in $(oldq -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='$OLD_NAME' AND TABLE_TYPE='BASE TABLE' ORDER BY 1"); do
    cols=$(oldq -e "SET SESSION group_concat_max_len=1000000; SELECT GROUP_CONCAT(IF(DATA_TYPE IN ('binary','varbinary','blob','tinyblob','mediumblob','longblob','bit','geometry'),CONCAT('IFNULL(HEX(\`',COLUMN_NAME,'\`),''~NULL~'')'),CONCAT('IFNULL(CAST(\`',COLUMN_NAME,'\` AS CHAR),''~NULL~'')')) ORDER BY ORDINAL_POSITION SEPARATOR ',') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$OLD_NAME' AND TABLE_NAME='$t'" | tail -1)
    hq="SET SESSION group_concat_max_len=4294967295; SELECT COUNT(*), IFNULL(MD5(GROUP_CONCAT(h ORDER BY h SEPARATOR '')),'empty') FROM (SELECT MD5(CONCAT_WS('|',$cols)) h FROM \`@DB@\`.\`$t\`) x"
    o=$(oldq -e "${hq//@DB@/$OLD_NAME}" | tail -1); n=$(newq -e "${hq//@DB@/$TARGET_DB}" 2>&1 | tail -1)
    oc=${o%%$'\t'*}; nc=${n%%$'\t'*}
    if [ "$o" = "$n" ]; then r=OK; else r="DIFF (old=${o#*$'\t'} new=${n#*$'\t'})"; fail=1; fi
    printf '%-40s %10s %10s %s\n' "$t" "$oc" "$nc" "$r"
  done
  [ "$fail" = 0 ] && echo "VERIFY PASS: every table identical (count + content hash), definitions identical" || { echo "VERIFY FAIL"; exit 1; }
  ;;
*) echo "unknown mode $MODE"; exit 2;;
esac
