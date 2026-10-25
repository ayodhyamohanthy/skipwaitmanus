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
  ["asks as seeker", "SELECT COUNT(*) n FROM referralRequests r JOIN users u ON u.id = r.jobSeekerId WHERE u.openId LIKE 'reviewer_%'"],
  ["asks as referrer", "SELECT COUNT(*) n FROM referralRequests r JOIN users u ON u.id = r.referrerId WHERE u.openId LIKE 'reviewer_%'"],
  ["direct messages sent", "SELECT COUNT(*) n FROM messages m JOIN users u ON u.id = m.senderId WHERE u.openId LIKE 'reviewer_%'"],
  ["opportunities posted", "SELECT COUNT(*) n FROM companyOpportunities o JOIN users u ON u.id = o.ownerId WHERE u.openId LIKE 'reviewer_%'"],
  ["follows (either direction)", "SELECT COUNT(*) n FROM userFollows f JOIN users u ON u.id = f.followerUserId OR u.id = f.followingUserId WHERE u.openId LIKE 'reviewer_%'"],
  ["blocks (either direction)", "SELECT COUNT(*) n FROM userBlocks b JOIN users u ON u.id = b.blockerUserId OR u.id = b.blockedUserId WHERE u.openId LIKE 'reviewer_%'"],
  ["safety reports filed", "SELECT COUNT(*) n FROM safetyReports s JOIN users u ON u.id = s.reporterUserId WHERE u.openId LIKE 'reviewer_%'"],
  ["payment fulfillments", "SELECT COUNT(*) n FROM paymentFulfillments p JOIN users u ON u.id = p.userId WHERE u.openId LIKE 'reviewer_%'"],
  ["paid wallets", "SELECT COUNT(*) n FROM tokenBalances t JOIN users u ON u.id = t.userId WHERE u.openId LIKE 'reviewer_%' AND t.plan <> 'free'"],
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
