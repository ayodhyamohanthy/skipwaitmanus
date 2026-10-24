// Kit credit cycles (contract: shared/creditLedger.ts). Monthly plan cycles,
// carryover windows, the renewal grace and when a grant ends. Pure: callers
// pass the JS clock (invariant 5).
import { CATALOG_PLAN_IDS, type Carryover } from "./planCatalog";
import { isPaidPlanActive, isPlanFamilyPaidPlan } from "./planEntitlements";
import { currentMonthlyCycleKey } from "./subscriptionPlans";
import { RENEWAL_GRACE_MS, type LedgerGrant, type LedgerWallet } from "./creditLedger";

/** Adds calendar months in UTC, clamping to the target month's last day (31 Jan + 1 = 28/29 Feb). */
export function addMonthsUtc(date: Date, months: number): Date {
  const total = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

export type PlanCycle = { index: number; startsAt: Date; endsAt: Date; key: string };

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * A trailing cycle shorter than this joins the cycle before it. Cycles step by
 * calendar month from the term start, so a 30-day pass bought on 31 January
 * would otherwise open a 2-day second cycle and a 90-day pass a fourth one.
 * Calendar terms (legacy monthly, Keep warm yearly) never leave a stub.
 */
export const MIN_CYCLE_MS = 7 * DAY_MS;
const MAX_CYCLES = 240;

/** How many credit cycles a term grants: one per calendar month started, a short trailing stub merged (30-day pass 1, 90-day pass 3, year 12). */
export function planCycleCount(termStart: Date, termEnd: Date): number {
  if (!(termEnd.getTime() > termStart.getTime())) return 0;
  let count = 0;
  while (count < MAX_CYCLES && addMonthsUtc(termStart, count).getTime() < termEnd.getTime()) count += 1;
  if (count > 1 && termEnd.getTime() - addMonthsUtc(termStart, count - 1).getTime() < MIN_CYCLE_MS) count -= 1;
  return count;
}

/** The cycle at `index` inside a term: monthly from the term start, the last one ending with the term. */
export function planCycleByIndex(termStart: Date, termEnd: Date, index: number): PlanCycle | null {
  const count = planCycleCount(termStart, termEnd);
  if (index < 0 || index >= count) return null;
  const startsAt = addMonthsUtc(termStart, index);
  const endsAt = index === count - 1 ? termEnd : addMonthsUtc(termStart, index + 1);
  return { index, startsAt, endsAt, key: currentMonthlyCycleKey(startsAt) };
}

/**
 * The credit cycle a billing term is in at `now`. A monthly term or 30-day pass
 * is one cycle, a 90-day pass three, a yearly term twelve. Before the term
 * starts it is the first cycle, after it ends the last.
 */
export function planCycleAt(termStart: Date, termEnd: Date, now: Date): PlanCycle | null {
  const count = planCycleCount(termStart, termEnd);
  if (count === 0) return null;
  let index = Math.max(0, (now.getUTCFullYear() - termStart.getUTCFullYear()) * 12 + now.getUTCMonth() - termStart.getUTCMonth());
  while (index > 0 && addMonthsUtc(termStart, index).getTime() > now.getTime()) index -= 1;
  return planCycleByIndex(termStart, termEnd, Math.min(index, count - 1));
}

/** The index of the term's cycle with this key, or -1 when the key is not one of the term's cycles. */
export function planCycleIndexOfKey(termStart: Date, termEnd: Date, key: string): number {
  for (let index = 0; index < 120; index += 1) {
    const cycle = planCycleByIndex(termStart, termEnd, index);
    if (!cycle) return -1;
    if (cycle.key === key) return index;
  }
  return -1;
}

/**
 * When credits granted for the cycle starting at `cycleStart` stop being
 * spendable: the cycle itself plus the carryover months. null means while
 * subscribed (Land). The paid term ending cuts every plan credit short.
 */
export function planCreditsExpireAt(cycleStart: Date, carryover: Carryover): Date | null {
  return carryover === "subscribed" ? null : addMonthsUtc(cycleStart, 1 + carryover);
}

const CYCLE_KEY = /^(\d{4})-(\d{2})$/;

/**
 * Start of the wallet's current cycle bucket: the matching cycle of the paid
 * term, else the first of the key's month (Free cycles are calendar months).
 * null for a key that names no month (the pre-ledger "legacy" default).
 */
export function walletCycleStart(wallet: Pick<LedgerWallet, "monthlyCycleKey" | "subscriptionCurrentTermStart" | "subscriptionCurrentTermEnd">): Date | null {
  const { subscriptionCurrentTermStart: start, subscriptionCurrentTermEnd: end } = wallet;
  if (start && end) {
    const index = planCycleIndexOfKey(start, end, wallet.monthlyCycleKey);
    if (index >= 0) return planCycleByIndex(start, end, index)?.startsAt ?? null;
  }
  const match = CYCLE_KEY.exec(wallet.monthlyCycleKey);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

/**
 * The first instant after the Free month `cycleKey` names, or null for a key
 * that names no month. Free's monthly credits stop then (D-165 (3): an upgrade
 * carries them only until their own month would have ended).
 */
export function freeMonthEnd(cycleKey: string): Date | null {
  const match = CYCLE_KEY.exec(cycleKey);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
}

/** A cancelled-at-term-end plan's credits end with the term; a renewing plan's do not. */
export function termCutoff(wallet: LedgerWallet, now: Date): Date | null {
  return isPaidPlanActive(wallet, now) && wallet.subscriptionStatus === "non_renewing" ? wallet.subscriptionCurrentTermEnd : null;
}

export function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** When a grant stops being spendable, or null when it does not (welcome, Land while renewing). Trial credits end with the trial. */
export function grantExpiresAt(grant: LedgerGrant, wallet: LedgerWallet, now: Date): Date | null {
  if (grant.source === "welcome" || grant.source === "trial") return grant.expiresAt;
  return earliest(grant.expiresAt, termCutoff(wallet, now));
}

/**
 * A grant is spendable while active, unexpired and, for carried-over plan
 * credits, while the subscription that granted them is still the one billing.
 */
export function grantIsSpendable(grant: LedgerGrant, wallet: LedgerWallet, now: Date): boolean {
  if (grant.status !== "active" || grant.creditsRemaining <= 0) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
  if (grant.source === "carryover") return isPaidPlanActive(wallet, now) && grant.subscriptionId !== null && grant.subscriptionId === wallet.subscriptionId;
  return true;
}

/**
 * The paid plan has ended for credit purposes: cancelled or non-renewing past
 * its term end at once, a renewing plan only after RENEWAL_GRACE_MS. A stored
 * plan outside the catalog (the retired Pro/Max of D-067, the reserved Land
 * ids) has lapsed now, whatever its status or term, so the ledger roll moves
 * the wallet to Free with one row for every credit that ends.
 */
export function paidPlanLapsed(wallet: LedgerWallet, now: Date): boolean {
  if (wallet.plan === "free") return false;
  // A stored plan outside the catalog AND outside the D-132 paid family (the
  // retired Pro/Max of D-067, the reserved Land ids) has lapsed now; a family
  // plan (fast_track/insider) is a real subscription and lapses only by the
  // status/term rules below.
  if (!(CATALOG_PLAN_IDS as readonly string[]).includes(wallet.plan) && !isPlanFamilyPaidPlan(wallet.plan)) return true;
  if (isPaidPlanActive(wallet, now)) return false;
  const end = wallet.subscriptionCurrentTermEnd;
  if (wallet.subscriptionStatus !== "active" || !end) return true;
  return end.getTime() + RENEWAL_GRACE_MS <= now.getTime();
}

/**
 * An active grant is expired (with a ledger row) once its date passes or, for
 * carried-over plan credits, once its subscription is no longer the wallet's
 * paid plan. A renewing plan inside its grace keeps its grants.
 */
export function grantShouldExpire(grant: LedgerGrant, wallet: LedgerWallet, now: Date): boolean {
  if (grant.status !== "active") return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return true;
  return grant.source === "carryover" && (wallet.plan === "free" || grant.subscriptionId === null || grant.subscriptionId !== wallet.subscriptionId);
}

/** When the cycle bucket's credits stop being spendable (after any carryover), or null for while subscribed. */
export function cycleCreditsExpireAt(wallet: LedgerWallet, carryover: Carryover, now: Date): Date | null {
  const start = walletCycleStart(wallet);
  if (!isPaidPlanActive(wallet, now)) return start ? addMonthsUtc(start, 1) : null;
  const own = start ? planCreditsExpireAt(start, carryover) : null;
  return earliest(own, termCutoff(wallet, now));
}
