import type { Pool, ResultSetHeader } from "mysql2/promise";
import { currentMonthlyCycleKey } from "../../shared/subscriptionPlans";
import { numberColumn, optionalNumberColumn, selectCount, selectRows, stringColumn, type SqlRow } from "./sandboxSql";

/**
 * Deterministic fixtures for the real-InnoDB specs. They write the production
 * tables directly so each test starts from an exact stored state instead of
 * going through the API paths that create it.
 */

export type SeekerSeed = {
  readonly userId: number;
  readonly monthlyCreditsRemaining?: number;
  readonly balance?: number;
  readonly monthlyAllowance?: number;
  readonly monthlyCycleKey?: string;
};

export type DebitSeed = {
  readonly userId: number;
  readonly requestId: number;
  readonly companyDomain?: string;
  readonly source?: "monthly_allowance" | "purchased_balance";
  readonly sourceCycleKey?: string;
};

function email(userId: number): string {
  return `user${userId}@sandbox.skipwait.test`;
}

export async function seedUser(pool: Pool, userId: number, label = "member"): Promise<void> {
  await pool.query(
    "INSERT INTO users (id, openId, name, email, loginMethod, role) VALUES (?, ?, ?, ?, 'sandbox', 'user')",
    [userId, `sandbox-${label}-${userId}`, `${label} Sandbox`, email(userId)],
  );
}

async function insertPendingRequest(pool: Pool, requestId: number, jobSeekerId: number, companyDomain: string): Promise<void> {
  const jobId = 100_000 + requestId;
  await pool.query(
    "INSERT INTO jobs (id, title, company, location, seniority, employmentType, workMode, description, targetRoleUrl) VALUES (?, ?, ?, 'Remote', 'Senior', 'FULL_TIME', 'REMOTE', ?, ?)",
    [jobId, `Role ${jobId}`, companyDomain, `Sandbox role used only by concurrency specs.`, `https://${companyDomain}/jobs/${jobId}`],
  );
  await pool.query(
    "INSERT INTO referralRequests (id, jobId, jobSeekerId, personalPitch, status, revision, waitingForCoverage) VALUES (?, ?, ?, ?, 'pending', 0, false)",
    [requestId, jobId, jobSeekerId, `Sandbox pitch for request ${requestId}.`],
  );
}

/** A job seeker with a wallet and no stored credits spent yet. */
export async function seedSeeker(pool: Pool, seed: SeekerSeed): Promise<void> {
  await seedUser(pool, seed.userId, "seeker");
  await pool.query(
    "INSERT INTO tokenBalances (userId, role, balance, monthlyCreditsRemaining, monthlyAllowance, monthlyCycleKey, plan) VALUES (?, 'job_seeker', ?, ?, ?, ?, 'free')",
    [
      seed.userId,
      seed.balance ?? 0,
      seed.monthlyCreditsRemaining ?? 0,
      seed.monthlyAllowance ?? 3,
      seed.monthlyCycleKey ?? currentMonthlyCycleKey(),
    ],
  );
}

/**
 * A pending request that already paid its one-credit debit, which is the stored
 * state a withdrawal has to reverse exactly once.
 */
export async function seedRequestWithDebit(pool: Pool, seed: DebitSeed): Promise<void> {
  const companyDomain = seed.companyDomain ?? "acme.test";
  const source = seed.source ?? "monthly_allowance";
  const sourceCycleKey = seed.sourceCycleKey ?? currentMonthlyCycleKey();
  await insertPendingRequest(pool, seed.requestId, seed.userId, companyDomain);
  const [debit] = await pool.query<ResultSetHeader>(
    "INSERT INTO tokenTransactions (userId, role, tokenCount, kind, source, sourceCycleKey, referenceType, referenceId) VALUES (?, 'job_seeker', -1, 'direct_request', ?, ?, 'referral_request', ?)",
    [seed.userId, source, sourceCycleKey, String(seed.requestId)],
  );
  await pool.query("UPDATE referralRequests SET debitTransactionId = ? WHERE id = ?", [debit.insertId, seed.requestId]);
}

/** An inviter plus one active coverage invitation per entry, each tied to its
 * own referral request because `coverage_invite_request_unique` allows one. */
export async function seedCoverageInvitations(
  pool: Pool,
  seed: { readonly inviterUserId: number; readonly companyDomain: string; readonly invitations: readonly { readonly inviteCode: string; readonly requestId: number; readonly seekerUserId: number }[] },
): Promise<void> {
  await seedUser(pool, seed.inviterUserId, "inviter");
  for (const invitation of seed.invitations) {
    await seedUser(pool, invitation.seekerUserId, "seeker");
    await insertPendingRequest(pool, invitation.requestId, invitation.seekerUserId, seed.companyDomain);
    await pool.query(
      "INSERT INTO companyCoverageInvitations (inviteCode, inviterUserId, companyDomain, referralRequestId, status) VALUES (?, ?, ?, ?, 'active')",
      [invitation.inviteCode, seed.inviterUserId, seed.companyDomain, invitation.requestId],
    );
  }
}

export type WalletState = { balance: number; monthlyCreditsRemaining: number; monthlyAllowance: number; monthlyCycleKey: string };
export type RequestState = { status: string; revision: number; referrerId: number | null; debitTransactionId: number | null };

async function firstRow(pool: Pool, query: string, params: unknown[], context: string): Promise<SqlRow | undefined> {
  const rows = await selectRows(pool, query, params);
  const row = rows[0];
  if (rows.length > 1) throw new Error(`${context}: expected at most one row, found ${rows.length}`);
  return row;
}

export async function readWallet(pool: Pool, userId: number): Promise<WalletState | undefined> {
  const row = await firstRow(pool, "SELECT balance, monthlyCreditsRemaining, monthlyAllowance, monthlyCycleKey FROM tokenBalances WHERE userId = ? AND role = 'job_seeker'", [userId], `wallet for ${userId}`);
  if (!row) return undefined;
  return {
    balance: numberColumn(row, "balance", `wallet for ${userId}`),
    monthlyCreditsRemaining: numberColumn(row, "monthlyCreditsRemaining", `wallet for ${userId}`),
    monthlyAllowance: numberColumn(row, "monthlyAllowance", `wallet for ${userId}`),
    monthlyCycleKey: stringColumn(row, "monthlyCycleKey", `wallet for ${userId}`),
  };
}

export async function readRequestState(pool: Pool, requestId: number): Promise<RequestState | undefined> {
  const row = await firstRow(pool, "SELECT status, revision, referrerId, debitTransactionId FROM referralRequests WHERE id = ?", [requestId], `request ${requestId}`);
  if (!row) return undefined;
  const context = `request ${requestId}`;
  return {
    status: stringColumn(row, "status", context),
    revision: numberColumn(row, "revision", context),
    referrerId: optionalNumberColumn(row, "referrerId", context),
    debitTransactionId: optionalNumberColumn(row, "debitTransactionId", context),
  };
}

export function countRefunds(pool: Pool, requestId: number): Promise<number> {
  return selectCount(pool, "SELECT COUNT(*) AS n FROM tokenTransactions WHERE kind = 'withdrawal_refund' AND referenceType = 'referral_request' AND referenceId = ?", [String(requestId)]);
}

export function countTransitionEvents(pool: Pool, requestId: number, action: string): Promise<number> {
  return selectCount(pool, "SELECT COUNT(*) AS n FROM referralTransitionEvents WHERE referralRequestId = ? AND action = ?", [requestId, action]);
}

export function countRewardsForInviter(pool: Pool, inviterUserId: number): Promise<number> {
  return selectCount(pool, "SELECT COUNT(*) AS n FROM companyCoverageRewards WHERE inviterUserId = ?", [inviterUserId]);
}

export function countPendingInviteRewards(pool: Pool, userId: number): Promise<number> {
  return selectCount(pool, "SELECT COUNT(*) AS n FROM tokenTransactions WHERE userId = ? AND kind = 'invite_reward_pending' AND rewardStatus = 'pending'", [userId]);
}

export function countCompletedInvitations(pool: Pool, inviterUserId: number): Promise<number> {
  return selectCount(pool, "SELECT COUNT(*) AS n FROM companyCoverageInvitations WHERE inviterUserId = ? AND status = 'completed'", [inviterUserId]);
}
