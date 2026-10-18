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
