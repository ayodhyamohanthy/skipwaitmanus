// Opt-in disposable, socket-only MySQL fixture. Never changes a server setting.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { verifyBillingReviewSchema } from './verify-billing-review-schema.mjs';
const socketPath = process.env.D067_PARTIAL_REVOKES_FIXTURE_SOCKET;
if (!socketPath || !/^\/tmp\/d067-visibility-[a-zA-Z0-9_-]+\/mysql.sock$/.test(socketPath)) throw new Error('Explicit disposable fixture socket required');
const admin = await mysql.createConnection({socketPath,user:'root'});
let verifier;
try {
  const [[settings]] = await admin.query('SELECT @@GLOBAL.partial_revokes partialRevokes, @@GLOBAL.skip_networking socketOnly');
  assert.equal(settings.partialRevokes,1); assert.equal(settings.socketOnly,1);
  const suffix = randomBytes(6).toString('hex');
  const parent = `d067_worker_parent_${suffix}`, hidden = `d067_worker_hidden_${suffix}`, user = `verifier_${suffix}`;
  await admin.query(`CREATE DATABASE ${parent}`); await admin.query(`CREATE DATABASE ${hidden}`);
  await admin.query(`USE ${parent}`);
  await admin.query(await readFile('drizzle/deploy/0100_billing_review_outbox.sql','utf8'));
  await admin.query(`CREATE TABLE ${hidden}.child (parent_id int, FOREIGN KEY(parent_id) REFERENCES ${parent}.billingReviewOutbox(id))`);
  await admin.query(`CREATE USER '${user}'@'localhost'`);
  await admin.query(`GRANT SELECT ON ${parent}.* TO '${user}'@'localhost'`);
  await admin.query(`GRANT TRIGGER ON ${parent}.billingReviewOutbox TO '${user}'@'localhost'`);
  await admin.query(`GRANT REFERENCES ON *.* TO '${user}'@'localhost'`);
  await admin.query(`REVOKE REFERENCES ON ${hidden}.* FROM '${user}'@'localhost'`);
  verifier = await mysql.createConnection({socketPath,user,database:parent});
  const query = `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA='${parent}' AND REFERENCED_TABLE_NAME='billingReviewOutbox'`;
  const [adminRows] = await admin.query(query), [visibleRows] = await verifier.query(query);
  assert.equal(adminRows.length,1); assert.equal(visibleRows.length,0);
  // Simulates only the previous missing context guard, preserving all other checks.
  const previousGuard = {query: query => query.startsWith('SELECT @@GLOBAL.partial_revokes') ? Promise.resolve([[{partialRevokes:0,activeRoles:'NONE'}]]) : verifier.query(query)};
  await verifyBillingReviewSchema(previousGuard);
  await assert.rejects(verifyBillingReviewSchema(verifier), /unsupported metadata visibility/);
  await admin.query("INSERT INTO billingReviewOutbox (obligationKey,conflictDigest,updatedAt,nextAttemptAt,createdAt) VALUES (?,?,NOW(3),NOW(3),NOW(3))",['a'.repeat(64),'b'.repeat(64)]);
  await admin.query(`INSERT INTO ${hidden}.child VALUES (1)`);
  await assert.rejects(admin.query('DELETE FROM billingReviewOutbox WHERE id=1'), {code:'ER_ROW_IS_REFERENCED_2'});
  console.log('Socket-only partial_revokes ON: admin sees FK, verifier hides FK; previous guard accepts, new guard rejects; delete ER_ROW_IS_REFERENCED_2');
} finally { if(verifier) await verifier.end(); await admin.end(); }
