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
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "./referral";

/** Free asks every account gets each UTC calendar month (D-039). */
export const FREE_ASKS_PER_MONTH = FREE_PLAN.creditsPerMonth;

/** A chip or trust-row label: the seeker half alone, never "free" on its own. */
/** D-079: with card validation on, the seeker's free asks wait behind a one-time card check the provider owns (no charge). */
export const FREE_ASKS_LOCKED_LINE = `Validate your card to unlock your ${FREE_ASKS_PER_MONTH} free asks every month. You won't be charged.`;
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
 * an ask at a company where no verified employee is available yet waits at no
 * cost (D-034); the moment one can first see it, create..delivery spends 1
 * credit (ask-delivery key), and an ask whose seeker has no credit at that
 * moment is held and offered a top-up instead (D-047); withdraw before pickup
 * and an unclaimed expiry return it once (refundLedgerSpendTx) — the unclaimed
 * window is ASK_TTL_DAYS from first visibility and a waiting or held ask that
 * never reaches an employee closes after COVERAGE_WAIT_DAYS, having spent
 * nothing (D-061). After a pickup the credit stays spent, even when that
 * employee passes (passReferralRequestTx moves no credit). A credit goes back
 * to the bucket it came from, so one whose month, plan cycle or grant has
 * already ended cannot come back (refundLedgerSpendTx logs 0).
 * A personal-link ask (D-017) is visible to its link owner from creation, so it
 * follows the same rule with the clock starting at creation (D-050). D-035 and
 * D-038 change this rule; update this copy in the change that ships them, never
 * before (D-042: copy never promises what the product does not do).
 */
export const CREDIT_RULE = `An ask at a company where no verified employee is available yet waits at no cost. The moment one can see your ask, 1 credit is used; if you have none then, we hold the ask until you add one. The credit comes back once if you withdraw before someone picks the ask up, or if it expires unclaimed ${ASK_TTL_DAYS} days after it first reached a verified employee, as long as the credit itself has not expired by then. An ask that never reaches one closes after ${COVERAGE_WAIT_DAYS} days and costs nothing. Once someone picks the ask up, the credit stays spent, even if they pass.`;

/** A credit goes back to the bucket it came from, so one whose month or plan cycle ended cannot come back (refundLedgerSpendTx logs 0). */
export const CREDIT_ENDED_CAVEAT = "unless its month or plan has ended by then";

/** The same rule as a footnote clause, after "Uses 1 credit and 1 open slot when a verified employee can see it". */
export const CREDIT_RULE_SHORT = `nothing is used while it waits for coverage, and the credit comes back once if you withdraw before pickup or the ask expires unclaimed, ${CREDIT_ENDED_CAVEAT}`;

/** What a paid plan does to the monthly allowance: it replaces the free asks, it does not add to them (planEntitlementsFor). */
export const PAID_PLANS_SENTENCE = `Passes and Keep warm replace the ${FREE_ASKS_PER_MONTH} free asks with more credits each month.`;
