import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIRED_COLUMNS, DESIRED_FOREIGN_KEYS, DESIRED_INDEXES, DESIRED_TABLES } from "./schemaReconcile";

// #90 guard. The runtime schema check only READS production. Anything it
// requires must be created by a drizzle/deploy/*.sql migration, the only SQL
// the deploy pipeline applies. Twice (Sep 23 0061, Sep 24 0062) a new table
// was added to the check while its DDL sat in drizzle/*.sql, which prod never
// runs, and the API went to schemaReconcileState=failed.
// BASELINE = requirements that already existed in prod on Sep 24, 2026
// (verified: prod reported "ready"). Do not add to it; ship a deploy migration.
const BASELINE = {
  "tables": [
    "referralRequestSaves",
    "referralRequestPasses",
    "workEmailOtpRateLimits",
    "employerPaymentFulfillments",
    "employerAccounts",
    "employerTalentRefs",
    "employerTalentIntroRequests",
    "profileUnlocks",
    "partnerModules",
    "userFollows",
    "promoCreditGrants"
  ],
  "columns": [
    "companyOpportunities.compensation",
    "jobs.compensation",
    "referralRequests.savedAt",
    "notifications.eventKey",
    "users.suspended",
    "users.sessionsValidAfter",
    "profiles.anonymityOptIn",
    "companyOpportunities.sponsoredUntil",
    "companyOpportunities.sponsoredTier",
    "resumeUploadSessions.clientUploadId",
    "resumeUploadSessions.finalizationOwner",
    "resumeUploadSessions.finalizationLeaseUntil",
    "resumeUploadSessions.permanentStorageKey",
    "referralAttachments.uploadSessionId",
    "referralRequests.idempotencyKey",
    "referralRequests.requestFingerprint",
    "referralRequests.debitTransactionId",
    "tokenTransactions.source",
    "tokenTransactions.sourceCycleKey",
    "tokenTransactions.referenceType",
    "tokenTransactions.referenceId",
    "tokenTransactions.idempotencyKey",
    "tokenTransactions.reversesTransactionId",
    "tokenTransactions.rewardStatus",
    "tokenTransactions.qualifiedByType",
    "tokenTransactions.qualifiedById",
    "tokenTransactions.qualifiedAt",
    "tokenTransactions.balanceAfter",
    "tokenTransactions.monthlyCreditsAfter",
    "companyCoverageInvitations.referralRequestId"
  ],
  "indexes": [
    "workEmailOtpCodes.work_email_otp_active_idx",
    "resumeUploadSessions.resume_upload_sessions_owner_client_unique",
    "referralAttachments.referral_attachments_upload_session_unique",
    "referralRequests.referral_requests_seeker_idempotency_unique",
    "tokenTransactions.token_transactions_debit_reference_unique",
    "tokenTransactions.token_transactions_idempotency_kind_unique",
    "tokenTransactions.token_transactions_reversal_unique",
    "notifications.notifications_event_key_unique",
    "companyCoverageInvitations.coverage_invite_request_unique"
  ],
  // Production satisfies this FK and the app relies on it, but this repository
  // cannot re-create it: schema.ts declares no .references() on uploadSessionId,
  // and adding one changes drizzle's relational inference for
  // getResumeUploadSession, which types the resume-upload path. Recorded rather
  // than fixed, so a rebuilt database knows to expect it and the reason is not lost.
  "foreignKeys": [
    "referralAttachments.uploadSessionId->resumeUploadSessions.id"
  ],
  "rootSql": [
    "0000_bouncy_victor_mancha.sql",
    "0001_legal_rhodey.sql",
    "0002_oval_frog_thor.sql",
    "0003_amazing_ken_ellis.sql",
    "0004_equal_wallop.sql",
    "0005_nifty_killer_shrike.sql",
    "0006_outstanding_vivisector.sql",
    "0007_hesitant_gideon.sql",
    "0008_melodic_doctor_faustus.sql",
    "0009_outstanding_richard_fisk.sql",
    "0010_uneven_dexter_bennett.sql",
    "0011_neat_frog_thor.sql",
    "0012_gifted_lyja.sql",
    "0013_wakeful_brood.sql",
    "0014_lame_senator_kelly.sql",
    "0015_needy_black_bolt.sql",
    "0016_absent_dazzler.sql",
    "0017_careful_ricochet.sql",
    "0018_equal_professor_monster.sql",
    "0019_wandering_ben_urich.sql",
    "0020_kind_havok.sql",
    "0021_clear_norrin_radd.sql",
    "0022_queue_open_alert_backfill.sql",
    "0023_worried_celestials.sql",
    "0024_rich_gambit.sql",
    "0025_dear_penance.sql",
    "0026_fuzzy_juggernaut.sql",
    "0027_referrer_slack_webhooks.sql",
    "0028_work_email_otp_codes.sql",
    "0029_invite_reward_pending.sql",
    "0030_document_blobs.sql",
    "0031_drop_legacy_payment_columns.sql",
    "0031_missing_columns.sql",
    "0032_referral_withdraw_and_payment_rejected.sql",
    "0033_payment_refunded.sql",
    "0034_opportunity_compensation.sql",
    "0035_company_opportunities_compensation.sql",
    "0036_users_suspended.sql",
    "0037_b2b_monetization.sql",
    "0038_user_follows.sql",
    "0039_session_revocation.sql",
    "0040_employer_approval.sql",
    "0041_atomic_resume_upload_finalization.sql",
    "0042_resume_upload_client_identity.sql",
    "0043_atomic_referral_spend.sql",
    "0044_employer_payment_fulfillment.sql",
    "0045_atomic_work_email_otp.sql",
    "0046_referral_request_passes.sql",
    "0047_referral_request_saves.sql",
    "0048_reward_qualification.sql",
    "0049_notification_event_keys.sql",
    "0050_scoped_work_email_otp_receipts.sql",
    "0051_sponsorship_purchase_entitlements.sql",
    "0052_talent_consent_entitlements.sql",
    "0053_employer_approval_workflow.sql",
    "0054_employer_checkout_intents.sql",
    "0055_employer_checkout_create_lease.sql",
    "0056_employer_refund_reversals.sql",
    "0057_canonical_identity.sql",
    "0058_referral_transition_cas.sql",
    "0059_referral_review_delivery_outbox.sql",
    "0060_referral_document_access_grants.sql",
    "0061_direct_message_atomic_send.sql",
    "0061_promo_credit_grants.sql",
    "0062_gift_subscription_fulfillments.sql"
  ]
};

const deployDir = join(__dirname, "..", "drizzle", "deploy");
const deploySql = readdirSync(deployDir).filter(name => name.endsWith(".sql")).map(name => readFileSync(join(deployDir, name), "utf8")).join("\n").replace(/--.*$/gm, "");
const has = (pattern: RegExp) => pattern.test(deploySql);
const esc = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// drizzle/schema.ts is the only description of the schema anything can generate
// DDL from, so a requirement it does not describe cannot exist in a rebuilt
// database. Parse the declarations instead of trusting the "keep in sync" notes.
const schemaTs = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf8");
const tableDeclarations = [...schemaTs.matchAll(/export const (\w+) = mysqlTable\("([^"]+)"/g)];
const symbolByTable = new Map<string, string>();
const blockByTable = new Map<string, string>();
tableDeclarations.forEach((declaration, position) => {
  const symbol = declaration[1];
  const table = declaration[2];
  if (!symbol || !table) return;
  symbolByTable.set(table, symbol);
  blockByTable.set(table, schemaTs.slice(declaration.index ?? 0, tableDeclarations[position + 1]?.index ?? schemaTs.length));
});
const declaresForeignKey = (fk: { table: string; column: string; referencedTable: string; referencedColumn: string }) => {
  const symbol = symbolByTable.get(fk.referencedTable);
  const block = blockByTable.get(fk.table);
  if (!symbol || !block) return false;
  const line = block.split("\n").find(candidate => candidate.trimStart().startsWith(`${fk.column}:`));
  return Boolean(line && new RegExp(`\\.references\\(\\(\\)\\s*=>\\s*${esc(symbol)}\\.${esc(fk.referencedColumn)}\\b`).test(line));
};
const fkKey = (fk: { table: string; column: string; referencedTable: string; referencedColumn: string }) => `${fk.table}.${fk.column}->${fk.referencedTable}.${fk.referencedColumn}`;

describe("schema check requirements are created by deploy migrations (#90)", () => {
  it("every new required table has a CREATE TABLE in drizzle/deploy", () => {
    const missing = DESIRED_TABLES.map(item => item.table).filter(table => !BASELINE.tables.includes(table) && !has(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+\`?${esc(table)}\`?`, "i")));
    expect(missing, "add a drizzle/deploy/NNNN_*.sql migration that creates these tables").toEqual([]);
  });
  it("every new required column is created in drizzle/deploy", () => {
    const missing = DESIRED_COLUMNS.filter(item => !BASELINE.columns.includes(`${item.table}.${item.column}`) && !(has(new RegExp(`\`?${esc(item.table)}\`?`, "i")) && has(new RegExp(`\`?${esc(item.column)}\`?`)))).map(item => `${item.table}.${item.column}`);
    expect(missing, "add a drizzle/deploy migration that adds these columns").toEqual([]);
  });
  it("every new required index is created in drizzle/deploy", () => {
    const missing = DESIRED_INDEXES.filter(item => !BASELINE.indexes.includes(`${item.table}.${item.name}`) && !has(new RegExp(`\`?${esc(item.name)}\`?`))).map(item => `${item.table}.${item.name}`);
    expect(missing, "add a drizzle/deploy migration that creates these indexes").toEqual([]);
  });
  it("no new loose drizzle/*.sql files (prod never applies them)", () => {
    const loose = readdirSync(join(__dirname, "..", "drizzle")).filter(name => name.endsWith(".sql") && !BASELINE.rootSql.includes(name));
    expect(loose, "put new SQL in drizzle/deploy/ (see scripts/apply-deploy-migrations.sh)").toEqual([]);
  });
  it("every required foreign key is declared in drizzle/schema.ts or baselined as production-only", () => {
    const undeclared = DESIRED_FOREIGN_KEYS.filter(fk => !declaresForeignKey(fk) && !BASELINE.foreignKeys.includes(fkKey(fk))).map(fk => `${fk.table}.${fk.column} -> ${fk.referencedTable}.${fk.referencedColumn}`);
    expect(undeclared, "a FK reconcile requires that nothing in this repository declares can never exist in a rebuilt database").toEqual([]);
  });
  it("every new required foreign key is created in drizzle/deploy", () => {
    const missing = DESIRED_FOREIGN_KEYS.filter(fk => !BASELINE.foreignKeys.includes(fkKey(fk)) && !has(new RegExp(`FOREIGN\\s+KEY\\s*\\(\\s*\`?${esc(fk.column)}\`?\\s*\\)\\s*REFERENCES\\s*\`?${esc(fk.referencedTable)}\`?\\s*\\(\\s*\`?${esc(fk.referencedColumn)}\`?`, "i"))).map(fk => `${fk.table}.${fk.column}->${fk.referencedTable}.${fk.referencedColumn}`);
    expect(missing, "add a drizzle/deploy migration that creates these foreign keys").toEqual([]);
  });
  it("keeps the foreign-key baseline honest", () => {
    const stale = BASELINE.foreignKeys.filter(key => !DESIRED_FOREIGN_KEYS.some(fk => fkKey(fk) === key));
    expect(stale, "this FK is no longer required by schemaReconcile; drop the baseline entry").toEqual([]);
  });
});
