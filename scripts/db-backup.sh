#!/bin/zsh
# Dump the production MySQL database to a timestamped, gzipped SQL file.
# Uses node + mysql2 (already in node_modules) — no local mysql client needed.
# Usage: ./scripts/db-backup.sh [output-dir]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$OUT_DIR/skipwait-$STAMP.sql.gz"
BACKUP_FILE="$FILE" node --input-type=module -e "
import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { gzipSync } from 'zlib';
const envLine = readFileSync('.env', 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
const url = new URL(envLine.slice(13).trim());
const conn = await createConnection({
  host: url.hostname, port: Number(url.port || 3306),
  user: decodeURIComponent(url.username || 'root'),
  password: decodeURIComponent(url.password || ''),
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});
let sql = \`-- skipwait.me dump \${new Date().toISOString()}\n\` +
  \`SET FOREIGN_KEY_CHECKS=0; SET UNIQUE_CHECKS=0; SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\`;
const [tables] = await conn.query('SHOW TABLES');
const names = tables.map(r => Object.values(r)[0]);
let totalRows = 0;
for (const name of names) {
  const [[create]] = await conn.query('SHOW CREATE TABLE \`' + name + '\`');
  sql += '\nDROP TABLE IF EXISTS \`' + name + '\`;\n' + create['Create Table'] + ';\n';
  const [rows] = await conn.query('SELECT * FROM \`' + name + '\`');
  totalRows += rows.length;
  for (const row of rows) {
    const vals = Object.values(row).map(v => v === null ? 'NULL' :
      Buffer.isBuffer(v) ? '0x' + v.toString('hex').toUpperCase() :
      typeof v === 'object' && v instanceof Date ? \"'\" + v.toISOString().slice(0,19).replace('T',' ') + \"'\" :
      typeof v === 'object' ? JSON.stringify(v).replace(/'/g, \"''\") :
      typeof v === 'number' ? String(v) : \"'\" + String(v).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, \"''\").replace(/\\n/g, '\\\\n') + \"'\");
    sql += 'INSERT INTO \`' + name + '\` VALUES (' + vals.join(',') + ');\n';
  }
}
sql += 'SET FOREIGN_KEY_CHECKS=1;\n';
await conn.end();
const gz = gzipSync(Buffer.from(sql, 'utf8'));
await (await import('fs/promises')).writeFile(process.env.BACKUP_FILE, gz);
console.log('backup written:', process.env.BACKUP_FILE, '| tables:', names.length, '| rows:', totalRows, '| size:', Math.round(gz.length/1024) + 'KB');
" "$FILE"
echo "done: $FILE"
