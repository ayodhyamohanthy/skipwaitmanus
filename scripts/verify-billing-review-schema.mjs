// Read-only deployment gate. Dedicated scoped DSN, never log connection strings.
import mysql from 'mysql2/promise';
export async function verifyBillingReviewSchema(connection) {
  // Partial revocations can hide incoming FKs despite a visible global REFERENCES grant.
  // Unknown/missing settings and enabled roles are unsupported, never treated as visibility.
  const [context] = await connection.query('SELECT @@GLOBAL.partial_revokes AS partialRevokes, CURRENT_ROLE() AS activeRoles');
  if (context.length !== 1 || context[0].partialRevokes !== 0 || context[0].activeRoles !== 'NONE') throw new Error('Billing review unsupported metadata visibility configuration');
  const [tables] = await connection.query("SELECT ENGINE, TABLE_COLLATION, TABLE_TYPE, ROW_FORMAT, CREATE_OPTIONS FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billingReviewOutbox'");
  if (tables.length !== 1 || tables[0].ENGINE !== 'InnoDB') throw new Error('Billing review engine/table mismatch');
  if (tables[0].TABLE_TYPE !== 'BASE TABLE' || tables[0].ROW_FORMAT !== 'Dynamic' || tables[0].CREATE_OPTIONS !== '') throw new Error('Billing review table options mismatch');
  // TRIGGER metadata is privilege-filtered. Empty results without visibility are not evidence.
  // Direct grants only: role-only/unrecognized privilege arrangements intentionally fail closed.
  const grantee = "CONCAT(QUOTE(SUBSTRING_INDEX(CURRENT_USER(),'@',1)), '@', QUOTE(SUBSTRING_INDEX(CURRENT_USER(),'@',-1)))";
  const [visibility] = await connection.query(`SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE=${grantee} AND PRIVILEGE_TYPE IN ('TRIGGER','REFERENCES') UNION ALL SELECT PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE=${grantee} AND PRIVILEGE_TYPE='TRIGGER' AND DATABASE() LIKE TABLE_SCHEMA UNION ALL SELECT PRIVILEGE_TYPE FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE=${grantee} AND PRIVILEGE_TYPE='TRIGGER' AND TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billingReviewOutbox'`);
  if (!visibility.some(row => row.PRIVILEGE_TYPE === 'TRIGGER')) throw new Error('Billing review trigger metadata visibility not proven');
  if (!visibility.some(row => row.PRIVILEGE_TYPE === 'REFERENCES')) throw new Error('Billing review cross-schema foreign key metadata visibility not proven');
  const [triggers] = await connection.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='billingReviewOutbox'");
  if (triggers.length !== 0) throw new Error('Billing review unexpected trigger');
  const [constraints] = await connection.query("SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE, ENFORCED FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billingReviewOutbox'");
  const expectedConstraints = [['PRIMARY','PRIMARY KEY'],['billing_review_obligation_unique','UNIQUE']];
  if (constraints.length !== 2 || expectedConstraints.some(([name,type]) => constraints.filter(row => row.CONSTRAINT_NAME === name && row.CONSTRAINT_TYPE === type && row.ENFORCED === 'YES').length !== 1)) throw new Error('Billing review unexpected constraint');
  const [references] = await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE (TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billingReviewOutbox' AND REFERENCED_TABLE_NAME IS NOT NULL) OR (REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='billingReviewOutbox')");
  if (references.length !== 0) throw new Error('Billing review unexpected foreign key');
  const [partitions] = await connection.query("SELECT PARTITION_NAME, SUBPARTITION_NAME, PARTITION_METHOD, SUBPARTITION_METHOD, PARTITION_EXPRESSION, SUBPARTITION_EXPRESSION, PARTITION_DESCRIPTION, TABLESPACE_NAME FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billingReviewOutbox'");
  const partition = partitions[0];
  if (partitions.length !== 1 || ['PARTITION_NAME','SUBPARTITION_NAME','PARTITION_METHOD','SUBPARTITION_METHOD','PARTITION_EXPRESSION','SUBPARTITION_EXPRESSION','PARTITION_DESCRIPTION'].some(key => partition[key] !== null) || partition.TABLESPACE_NAME !== null) throw new Error('Billing review partition/tablespace mismatch');
  const [definitions] = await connection.query('SHOW CREATE TABLE billingReviewOutbox');
  const definition = definitions[0]?.['Create Table'];
  const suffix = typeof definition === 'string' ? definition.slice(definition.lastIndexOf('\n)') + 1) : '';
  const options = /^\) ENGINE=InnoDB(?: AUTO_INCREMENT=[1-9][0-9]*)? DEFAULT CHARSET=([a-z0-9_]+) COLLATE=([a-z0-9_]+)$/.exec(suffix);
  if (definitions.length !== 1 || typeof definition !== 'string' || !definition.startsWith('CREATE TABLE `') || !options || options[2] !== tables[0].TABLE_COLLATION || !options[2].startsWith(`${options[1]}_`)) throw new Error('Billing review unsupported table definition/options');
  const [columns] = await connection.query("SHOW FULL COLUMNS FROM billingReviewOutbox");
  const [generation] = await connection.query("SELECT COLUMN_NAME, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billingReviewOutbox'");
  const required = {
    id: ['int','NO'], obligationKey: ['varchar(64)','NO'], payload: ['text','YES'], conflictDigest: ['varchar(64)','NO'], envelope: ['text','YES'], submissionState: ['varchar(20)','NO'], updatedAt: ['timestamp(3)','NO'], status: ['varchar(16)','NO'], attempts: ['int','NO'], nextAttemptAt: ['timestamp(3)','NO'], leaseOwner: ['varchar(64)','YES'], leaseUntil: ['timestamp(3)','YES'], firstAttemptAt: ['timestamp(3)','YES'], acceptedAt: ['timestamp(3)','YES'], providerMessageId: ['varchar(255)','YES'], lastError: ['varchar(80)','YES'], createdAt: ['timestamp(3)','NO'],
  };
  if (columns.length !== Object.keys(required).length) throw new Error('Billing review column count mismatch');
  if (columns.some((col, index) => col.Field !== Object.keys(required)[index])) throw new Error('Billing review column order mismatch');
  for (const [name,[type,nullable]] of Object.entries(required)) {
    const col=columns.find(c=>c.Field===name);
    if (!col || col.Type!==type || col.Null!==nullable) throw new Error(`Billing review column mismatch ${name}`);
    // Exact Extra allowlist rejects generated, invisible, ON UPDATE and expression defaults.
    const expectedExtra = name === 'id' ? 'auto_increment' : '';
    if (col.Extra !== expectedExtra) throw new Error(`Billing review column Extra mismatch ${name}${name === 'id' ? ': id auto_increment missing or unexpected attributes' : ''}`);
    const expression = generation.filter(c => c.COLUMN_NAME === name);
    if (expression.length !== 1 || expression[0].GENERATION_EXPRESSION !== '') throw new Error(`Billing review generation mismatch ${name}`);
    const expectedDefault = {submissionState:'never_submitted',status:'pending',attempts:'0'}[name] ?? null;
    if (expectedDefault === null ? col.Default !== null : String(col.Default) !== expectedDefault) throw new Error(`Billing review default mismatch ${name}`);
    const expectedCollation = ['obligationKey','conflictDigest'].includes(name) ? 'ascii_bin' : (type.startsWith('varchar') || type === 'text') ? tables[0].TABLE_COLLATION : null;
    if (col.Collation !== expectedCollation || expectedCollation === undefined) throw new Error(`Billing review collation mismatch ${name}`);
  }
  if (generation.length !== Object.keys(required).length) throw new Error('Billing review generation metadata count mismatch');
  const [indexes] = await connection.query('SHOW INDEX FROM billingReviewOutbox');
  const expectedIndexes = [['PRIMARY',['id'],0],['billing_review_obligation_unique',['obligationKey'],0],['billing_review_due_idx',['status','nextAttemptAt','id'],1]];
  // Exact row/name set rejects extra UNIQUE constraints and duplicate or hidden parts.
  if (indexes.length !== 5 || indexes.some(row => !expectedIndexes.some(([name]) => row.Key_name === name))) throw new Error('Billing review unexpected index');
  for (const [name,fields,nonUnique] of expectedIndexes) {
    const rows = indexes.filter(row => row.Key_name === name).sort((a,b) => a.Seq_in_index-b.Seq_in_index);
    if (rows.length !== fields.length) throw new Error(`Billing review index count mismatch ${name}`);
    for (const [position,field] of fields.entries()) {
      const row = rows[position];
      const expected = { Key_name:name, Non_unique:nonUnique, Seq_in_index:position+1, Column_name:field, Collation:'A', Sub_part:null, Packed:null, Null:'', Index_type:'BTREE', Comment:'', Index_comment:'', Visible:'YES', Expression:null };
      for (const [attribute,value] of Object.entries(expected)) {
        if (row[attribute] !== value) throw new Error(`Billing review index mismatch ${name}.${attribute}`);
      }
      // Table identifies the queried object; Cardinality is mutable optimizer statistics.
      // Neither is an index-definition attribute. Missing structural metadata above fails closed.
    }
  }
}
if (process.argv[1]?.endsWith('/verify-billing-review-schema.mjs')) {
  let connection;
  try {
    if (!process.env.D067_SCHEMA_VERIFY_URL) throw new Error('Scoped schema verification DSN required');
    connection=await mysql.createConnection(process.env.D067_SCHEMA_VERIFY_URL);
    await verifyBillingReviewSchema(connection); console.log('Billing review structure verified');
  } catch { console.error('Billing review structural gate FAILED; runtime rollout forbidden'); process.exitCode=1; }
  finally { if(connection) await connection.end(); }
}
