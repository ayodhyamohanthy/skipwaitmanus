import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { billingReviewOutbox } from "../drizzle/schema";
import { drizzle } from "drizzle-orm/mysql2";
import { expect, it } from "vitest";
import { enqueueBillingReviewTx, runBillingReviewOutbox } from "./billingReviewOutbox";
// Explicit opt-in isolated fixture only. Never reads production application environment.
it.runIf(!!process.env.D067_ISOLATED_MYSQL_URL)("actual MySQL worker races, rollback, lease takeover and stale completion", async () => {
  const url = process.env.D067_ISOLATED_MYSQL_URL;
  if (!url || !url.includes("127.0.0.1:34879")) throw new Error("Only isolated fixture allowed");
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || target.port !== "34879" || (target.pathname && target.pathname !== "/" && !/^\/d067_worker_[a-zA-Z0-9_]+$/.test(target.pathname))) throw new Error("Explicit isolated worker database required");
  const database = `d067_worker_${randomBytes(8).toString("hex")}`;
  const admin = await mysql.createConnection(url);
  await admin.query(`CREATE DATABASE \`${database}\``);
  target.pathname = database;
  const pool = mysql.createPool({ uri: target.toString(), connectionLimit: 2, timezone: "Z" });
  const db = drizzle(pool);
  process.env.BILLING_ENV = "test"; process.env.CHARGEBEE_SITE = "fixture-test";
  process.env.ERROR_ALERT_FROM_EMAIL = "fixture@example.invalid"; process.env.RESEND_API_KEY = "fixture";
  try {
    const sql = await readFile("drizzle/deploy/0100_billing_review_outbox.sql", "utf8");
    await pool.query(sql); await pool.query(sql);
    const [columns] = await pool.query<mysql.RowDataPacket[]>("SHOW COLUMNS FROM billingReviewOutbox");
    expect(columns.map(r => r.Field)).toContain("submissionState"); expect(columns).toHaveLength(17);
    const [table] = await pool.query<mysql.RowDataPacket[]>("SHOW CREATE TABLE billingReviewOutbox");
    expect(String(table[0]["Create Table"])).toContain("ENGINE=InnoDB"); expect(String(table[0]["Create Table"])).toContain("ascii_bin");
    const [indexes] = await pool.query<mysql.RowDataPacket[]>("SHOW INDEX FROM billingReviewOutbox");
    expect(indexes.filter(r => r.Key_name === "billing_review_due_idx").map(r => r.Column_name)).toEqual(["status", "nextAttemptAt", "id"]);
    expect(indexes.find(r => r.Key_name === "billing_review_obligation_unique")?.Non_unique).toBe(0);
    const config = getTableConfig(billingReviewOutbox);
    expect(columns.map(r => r.Field)).toEqual(config.columns.map(c => c.name));
    for (const column of config.columns) {
      const actual = columns.find(r => r.Field === column.name)!;
      expect(actual.Null === "NO", column.name).toBe(column.notNull);
    }
    const reconcile = await readFile("server/schemaReconcile.ts", "utf8");
    const reconcileEntry = '{ table: "billingReviewOutbox", createSql: `';
    const reconcileStart = reconcile.indexOf(reconcileEntry);
    expect(reconcileStart, "billingReviewOutbox entry present in schemaReconcile").toBeGreaterThanOrEqual(0);
    const reconcileSql = reconcile.slice(reconcileStart + reconcileEntry.length, reconcile.indexOf("` },", reconcileStart)).replaceAll("\\`", "`");
    const normalize = (s: string) => s.replace(/--[^\n]*/g, "").replace(/;$/, "").replace(/\s+/g, " ").trim();
    expect(normalize(reconcileSql)).toBe(normalize(sql.trim()));
    // IF NOT EXISTS is not structural verification: deliberately wrong tables must fail the gate.
    await pool.query("CREATE TABLE incompatibleBillingReviewOutbox (id int PRIMARY KEY)");
    await pool.query(sql.replaceAll("billingReviewOutbox", "incompatibleBillingReviewOutbox"));
    const [incompatible] = await pool.query<mysql.RowDataPacket[]>("SHOW COLUMNS FROM incompatibleBillingReviewOutbox");
    expect(incompatible.map(r => r.Field)).not.toEqual(config.columns.map(c => c.name));
    const { verifyBillingReviewSchema } = await import("../scripts/verify-billing-review-schema.mjs");
    await verifyBillingReviewSchema(pool);
    // Every declared column is checked, not just the originally reported payload/id.
    const [fullColumns] = await pool.query<mysql.RowDataPacket[]>("SHOW FULL COLUMNS FROM billingReviewOutbox");
    const mutations: Array<[string, (column: mysql.RowDataPacket) => mysql.RowDataPacket]> = [
      ["stored generated", column => ({ ...column, Extra: "STORED GENERATED" })],
      ["virtual generated", column => ({ ...column, Extra: "VIRTUAL GENERATED" })],
      ["invisible", column => ({ ...column, Extra: `${column.Extra} INVISIBLE`.trim() })],
      ["on update", column => ({ ...column, Extra: "on update CURRENT_TIMESTAMP(3)" })],
      ["expression default", column => ({ ...column, Extra: "DEFAULT_GENERATED" })],
      ["default", column => ({ ...column, Default: "unexpected" })],
      ["nullable", column => ({ ...column, Null: column.Null === "YES" ? "NO" : "YES" })],
      ["type", column => ({ ...column, Type: "blob" })],
      ["collation", column => ({ ...column, Collation: "unexpected_collation" })],
    ];
    for (const column of fullColumns) {
      for (const [label, mutate] of mutations) {
        const connection = { query: async (query: string) => query === "SHOW FULL COLUMNS FROM billingReviewOutbox"
          ? [fullColumns.map(row => row.Field === column.Field ? mutate(row) : row)] : pool.query(query) };
        await expect(verifyBillingReviewSchema(connection), `${column.Field} ${label}`).rejects.toThrow();
      }
      const generationConnection = { query: async (query: string) => {
        const [rows] = await pool.query<mysql.RowDataPacket[]>(query);
        return [query.includes("GENERATION_EXPRESSION") ? rows.map(row => row.COLUMN_NAME === column.Field ? { ...row, GENERATION_EXPRESSION: "'{}'" } : row) : rows];
      } };
      await expect(verifyBillingReviewSchema(generationConnection), `${column.Field} nonempty generation expression`).rejects.toThrow();
    }
    const incompatibleConnection = { query: (query: string) => pool.query(query.replaceAll("billingReviewOutbox", "incompatibleBillingReviewOutbox")) };
    await expect(verifyBillingReviewSchema(incompatibleConnection)).rejects.toThrow();
    // Exact deployment regression: same SQL, only AUTO_INCREMENT removed.
    await pool.query(sql.replaceAll("billingReviewOutbox", "nonAutoBillingReviewOutbox").replace("AUTO_INCREMENT", ""));
    const nonAutoConnection = { query: (query: string) => pool.query(query.replaceAll("billingReviewOutbox", "nonAutoBillingReviewOutbox")) };
    await expect(verifyBillingReviewSchema(nonAutoConnection)).rejects.toThrow("id auto_increment missing");
    await expect(pool.query("INSERT INTO nonAutoBillingReviewOutbox (obligationKey,conflictDigest,payload,updatedAt,nextAttemptAt,createdAt) VALUES (?,?, '{}',NOW(3),NOW(3),NOW(3))", ["c".repeat(64), "d".repeat(64)])).rejects.toMatchObject({ code: "ER_NO_DEFAULT_FOR_FIELD" });
    const malformedColumns = [
      ["generatedStored", "`payload` text NULL", "`payload` text GENERATED ALWAYS AS ('{}') STORED"],
      ["generatedVirtual", "`envelope` text NULL", "`envelope` text GENERATED ALWAYS AS ('{}') VIRTUAL"],
      ["invisible", "`leaseOwner` varchar(64) NULL", "`leaseOwner` varchar(64) NULL INVISIBLE"],
      ["defaultDrift", "`providerMessageId` varchar(255) NULL", "`providerMessageId` varchar(255) NULL DEFAULT 'unexpected'"],
      ["nullDrift", "`payload` text NULL", "`payload` text NOT NULL"],
      ["onUpdate", "`updatedAt` timestamp(3) NOT NULL", "`updatedAt` timestamp(3) NOT NULL ON UPDATE CURRENT_TIMESTAMP(3)"],
      ["expressionDefault", "`createdAt` timestamp(3) NOT NULL", "`createdAt` timestamp(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))"],
    ];
    for (const [suffix, original, replacement] of malformedColumns) {
      const tableName = `invalid_${suffix}_billingReviewOutbox`;
      expect(sql).toContain(original);
      await pool.query(sql.replaceAll("billingReviewOutbox", tableName).replace(original, replacement));
      const connection = { query: (query: string) => pool.query(query.replaceAll("billingReviewOutbox", tableName)) };
      await expect(verifyBillingReviewSchema(connection), suffix).rejects.toThrow();
      if (suffix === "generatedStored") {
        await expect(pool.query(`INSERT INTO ${tableName} (obligationKey,conflictDigest,payload,updatedAt,nextAttemptAt,createdAt) VALUES (?,?, '{}',NOW(3),NOW(3),NOW(3))`, ["e".repeat(64), "f".repeat(64)])).rejects.toMatchObject({ code: "ER_NON_DEFAULT_VALUE_FOR_GENERATED_COLUMN" });
      }
    }
    const [fullIndexes] = await pool.query<mysql.RowDataPacket[]>("SHOW INDEX FROM billingReviewOutbox");
    const indexMutations: Record<string, string | number | null> = {
      Key_name: "unexpected", Non_unique: 9, Seq_in_index: 9, Column_name: "payload",
      Collation: "D", Sub_part: 1, Packed: "unexpected", Null: "YES", Index_type: "HASH",
      Comment: "disabled", Index_comment: "unexpected", Visible: "NO", Expression: "lower(`status`)",
    };
    for (const [position, row] of fullIndexes.entries()) {
      for (const [attribute, value] of Object.entries(indexMutations)) {
        const connection = { query: async (query: string) => query === "SHOW INDEX FROM billingReviewOutbox"
          ? [fullIndexes.map((entry, index) => index === position ? { ...entry, [attribute]: value } : entry)] : pool.query(query) };
        await expect(verifyBillingReviewSchema(connection), `${row.Key_name}.${row.Seq_in_index}.${attribute}`).rejects.toThrow();
        const missing = { query: async (query: string) => query === "SHOW INDEX FROM billingReviewOutbox"
          ? [fullIndexes.map((entry, index) => { if (index !== position) return entry; const copy = { ...entry }; delete copy[attribute]; return copy; })] : pool.query(query) };
        await expect(verifyBillingReviewSchema(missing), `missing ${attribute}`).rejects.toThrow();
      }
    }
    for (const entries of [fullIndexes.slice(1), [...fullIndexes, fullIndexes[0]], [...fullIndexes, { ...fullIndexes[0], Key_name: "additional_unique" }]]) {
      const connection = { query: async (query: string) => query === "SHOW INDEX FROM billingReviewOutbox" ? [entries] : pool.query(query) };
      await expect(verifyBillingReviewSchema(connection)).rejects.toThrow();
    }
    const indexVariants = [
      ["prefix", "(`obligationKey`)", "(`obligationKey`(1))"],
      ["extraUnique", ") ENGINE=InnoDB", ", UNIQUE INDEX unexpected_status_unique (`status`)) ENGINE=InnoDB"],
      ["descending", "(`status`, `nextAttemptAt`, `id`)", "(`status` DESC, `nextAttemptAt`, `id`)"],
      ["invisible", "(`status`, `nextAttemptAt`, `id`)", "(`status`, `nextAttemptAt`, `id`) INVISIBLE"],
      ["functional", "(`status`, `nextAttemptAt`, `id`)", "((lower(`status`)), `nextAttemptAt`, `id`)"],
    ];
    for (const [suffix, original, replacement] of indexVariants) {
      const tableName = `invalid_index_${suffix}_billingReviewOutbox`;
      expect(sql).toContain(original);
      await pool.query(sql.replaceAll("billingReviewOutbox", tableName).replace(original, replacement));
      const connection = { query: (query: string) => pool.query(query.replaceAll("billingReviewOutbox", tableName)) };
      await expect(verifyBillingReviewSchema(connection), suffix).rejects.toThrow();
      if (suffix === "prefix" || suffix === "extraUnique") {
        const insert = `INSERT INTO ${tableName} (obligationKey,conflictDigest,payload,updatedAt,nextAttemptAt,createdAt) VALUES (?,?, '{}',NOW(3),NOW(3),NOW(3))`;
        await pool.query(insert, ["a".repeat(64), "b".repeat(64)]);
        await expect(pool.query(insert, ["a" + "c".repeat(63), "d".repeat(64)])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      }
    }
    const tableVariants = [
      ["check", ") ENGINE=InnoDB;", ", CONSTRAINT limit_attempts CHECK (`attempts` = 0)) ENGINE=InnoDB;"],
      ["fk", ") ENGINE=InnoDB;", ", CONSTRAINT unexpected_parent FOREIGN KEY (`attempts`) REFERENCES fixture_parent (`id`)) ENGINE=InnoDB;"],
      ["compact", "ENGINE=InnoDB;", "ENGINE=InnoDB ROW_FORMAT=COMPACT;"],
      ["statsOption", "ENGINE=InnoDB;", "ENGINE=InnoDB STATS_PERSISTENT=0;"],
      ["commentOption", "ENGINE=InnoDB;", "ENGINE=InnoDB COMMENT='unexpected';"],
      ["partitioned", " UNIQUE INDEX `billing_review_obligation_unique` (`obligationKey`),", ""],
    ];
    await pool.query("CREATE TABLE fixture_parent (id int PRIMARY KEY) ENGINE=InnoDB");
    for (const [suffix, original, replacement] of tableVariants) {
      const tableName = `invalid_table_${suffix}_billingReviewOutbox`;
      let ddl = sql.replaceAll("billingReviewOutbox", tableName).replace(original, replacement);
      if (suffix === "partitioned") ddl = ddl.replace("ENGINE=InnoDB;", "ENGINE=InnoDB PARTITION BY KEY() PARTITIONS 2;");
      await pool.query(ddl);
      const connection = { query: (query: string) => pool.query(query.replaceAll("billingReviewOutbox", tableName)) };
      await expect(verifyBillingReviewSchema(connection), suffix).rejects.toThrow();
      if (suffix === "check" || suffix === "fk") {
        const insert = `INSERT INTO ${tableName} (obligationKey,conflictDigest,payload,updatedAt,nextAttemptAt,createdAt) VALUES (?,?, '{}',NOW(3),NOW(3),NOW(3))`;
        if (suffix === "check") {
          await pool.query(insert, ["1".repeat(64), "2".repeat(64)]);
          await expect(pool.query(`UPDATE ${tableName} SET attempts=attempts+1`)).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
        } else await expect(pool.query(insert, ["1".repeat(64), "2".repeat(64)])).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2", errno: 1452, sqlState: "23000" });
      }
    }
    await pool.query(sql.replaceAll("billingReviewOutbox", "triggerBillingReviewOutbox"));
    await pool.query("CREATE TRIGGER unexpected_attempt_rewrite BEFORE INSERT ON triggerBillingReviewOutbox FOR EACH ROW SET NEW.attempts=77");
    await expect(verifyBillingReviewSchema({ query: (query: string) => pool.query(query.replaceAll("billingReviewOutbox", "triggerBillingReviewOutbox")) })).rejects.toThrow("unexpected trigger");
    await pool.query("INSERT INTO triggerBillingReviewOutbox (obligationKey,conflictDigest,payload,updatedAt,nextAttemptAt,createdAt) VALUES (?,?,'{}',NOW(3),NOW(3),NOW(3))", ["3".repeat(64), "4".repeat(64)]);
    const [triggerRows] = await pool.query<mysql.RowDataPacket[]>("SELECT attempts FROM triggerBillingReviewOutbox");
    expect(triggerRows[0].attempts).toBe(77);
    // Incoming constraints can also constrain deletes/identity updates.
    await pool.query("CREATE TABLE fixture_child (parent_id int, FOREIGN KEY (parent_id) REFERENCES billingReviewOutbox(id)) ENGINE=InnoDB");
    await expect(verifyBillingReviewSchema(pool)).rejects.toThrow("unexpected foreign key");
    await pool.query("DROP TABLE fixture_child");
    const tableMetadataMutations: Array<[string, (rows: mysql.RowDataPacket[]) => mysql.RowDataPacket[]]> = [
      ["SELECT ENGINE,", rows => rows.map(row => ({ ...row, CREATE_OPTIONS: "unexpected" }))],
      ["SELECT ENGINE,", rows => rows.map(row => ({ ...row, ROW_FORMAT: "Compact" }))],
      ["SELECT ENGINE,", rows => rows.map(row => ({ ...row, TABLE_TYPE: "VIEW" }))],
      ["SELECT PRIVILEGE_TYPE", () => []],
      ["SELECT TRIGGER_NAME", () => [{ TRIGGER_NAME: "hidden_mutation" }]],
      ["SELECT CONSTRAINT_NAME,", rows => [...rows, { CONSTRAINT_NAME: "hidden", CONSTRAINT_TYPE: "CHECK", ENFORCED: "YES" }]],
      ["SELECT CONSTRAINT_NAME,", rows => rows.slice(1)],
      ["SELECT CONSTRAINT_NAME FROM", () => [{ CONSTRAINT_NAME: "incoming_fk" }]],
      ["SELECT PARTITION_NAME", () => []],
      ["SELECT PARTITION_NAME", rows => rows.map(row => ({ ...row, TABLESPACE_NAME: "unexpected" }))],
      ["SHOW CREATE TABLE", () => []],
    ];
    for (const attribute of ["CONSTRAINT_NAME", "CONSTRAINT_TYPE", "ENFORCED"]) {
      tableMetadataMutations.push(["SELECT CONSTRAINT_NAME,", rows => rows.map((row, index) => index === 0 ? { ...row, [attribute]: "unexpected" } : row)]);
    }
    for (const attribute of ["PARTITION_NAME", "SUBPARTITION_NAME", "PARTITION_METHOD", "SUBPARTITION_METHOD", "PARTITION_EXPRESSION", "SUBPARTITION_EXPRESSION", "PARTITION_DESCRIPTION", "TABLESPACE_NAME"]) {
      tableMetadataMutations.push(["SELECT PARTITION_NAME", rows => rows.map(row => ({ ...row, [attribute]: "unexpected" }))]);
      tableMetadataMutations.push(["SELECT PARTITION_NAME", rows => rows.map(row => { const copy = { ...row }; delete copy[attribute]; return copy; })]);
    }
    tableMetadataMutations.push(["SELECT PRIVILEGE_TYPE", rows => rows.filter(row => row.PRIVILEGE_TYPE !== "REFERENCES")]);
    tableMetadataMutations.push(["SELECT PRIVILEGE_TYPE", rows => rows.filter(row => row.PRIVILEGE_TYPE !== "TRIGGER")]);
    for (const context of [[], [{ partialRevokes: 1, activeRoles: "NONE" }], [{ partialRevokes: "0", activeRoles: "NONE" }], [{ activeRoles: "NONE" }], [{ partialRevokes: 0 }], [{ partialRevokes: 0, activeRoles: "`unexpected_role`@`%`" }]]) {
      const connection = { query: (query: string) => query.startsWith("SELECT @@GLOBAL.partial_revokes") ? Promise.resolve([context]) : pool.query(query) };
      await expect(verifyBillingReviewSchema(connection)).rejects.toThrow("unsupported metadata visibility");
    }
    for (const [prefix, mutate] of tableMetadataMutations) {
      const connection = { query: async (query: string) => { const [rows] = await pool.query<mysql.RowDataPacket[]>(query); return [query.startsWith(prefix) ? mutate(rows) : rows]; } };
      await expect(verifyBillingReviewSchema(connection), prefix).rejects.toThrow();
    }
    const value = { giftId: "mysql_fixture", reason: "gift_claimed" as const };
    await Promise.all([db.transaction(tx => enqueueBillingReviewTx(tx, value)), db.transaction(tx => enqueueBillingReviewTx(tx, value))]);
    let clock = new Date(Date.now() + 1000); const now = () => clock;
    let calls = 0; const transport: typeof fetch = async () => { calls++; return new Response(JSON.stringify({ id: "fixture_email" })); };
    const results = await Promise.all([runBillingReviewOutbox({ database: db, now, fetchImpl: transport }), runBillingReviewOutbox({ database: db, now, fetchImpl: transport })]);
    expect(calls).toBe(1); expect(results.reduce((sum, r) => sum + r.processed, 0)).toBe(1);
    await expect(db.transaction(async tx => { await enqueueBillingReviewTx(tx, { ...value, giftId: "rollback" }); throw new Error("rollback"); })).rejects.toThrow("rollback");
    const [count] = await pool.query<mysql.RowDataPacket[]>("SELECT COUNT(*) n FROM billingReviewOutbox"); expect(Number(count[0].n)).toBe(1);
    await db.transaction(tx => enqueueBillingReviewTx(tx, { ...value, giftId: "stale" }));
    const staleTransport: typeof fetch = async () => {
      await pool.query("UPDATE billingReviewOutbox SET leaseOwner='replacement',leaseUntil=? WHERE status='pending'", [new Date(clock.getTime() + 60000)]);
      return new Response(JSON.stringify({ id: "late_email" }));
    };
    expect((await runBillingReviewOutbox({ database: db, now, fetchImpl: staleTransport })).processed).toBe(0);
    clock = new Date(clock.getTime() + 120000);
    expect((await runBillingReviewOutbox({ database: db, now, fetchImpl: transport })).processed).toBe(1);
    const sentCalls = calls;
    clock = new Date(clock.getTime() + 7 * 24 * 60 * 60_000);
    await runBillingReviewOutbox({ database: db, now, fetchImpl: transport });
    await runBillingReviewOutbox({ database: db, now, fetchImpl: transport });
    const [purged] = await pool.query<mysql.RowDataPacket[]>("SELECT payload,envelope,conflictDigest,status,providerMessageId FROM billingReviewOutbox");
    expect(purged.every(r => r.payload === null && r.envelope === null && r.status === "accepted" && /^[a-f0-9]{64}$/.test(r.conflictDigest) && r.providerMessageId)).toBe(true);
    await db.transaction(tx => enqueueBillingReviewTx(tx, value));
    await runBillingReviewOutbox({ database: db, now, fetchImpl: transport });
    expect(calls).toBe(sentCalls);
  } finally {
    await pool.end(); await admin.end();
    // Preserve isolated database as evidence, never delete a caller's fixture.
  }
}, 30000);
