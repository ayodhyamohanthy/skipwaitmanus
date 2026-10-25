#!/usr/bin/env node
/**
 * REVIEWER-ISOLATION-1 read-only binding check (deploy-time, SELECT-only).
 *
 * Verifies the shared demo review accounts (openId LIKE 'reviewer_%') carry no
 * bindings to real-member data: asks, DM threads, opportunities, follows,
 * blocks, messages, safety reports, assistant tokens. Any row found means an
 * earlier test left the demo accounts entangled with real members and the
 * credential handover must wait for cleanup.
 *
 * Usage: DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... node scripts/reviewer-binding-check.mjs
 * Exits 1 (with the offending counts) when any binding exists. Never writes.
 */
import mysql from "mysql2/promise";

const { DB_HOST, DB_PORT = "3306", DB_USER, DB_PASSWORD, DB_NAME } = process.env;
for (const [key, value] of Object.entries({ DB_HOST, DB_USER, DB_PASSWORD, DB_NAME })) {
  if (!value) { console.error(`Missing ${key}`); process.exit(2); }
}

const checks = [
  ["referral requests (as seeker)", "SELECT COUNT(*) n FROM referral_requests r JOIN users u ON u.id = r.seekerId WHERE u.openId LIKE 'reviewer_%'"],
  ["referral requests (as referrer)", "SELECT COUNT(*) n FROM referral_requests r JOIN users u ON u.id = r.referrerId WHERE u.openId LIKE 'reviewer_%'"],
  ["dm thread memberships", "SELECT COUNT(*) n FROM dm_thread_participants p JOIN users u ON u.id = p.userId WHERE u.openId LIKE 'reviewer_%'"],
  ["direct messages sent", "SELECT COUNT(*) n FROM direct_messages m JOIN users u ON u.id = m.senderId WHERE u.openId LIKE 'reviewer_%'"],
  ["opportunities posted", "SELECT COUNT(*) n FROM opportunities o JOIN users u ON u.id = o.userId WHERE u.openId LIKE 'reviewer_%'"],
  ["follows (either direction)", "SELECT COUNT(*) n FROM follows f JOIN users u ON u.id = f.followerId OR u.id = f.followedId WHERE u.openId LIKE 'reviewer_%'"],
  ["blocks (either direction)", "SELECT COUNT(*) n FROM blocks b JOIN users u ON u.id = b.blockerId OR u.id = b.blockedId WHERE u.openId LIKE 'reviewer_%'"],
  ["safety reports filed", "SELECT COUNT(*) n FROM safety_reports s JOIN users u ON u.id = s.reporterId WHERE u.openId LIKE 'reviewer_%'"],
  ["payment fulfillments", "SELECT COUNT(*) n FROM payment_fulfillments p JOIN users u ON u.id = p.userId WHERE u.openId LIKE 'reviewer_%'"],
  ["subscription events / wallets", "SELECT COUNT(*) n FROM token_balances t JOIN users u ON u.id = t.userId WHERE u.openId LIKE 'reviewer_%' AND t.plan <> 'free'"],
];

const connection = await mysql.createConnection({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD, database: DB_NAME, ssl: { rejectUnauthorized: true } });
let dirty = 0;
try {
  for (const [label, sql] of checks) {
    try {
      const [rows] = await connection.query(sql);
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) { dirty += 1; console.error(`BINDING ${label}: ${n}`); }
      else console.log(`clean   ${label}`);
    } catch (error) {
      console.error(`UNVERIFIED ${label}: ${error.code ?? error.message} (table/column may differ - check the query against the live schema)`);
      dirty += 1;
    }
  }
} finally {
  await connection.end();
}
process.exit(dirty ? 1 : 0);
