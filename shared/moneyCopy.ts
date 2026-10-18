/**
 * D-063: one truthful money sentence for every surface that says what asking
 * costs. Asking is free for a monthly allowance and then uses credits, so no
 * surface may call referrals simply "free"; referrers are never paid by
 * SkipWait (D-055) and never ask a job seeker for money (D-006).
 *
 * Each surface renders these strings instead of writing its own, so the copy
 * cannot drift from the catalog: the number comes from the Free plan.
 */
import { FREE_PLAN } from "./planCatalog";
import { ASK_TTL_DAYS } from "./referral";

/** Free asks every account gets each UTC calendar month (D-039). */
export const FREE_ASKS_PER_MONTH = FREE_PLAN.creditsPerMonth;

/** A chip or trust-row label: the seeker half alone, never "free" on its own. */
export const FREE_ASKS_CHIP = `${FREE_ASKS_PER_MONTH} asks free every month`;

/** The seeker half of the money sentence: what asking costs. */
export const ASK_COST_SENTENCE = `${FREE_ASKS_CHIP}; more use credits.`;

/** The shortest referrer fact, for chips and footers. */
export const REFERRERS_NEVER_PAID = "Referrers are never paid.";

/** The referrer half: nobody pays a referrer, and a referrer never asks for money. */
export const REFERRER_MONEY_SENTENCE = "Referrers are never paid and never ask you for money.";

/** D-063, verbatim. */
export const MONEY_SENTENCE = `${ASK_COST_SENTENCE} ${REFERRER_MONEY_SENTENCE}`;

/** Where space is tight (search snippets, small print): both facts, fewer words. */
export const MONEY_SENTENCE_SHORT = `${ASK_COST_SENTENCE} ${REFERRERS_NEVER_PAID}`;

/**
 * The credit rule exactly as the ledger keeps it today (server/db.ts):
 * createCompanyReferralRequest spends 1 credit when the ask is sent;
 * withdrawCompanyReferralRequest and expireStalePendingReferralRequest return
 * it once (refundLedgerSpendTx) only while no verified employee has picked the
 * ask up; after a pickup it stays spent, even when that employee passes
 * (passReferralRequestTx moves no credit), so no decline returns it. A credit
 * goes back to the bucket it came from, so one whose month, plan cycle or grant
 * has already ended cannot come back (refundLedgerSpendTx logs 0).
 * A personal-link ask (D-017) follows the same rule since D-050 shipped: it counts
 * as not picked up until its link owner claims, accepts or passes. D-034, D-035,
 * D-038 and D-061 change this rule. Update it in the change that ships them, never
 * before (D-042: copy never promises what the product does not do).
 */
export const CREDIT_RULE = `An ask spends 1 credit when you send it. The credit comes back once if you withdraw before a verified employee picks the ask up, or if the ask expires unclaimed after ${ASK_TTL_DAYS} days, as long as the credit itself has not expired by then. Once the ask is picked up, the credit stays spent, even if they pass.`;

/** A credit goes back to the bucket it came from, so one whose month or plan cycle ended cannot come back (refundLedgerSpendTx logs 0). */
export const CREDIT_ENDED_CAVEAT = "unless its month or plan has ended by then";

/** The same rule as a footnote clause, after "Uses 1 credit". */
export const CREDIT_RULE_SHORT = `the credit comes back once if you withdraw before pickup or the ask expires unclaimed, ${CREDIT_ENDED_CAVEAT}`;

/** What a paid plan does to the monthly allowance: it replaces the free asks, it does not add to them (planEntitlementsFor). */
export const PAID_PLANS_SENTENCE = `Passes and Keep warm replace the ${FREE_ASKS_PER_MONTH} free asks with more credits each month.`;
