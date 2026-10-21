/**
 * One-off: create/re-key the least-privilege local-QA MySQL user on the
 * scratch database (skipwait_qa). Runs as the pipeline admin user from CI.
 * Never logs the password. Idempotent.
 */
import mysql from "mysql2/promise";

const adminUrl = process.env.ADMIN_DATABASE_URL;
const localPassword = process.env.QA_LOCAL_DB_PASSWORD;
if (!adminUrl || !localPassword) throw new Error("ADMIN_DATABASE_URL and QA_LOCAL_DB_PASSWORD required");

const conn = await mysql.createConnection({ uri: adminUrl, ssl: { minVersion: "TLSv1.2" }, multipleStatements: false });
const user = "skipwait_qa_local";
await conn.query(`CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY ?`, [localPassword]);
await conn.query(`ALTER USER '${user}'@'%' IDENTIFIED BY ?`, [localPassword]);
await conn.query(
  "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER, CREATE VIEW, REFERENCES ON `skipwait_qa`.* TO '" + user + "'@'%'"
);
await conn.query("FLUSH PRIVILEGES");
const [rows] = await conn.query("SELECT user, host FROM mysql.user WHERE user = ?", [user]);
console.log("qa local user ready:", JSON.stringify(rows));
await conn.end();
