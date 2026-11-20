#!/usr/bin/env node
// OPS-deploy-secrets-file (D-369): build the JSON secrets file that `wrangler deploy --secrets-file`
// uploads with the Worker version itself. Cloudflare refuses a later secret edit (API 10215) while a
// Workers Builds branch preview is the newest version, so secrets must ride the release.
// Usage: node scripts/build-deploy-secrets.mjs <output.json>
// Reads NEWDB_HOST/NEWDB_USER/NEWDB_PASSWORD and the optional REVIEWER_SEEKER_HASH/REVIEWER_REFERRER_HASH.
// Prints secret names only, never a value. Exit 2: no path; 3: malformed reviewer hash; 4: partial database config.
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("build-deploy-secrets: output path required");
  process.exit(2);
}

const env = process.env;
const secrets = {};

const db = [env.NEWDB_HOST, env.NEWDB_USER, env.NEWDB_PASSWORD];
if (db.some(Boolean)) {
  if (!db.every(Boolean)) {
    console.error("build-deploy-secrets: NEWDB_HOST, NEWDB_USER and NEWDB_PASSWORD must be set together");
    process.exit(4);
  }
  secrets.DATABASE_URL = `mysql://${env.NEWDB_USER}:${encodeURIComponent(env.NEWDB_PASSWORD)}@${env.NEWDB_HOST}:3306/skipwait`;
}

// The exact form server/_core/reviewerLogin.ts verifies; a line break could smuggle a second entry.
const SCRYPT_HASH = /^scrypt\$[0-9a-fA-F]+\$[0-9a-fA-F]{64}$/;
for (const [name, source] of [
  ["REVIEWER_SEEKER_PASSWORD_HASH", "REVIEWER_SEEKER_HASH"],
  ["REVIEWER_REFERRER_PASSWORD_HASH", "REVIEWER_REFERRER_HASH"],
]) {
  const value = env[source];
  if (!value) continue;
  if (!SCRYPT_HASH.test(value) || /[\r\n]/.test(value)) {
    console.error(`build-deploy-secrets: ${source} is not a valid scrypt hash`);
    process.exit(3);
  }
  secrets[name] = value;
}

writeFileSync(out, JSON.stringify(secrets), { mode: 0o600 });
const names = Object.keys(secrets);
console.log(`Secrets uploaded with this release: ${names.length ? names.join(", ") : "none (existing secrets are kept)"}`);
