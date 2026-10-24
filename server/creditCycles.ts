// Kit credit cycles, transaction level (rules: shared/creditCycles.ts). Opening
// a plan cycle, carrying or expiring what the last one left, ending a lapsed
// plan's credits and expiring grants. Runs inside the caller's transaction with
// the wallet row already locked (see server/creditLedger.ts); dates come from
// the JS clock the caller passes in.
import { and, eq } from "drizzle-orm";
import { planCreditGrants, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { BUCKET_SOURCES } from "../shared/creditLedger";
import { freeMonthEnd, grantShouldExpire, paidPlanLapsed, planCreditsExpireAt, planCycleAt, planCycleByIndex, planCycleIndexOfKey, walletCycleStart } from "../shared/creditCycles";
import { isPaidPlanActive } from "../shared/planEntitlements";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { freeCreditsRequireCardValidation } from "./billingSettings";
import { CreditSpendConflictError, asLedgerGrant, cycleRulesFor, digest, readGrantsTx, writeLedgerRow, type CyclePatch, type GrantRow, type LedgerTx, type WalletRole, type WalletRow } from "./creditLedger";

/**
 * Closes the wallet's current cycle bucket and opens `next` with the granting
 * plan's credits. The leftover follows the rules of the plan that granted it:
 * carried into a subscription-bound grant while its carryover window is open
 * and the same subscription continues, otherwise expired. Returns the wallet's
 * new cycle columns; the caller writes them with the rest of its patch.
 */
export async function rollCycleTx(tx: LedgerTx, input: { wallet: WalletRow; next: { startsAt: Date; key: string }; plan: string; subscriptionId: string | null; now: Date }): Promise<CyclePatch> {
  await closeCycleTx(tx, input);
  return openCycleTx(tx, { userId: input.wallet.userId, role: input.wallet.role, next: input.next, plan: input.plan, subscriptionId: input.subscriptionId, cardValidatedAt: input.wallet.cardValidatedAt });
}

/** Carries or expires what the wallet's current cycle left unspent (see rollCycleTx). */
async function closeCycleTx(tx: LedgerTx, input: { wallet: WalletRow; subscriptionId: string | null; now: Date }): Promise<void> {
  const { wallet, now } = input;
  const { userId, role } = wallet;
  const leftover = Math.max(0, wallet.monthlyCreditsRemaining);
  if (leftover > 0) {
    const prevRules = cycleRulesFor(wallet.plan, role);
    const prevStart = walletCycleStart(wallet);
    const prevId = digest(wallet.monthlyCycleKey, prevStart?.toISOString() ?? "none", wallet.subscriptionId ?? "free");
    const expiresAt = prevStart ? planCreditsExpireAt(prevStart, prevRules.carryover) : null;
    const sameSubscription = wallet.plan !== "free" && wallet.subscriptionId !== null && wallet.subscriptionId === input.subscriptionId;
    const windowOpen = prevRules.carryover === "subscribed" || (prevRules.carryover !== 0 && expiresAt !== null && expiresAt.getTime() > now.getTime());
    if (role === "job_seeker" && sameSubscription && windowOpen) {
      const inserted = await tx.insert(planCreditGrants).values({ userId, role, source: "carryover", grantKey: `carry:${prevId}`, planId: wallet.plan, subscriptionId: wallet.subscriptionId, cycleKey: wallet.monthlyCycleKey, tokenCount: leftover, creditsRemaining: leftover, status: "active", grantedAt: now, expiresAt });
      const grantId = Number(inserted[0].insertId);
      await writeLedgerRow(tx, { userId, role, tokenCount: -leftover, kind: "plan_credit_carryover", source: BUCKET_SOURCES.cycle, sourceCycleKey: wallet.monthlyCycleKey, referenceType: "plan_cycle", referenceId: `${wallet.monthlyCycleKey}:${prevId.slice(0, 24)}`, idempotencyKey: `carry-out:${prevId}`, monthlyCreditsAfter: 0 });
      await writeLedgerRow(tx, { userId, role, tokenCount: leftover, kind: "plan_credit_carryover", source: BUCKET_SOURCES.carryover, sourceCycleKey: wallet.monthlyCycleKey, referenceType: "credit_grant", referenceId: String(grantId), idempotencyKey: `carry-in:${grantId}`, creditGrantId: grantId });
    } else {
      await writeLedgerRow(tx, { userId, role, tokenCount: -leftover, kind: "plan_credit_expiry", source: BUCKET_SOURCES.cycle, sourceCycleKey: wallet.monthlyCycleKey, referenceType: "plan_cycle", referenceId: `${wallet.monthlyCycleKey}:${prevId.slice(0, 24)}`, idempotencyKey: `cycle-expiry:${prevId}`, monthlyCreditsAfter: 0 });
    }
  }
}

/** True when this wallet already has a plan_grant row with this key (the Free month was granted on an earlier path). */
async function planGrantRecordedTx(tx: LedgerTx, userId: number, role: WalletRole, idempotencyKey: string): Promise<boolean> {
  const rows = await tx.select({ id: tokenTransactions.id }).from(tokenTransactions).where(and(eq(tokenTransactions.userId, userId), eq(tokenTransactions.role, role), eq(tokenTransactions.kind, "plan_grant"), eq(tokenTransactions.idempotencyKey, idempotencyKey))).limit(1);
  return rows.length > 0;
}

/**
 * Opens a cycle: grants the plan's credits for it with one plan_grant row. A
 * paid cycle is keyed (subscription, cycle start), so a second grant for the
 * same cycle fails on the unique index instead of paying twice. A Free cycle is
 * keyed by its calendar month: Free gets its 3 credits once per person per
 * month, however many times the wallet returns to Free inside that month.
 */
export async function openCycleTx(tx: LedgerTx, input: { userId: number; role: WalletRole; next: { startsAt: Date; key: string }; plan: string; subscriptionId: string | null; cardValidatedAt?: Date | null }): Promise<CyclePatch> {
  const { userId, role, next } = input;
  let allowance = cycleRulesFor(input.plan, role).creditsPerMonth;
  // D-079: with FREE_CREDITS_REQUIRE_CARD_VALIDATION on, a Free seeker cycle
  // opens locked (no plan_grant row) until the provider confirms a card;
  // grantFreeCycleOnValidationTx grants the same month later under the same key.
  // The wallet patch matches the once-per-month shape the code already handles.
  // D-127 (supersedes D-079): free monthly credits are never gated on card
  // validation at sign-up; validation happens at first purchase instead.
  // The D-079 flag is retired and intentionally not read here.
  if (allowance > 0) {
    const cycleId = input.subscriptionId ? digest(input.subscriptionId, next.startsAt.toISOString()) : digest("free", next.key);
    const idempotencyKey = `plan-cycle:${cycleId}`;
    if (!input.subscriptionId && await planGrantRecordedTx(tx, userId, role, idempotencyKey)) allowance = 0;
    else await writeLedgerRow(tx, { userId, role, tokenCount: allowance, kind: "plan_grant", source: BUCKET_SOURCES.cycle, sourceCycleKey: next.key, referenceType: "plan_cycle", referenceId: `${next.key}:${cycleId.slice(0, 24)}`, idempotencyKey, monthlyCreditsAfter: allowance });
  }
  return { monthlyAllowance: allowance, monthlyCreditsRemaining: allowance, monthlyCycleKey: next.key };
}

/**
 * D-165 (3): an upgrade from Free carries the open month's unused free credits
 * into a carry-over grant that ends when their free month would have. They are
 * spent before paid credits (soonest expiry first) and never become paid
 * credits. The wallet's free cycle bucket empties either way; a month that has
 * already ended writes an expiry row for the leftover instead.
 */
export async function carryFreeCreditsOnUpgradeTx(tx: LedgerTx, input: { wallet: WalletRow; freeCycleKey: string; subscriptionId: string; now: Date }): Promise<CyclePatch> {
  const { wallet, freeCycleKey, subscriptionId, now } = input;
  const { userId, role } = wallet;
  const leftover = Math.max(0, wallet.monthlyCreditsRemaining);
  if (leftover > 0) {
    const carryId = digest("upgrade-carry", freeCycleKey, subscriptionId, userId, role);
    const monthEnd = freeMonthEnd(freeCycleKey);
    const referenceId = `${freeCycleKey}:${carryId.slice(0, 24)}`;
    if (!monthEnd || monthEnd.getTime() <= now.getTime()) {
      await writeLedgerRow(tx, { userId, role, tokenCount: -leftover, kind: "plan_credit_expiry", source: BUCKET_SOURCES.cycle, sourceCycleKey: freeCycleKey, referenceType: "plan_cycle", referenceId, idempotencyKey: `upgrade-expiry:${carryId}`, monthlyCreditsAfter: 0 });
    } else {
      const inserted = await tx.insert(planCreditGrants).values({ userId, role, source: "carryover", grantKey: `upgrade-carry:${carryId}`, planId: wallet.plan, subscriptionId, cycleKey: freeCycleKey, tokenCount: leftover, creditsRemaining: leftover, status: "active", grantedAt: now, expiresAt: monthEnd });
      const grantId = Number(inserted[0].insertId);
      await writeLedgerRow(tx, { userId, role, tokenCount: -leftover, kind: "plan_credit_carryover", source: BUCKET_SOURCES.cycle, sourceCycleKey: freeCycleKey, referenceType: "plan_cycle", referenceId, idempotencyKey: `upgrade-carry-out:${carryId}`, monthlyCreditsAfter: 0 });
      await writeLedgerRow(tx, { userId, role, tokenCount: leftover, kind: "plan_credit_carryover", source: BUCKET_SOURCES.carryover, sourceCycleKey: freeCycleKey, referenceType: "plan_cycle", referenceId: String(grantId), idempotencyKey: `upgrade-carry-in:${grantId}`, creditGrantId: grantId });
    }
  }
  return { monthlyAllowance: 0, monthlyCreditsRemaining: 0, monthlyCycleKey: freeCycleKey };
}

/**
 * D-079: after the provider confirms a card, grant the current Free month once.
 * Same month key as openCycleTx, so the once-per-month guard and the daily
 * money check see one ordinary plan_grant row. Strict: the wallet must already
 * be on the current cycle (reconcile owns the roll; this never opens a cycle).
 */
export async function grantFreeCycleOnValidationTx(tx: LedgerTx, input: { wallet: WalletRow; now: Date }): Promise<{ granted: boolean; patch?: CyclePatch }> {
  const { wallet, now } = input;
  if (wallet.role !== "job_seeker" || wallet.plan !== "free") return { granted: false };
  const key = currentMonthlyCycleKey(now);
  if (wallet.monthlyCycleKey !== key) return { granted: false };
  const allowance = cycleRulesFor("free", wallet.role).creditsPerMonth;
  if (allowance <= 0) return { granted: false };
  const cycleId = digest("free", key);
  const idempotencyKey = `plan-cycle:${cycleId}`;
  if (await planGrantRecordedTx(tx, wallet.userId, wallet.role, idempotencyKey)) return { granted: false };
  await writeLedgerRow(tx, { userId: wallet.userId, role: wallet.role, tokenCount: allowance, kind: "plan_grant", source: BUCKET_SOURCES.cycle, sourceCycleKey: key, referenceType: "plan_cycle", referenceId: `${key}:${cycleId.slice(0, 24)}`, idempotencyKey, monthlyCreditsAfter: allowance });
  const updated = await tx.update(tokenBalances).set({ monthlyAllowance: allowance, monthlyCreditsRemaining: allowance }).where(eq(tokenBalances.id, wallet.id));
  if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new CreditSpendConflictError();
  return { granted: true, patch: { monthlyAllowance: allowance, monthlyCreditsRemaining: allowance, monthlyCycleKey: key } };
}

/** The cycle a new or renewed term opens: the term's current monthly cycle, else the term start's month. */
export function termOpeningCycle(termStart: Date | undefined, termEnd: Date | undefined, now: Date): { startsAt: Date; key: string } {
  const cycle = termStart && termEnd ? planCycleAt(termStart, termEnd, now) : null;
  if (cycle) return cycle;
  const startsAt = termStart ?? now;
  return { startsAt, key: currentMonthlyCycleKey(startsAt) };
}

/** Expires every active grant past its date or cut off from its subscription, one ledger row each. */
async function expireGrantsTx(tx: LedgerTx, wallet: WalletRow, grants: GrantRow[], now: Date): Promise<{ grants: GrantRow[]; changed: boolean }> {
  let changed = false;
  const next: GrantRow[] = [];
  for (const grant of grants) {
    if (!grantShouldExpire(asLedgerGrant(grant), wallet, now)) { next.push(grant); continue; }
    const remaining = Math.max(0, grant.creditsRemaining);
    const status = remaining > 0 ? "expired" as const : "exhausted" as const;
    const claimed = await tx.update(planCreditGrants).set({ status, creditsRemaining: 0, closedAt: now }).where(and(eq(planCreditGrants.id, grant.id), eq(planCreditGrants.status, "active")));
    if (Number(claimed[0]?.affectedRows ?? 0) !== 1) throw new CreditSpendConflictError();
    if (remaining > 0) await writeLedgerRow(tx, { userId: grant.userId, role: grant.role, tokenCount: -remaining, kind: "plan_credit_expiry", source: BUCKET_SOURCES[grant.source], referenceType: "credit_grant", referenceId: String(grant.id), idempotencyKey: `grant-expiry:${grant.id}`, creditGrantId: grant.id });
    next.push({ ...grant, status, creditsRemaining: 0, closedAt: now });
    changed = true;
  }
  return { grants: next, changed };
}

/** True when reconcileSeekerWalletTx would open, end or close a cycle (grant expiry aside). */
export function seekerCycleDue(wallet: WalletRow, now: Date): boolean {
  if (wallet.plan !== "free" && isPaidPlanActive(wallet, now)) return paidCycleSteps(wallet, now).length > 0;
  if (paidPlanLapsed(wallet, now)) return true;
  if (wallet.plan === "free" && freeCycleBehind(wallet.monthlyCycleKey, now)) return true;
  // D-079: a validated wallet on a locked current cycle is due, so reconcile
  // grants it even when the webhook signal was missed.
  return wallet.plan === "free" && wallet.monthlyCycleKey === currentMonthlyCycleKey(now) && freeCreditsRequireCardValidation() && wallet.cardValidatedAt != null && wallet.monthlyAllowance === 0;
}

const CYCLE_KEY_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Cycles only move forward. Another instance whose clock runs ahead may already
 * have opened the next cycle; a clock behind it must not roll the wallet back.
 */
function freeCycleBehind(key: string, now: Date): boolean {
  return !CYCLE_KEY_PATTERN.test(key) || key < currentMonthlyCycleKey(now);
}

/** The cycle indexes of the paid term still to open, in order (none when the wallet is current or ahead). */
function paidCycleSteps(wallet: WalletRow, now: Date): number[] {
  const { subscriptionCurrentTermStart: termStart, subscriptionCurrentTermEnd: termEnd } = wallet;
  if (!termStart || !termEnd) return [];
  const target = planCycleAt(termStart, termEnd, now);
  if (!target || target.key === wallet.monthlyCycleKey) return [];
  const from = planCycleIndexOfKey(termStart, termEnd, wallet.monthlyCycleKey);
  if (from < 0) return [target.index];
  return from < target.index ? Array.from({ length: target.index - from }, (_, offset) => from + 1 + offset) : [];
}

/**
 * Brings a locked job-seeker wallet up to `now`: opens every cycle a 90-day
 * pass or yearly term has reached (catching up missed ones in order), ends the
 * plan's credits once a paid term or pass has lapsed, rolls a stale Free
 * calendar month (its leftover expires, the new month grants Free's 3 credits),
 * and expires grants (carryover, trial). Writes the wallet.
 */
export async function reconcileSeekerWalletTx(tx: LedgerTx, locked: WalletRow, now: Date): Promise<{ wallet: WalletRow; grants: GrantRow[]; changed: boolean }> {
  let wallet = locked;
  let changed = false;
  const write = async (patch: Partial<WalletRow>) => {
    const updated = await tx.update(tokenBalances).set(patch).where(eq(tokenBalances.id, wallet.id));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new CreditSpendConflictError();
    wallet = { ...wallet, ...patch };
    changed = true;
  };
  const termStart = wallet.subscriptionCurrentTermStart;
  const termEnd = wallet.subscriptionCurrentTermEnd;
  if (wallet.plan !== "free" && isPaidPlanActive(wallet, now)) {
    for (const index of paidCycleSteps(wallet, now)) {
      const cycle = termStart && termEnd ? planCycleByIndex(termStart, termEnd, index) : null;
      if (!cycle) break;
      await write(await rollCycleTx(tx, { wallet, next: cycle, plan: wallet.plan, subscriptionId: wallet.subscriptionId, now }));
    }
  } else if (paidPlanLapsed(wallet, now)) {
    // Kit billing: "Unused plan credits expire then; purchased credits never do."
    const next = { startsAt: now, key: currentMonthlyCycleKey(now) };
    const cycle = await rollCycleTx(tx, { wallet, next, plan: "free", subscriptionId: null, now });
    await write({ ...cycle, plan: "free", subscriptionStatus: "cancelled" });
  } else if (wallet.plan === "free" && freeCycleBehind(wallet.monthlyCycleKey, now)) {
    const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    await write(await rollCycleTx(tx, { wallet, next: { startsAt, key: currentMonthlyCycleKey(now) }, plan: "free", subscriptionId: null, now }));
  }
  // D-079 heal: under the flag, a Free cycle that opened locked is granted
  // here once the provider has confirmed a card (covers a missed validation
  // signal). planGrantRecordedTx keeps this once-only per month. A wallet left
  // locked when the flag switches off stays at 0 until the next monthly roll:
  // flag-off behaviour must stay byte-for-byte today's behaviour.
  if (wallet.plan === "free" && wallet.monthlyCycleKey === currentMonthlyCycleKey(now) && freeCreditsRequireCardValidation() && wallet.cardValidatedAt) {
    const healed = await grantFreeCycleOnValidationTx(tx, { wallet, now });
    if (healed.granted && healed.patch) { wallet = { ...wallet, ...healed.patch }; changed = true; }
  }
  const expired = await expireGrantsTx(tx, wallet, await readGrantsTx(tx, wallet.userId, wallet.role, true), now);
  return { wallet, grants: expired.grants, changed: changed || expired.changed };
}
