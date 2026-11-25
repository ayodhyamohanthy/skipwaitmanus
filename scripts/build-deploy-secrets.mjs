#!/usr/bin/env node
// OPS-deploy-secrets-file (D-369): build the private file uploaded with the Worker version.
// OPS-reviewer-credential-transport: reset is opt-in; both reviewer inputs use the protected secret channel.
// OPS-reviewer-plaintext-reset (D-373 (3)): with both plaintext secrets set, the reset derives the two hashes here,
// so one secret pair serves the release and the signed-in QA runner. Values are never printed or put in arguments.
// Usage: node scripts/build-deploy-secrets.mjs <output.json> | --validate-reviewer-reset
// Exit 2: no path; 3: invalid reset option or reviewer pair; 4: partial database config.
import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("build-deploy-secrets: output path required");
  process.exit(2);
}

const env = process.env;
const secrets = {};
const reset = env.REVIEWER_RESET ?? "";
if (!["", "false", "true"].includes(reset)) {
  console.error("build-deploy-secrets: REVIEWER_RESET must be true or false");
  process.exit(3);
}

// Match the existing reviewer login format. Validate the complete pair before creating any file.
const REVIEWER_NAMES = ["REVIEWER_SEEKER_PASSWORD_HASH", "REVIEWER_REFERRER_PASSWORD_HASH"];
const SCRYPT_HASH = /^scrypt\$[0-9a-fA-F]+\$[0-9a-fA-F]{64}$/;
// Each Worker hash binding and the plaintext repository secret it can be derived from.
const PLAINTEXT_OF = { REVIEWER_SEEKER_PASSWORD_HASH: "REVIEWER_SEEKER_PASSWORD", REVIEWER_REFERRER_PASSWORD_HASH: "REVIEWER_REFERRER_PASSWORD" };
const MIN_PLAINTEXT = 16;
// The same algorithm as hashReviewerPassword in server/_core/reviewerLogin.ts: a random hex salt, scrypt, 32 bytes.
const hashOf = password => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
};
const plaintextGiven = REVIEWER_NAMES.filter(name => Boolean(env[PLAINTEXT_OF[name]]));
if (reset === "true" && plaintextGiven.length === 1) {
  const missing = REVIEWER_NAMES.map(name => PLAINTEXT_OF[name]).find(name => !env[name]);
  console.error(`build-deploy-secrets: reviewer reset needs both plaintext secrets or neither; ${missing} is missing`);
  process.exit(3);
}
if (reset === "true" && plaintextGiven.length === 2) {
  for (const name of REVIEWER_NAMES) {
    const value = env[PLAINTEXT_OF[name]];
    if (value.length < MIN_PLAINTEXT || /[\r\n]/.test(value)) {
      console.error(`build-deploy-secrets: ${PLAINTEXT_OF[name]} must be at least ${MIN_PLAINTEXT} characters on one line`);
      process.exit(3);
    }
    secrets[name] = hashOf(value);
  }
} else if (reset === "true") {
  for (const name of REVIEWER_NAMES) {
    const value = env[name];
    if (!value || !SCRYPT_HASH.test(value) || /[\r\n]/.test(value)) {
      console.error("build-deploy-secrets: reviewer reset requires both protected inputs in valid scrypt format");
      process.exit(3);
    }
    secrets[name] = value;
  }
}

// A workflow preflight runs before migration/deploy jobs, without database or Cloudflare credentials.
if (out === "--validate-reviewer-reset") {
  console.log(reset === "true" ? "Reviewer reset inputs validated; values withheld" : "Reviewer reset not requested; existing bindings are kept");
  process.exit(0);
}

const db = [env.NEWDB_HOST, env.NEWDB_USER, env.NEWDB_PASSWORD];
if (db.some(Boolean)) {
  if (!db.every(Boolean)) {
    console.error("build-deploy-secrets: NEWDB_HOST, NEWDB_USER and NEWDB_PASSWORD must be set together");
    process.exit(4);
  }
  secrets.DATABASE_URL = `mysql://${env.NEWDB_USER}:${encodeURIComponent(env.NEWDB_PASSWORD)}@${env.NEWDB_HOST}:3306/skipwait`;
}

writeFileSync(out, JSON.stringify(secrets), { mode: 0o600 });
const names = Object.keys(secrets);
console.log(`Secrets uploaded with this release: ${names.length ? names.join(", ") : "none (existing secrets are kept)"}`);
