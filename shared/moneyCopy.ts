/**
 * D-063: one truthful money sentence for every surface that says what asking
 * costs. Asking is free for a monthly allowance and then uses credits, so no
 * surface may call referrals simply "free"; referrers are never paid by
 * skipwait.me (D-055) and never ask a job seeker for money (D-006).
 *
 * Each surface renders these strings instead of writing its own, so the copy
 * cannot drift from the catalog: the number comes from the Free plan.
 */
import { FREE_PLAN } from "./planCatalog";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS, REFERRED_DEADLINE_ENABLED } from "./referral";

/** Free asks every account gets each UTC calendar month (D-039). */
export const FREE_ASKS_PER_MONTH = FREE_PLAN.creditsPerMonth;

/** A chip or trust-row label: the seeker half alone, never "free" on its own. */
/** D-079: with card validation on, the seeker's free asks wait behind a one-time card check the provider owns (no charge). */
export const FREE_ASKS_CHIP = `${FREE_ASKS_PER_MONTH} free referrals every month`;

/** The seeker half of the money sentence: what asking costs. */
export const ASK_COST_SENTENCE = `${FREE_ASKS_CHIP}; extra referral requests use your balance.`;

/** The shortest referrer fact, for chips and footers. */
export const REFERRERS_NEVER_PAID = "Referrers are never paid.";
/** D-120 landing fair rules, line one (designer Oct 21): referring costs nothing and is never bought. */
export const REFERRING_FREE_LINE = "Referring is always free. Referrers are never paid - their help stays genuine.";

/** The referrer half: nobody pays a referrer, and a referrer never asks for money. */
export const REFERRER_MONEY_SENTENCE = "Referrers are never paid and never ask you for money.";

/** D-063, verbatim. */
export const MONEY_SENTENCE = `${ASK_COST_SENTENCE} ${REFERRER_MONEY_SENTENCE}`;

/** Where space is tight (search snippets, small print): both facts, fewer words. */
export const MONEY_SENTENCE_SHORT = `${ASK_COST_SENTENCE} ${REFERRERS_NEVER_PAID}`;

/**
 * The company door's not-open reason (D-132 audit item 7): the waiting rule in
 * one shared place, never retyped per surface. Referral-only wording (D-173,
 * D-180): "referral requests", never the noun "asks", and the cost says
 * "nothing is used", never "credit".
 */
export const COVERAGE_WAIT_REASON = `No verified employee can see referral requests yet. Yours waits at no cost until one can - up to ${COVERAGE_WAIT_DAYS} days - and nothing is used until then.`;

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
/** D-042: the reopen promise is stated only while part B can deliver it (D-038-reconcile F3, R-2);
 * the routes answer 409 and the job skips its part B steps while the switch is off. */
const REFERRED_REOPEN_SENTENCE = REFERRED_DEADLINE_ENABLED
  ? " If an accepted referral request is not marked Referred in time, or the referrer steps back, the referral request reopens to other employees with its charge still on it, and the charge is refunded if it is then withdrawn or expires unclaimed, only if its original balance or allowance has not expired, ended or been revoked and has room for the refund."
  : "";

export const CREDIT_RULE = `A referral request at a company where no verified employee is available yet waits at no cost. The moment one can see your referral request, 1 is deducted from your balance; if your balance is empty then, we hold the referral request until you add to it. The charge is refunded once if you withdraw before someone picks it up, or if it expires unclaimed ${ASK_TTL_DAYS} days after it first reached a verified employee, only if its original balance or allowance has not expired, ended or been revoked and has room for the refund. A referral request that never reaches one closes after ${COVERAGE_WAIT_DAYS} days and costs nothing. Once someone picks the referral request up, it stays charged, even if they pass.${REFERRED_REOPEN_SENTENCE}`;

/**
 * D-132 (frozen Oct 21 18:42 IST): PAID credits never expire; free monthly
 * credits still end with the month. These v2 strings are for the flagged
 * pricing build ONLY (PLAN_FAMILY_V2, off) - the live strings above stay
 * until the new model ships (D-042: copy never promises what the product
 * does not do).
 */
/** Same switch and promise as REFERRED_REOPEN_SENTENCE, worded for credits. */
const REFERRED_REOPEN_SENTENCE_V2 = REFERRED_DEADLINE_ENABLED
  ? " If an accepted ask is not marked Referred in time, or the referrer steps back, the ask reopens to other employees with those credits still on it, and the credits come back if the ask is then withdrawn or expires unclaimed."
  : "";

export const CREDIT_RULE_V2 = `An ask at a company where no verified employee is available yet waits at no cost. The moment one can see your ask, credits are used by the role's level; if you do not have enough then, we hold the ask until you add more. Credits used on an ask come back once if you withdraw before someone picks the ask up, or if it expires unclaimed ${ASK_TTL_DAYS} days after it first reached a verified employee - paid credits never expire, so they always come back; free monthly credits come back only if their month has not ended. An ask that never reaches one closes after ${COVERAGE_WAIT_DAYS} days and costs nothing. Once someone picks the ask up, the credits stay spent, even if they pass.${REFERRED_REOPEN_SENTENCE_V2}`;

export const CREDIT_ENDED_CAVEAT_V2 = "paid credits never expire; free monthly credits end with the month";

/** A credit goes back to the bucket it came from, so one whose month or plan cycle ended cannot come back (refundLedgerSpendTx logs 0). */
export const CREDIT_ENDED_CAVEAT = "only if its original balance or allowance has not expired, ended or been revoked and has room for the refund";

/** The same rule as a footnote clause, after "Uses 1 credit and 1 open slot when a verified employee can see it". */
export const CREDIT_RULE_SHORT = `nothing is used while it waits for coverage, and the charge is refunded once if you withdraw before pickup or it expires unclaimed, ${CREDIT_ENDED_CAVEAT}`;

export type AskCostLine = { line: string; detail: string; blockedReason: string | null };

/**
 * The ask composer's cost line, visible from the moment the drawer opens (no
 * drip pricing). Flat 1 credit today (D-006); D-132's level model is frozen
 * behind its flags, so when it ships this function alone changes and every
 * surface that quotes a cost follows (D-048-p3-live-review item 3).
 */
export function askCostLine(input: { open: boolean | null; balance: number | null; /** Credits this ask costs; null when unpriced/pending quote, 1 by default (D-132). */ cost?: number | null }): AskCostLine {
  const cost = Math.max(1, Math.round(input.cost ?? 1));
  if (input.open === false) {
    // A known-uncovered ask waits free. The deferred charge is named only when
    // a current server quote grounds it: a pending or failed price must not
    // state a stale or fallback K (D-132 item 3).
    const when = input.cost === null
      ? "When one can, its cost is deducted from your balance; if you don't have enough then, we hold it until you add more."
      : `When one can, ${cost} is deducted from your balance; if you don't have enough then, we hold it until you add ${cost === 1 ? "one" : "more"}.`;
    return {
      line: "Nothing deducted from your balance until a verified employee can see it",
      detail: `It waits up to ${COVERAGE_WAIT_DAYS} days. ${when}`,
      blockedReason: null,
    };
  }
  const detail = `The charge is refunded if you withdraw before anyone picks it up, or if nobody picks it up within ${ASK_TTL_DAYS} days, ${CREDIT_ENDED_CAVEAT}. Once picked up, it stays charged, even if they pass.`;
  if (input.open === null) return { line: `Uses ${cost} from your balance when a verified employee can see it`, detail, blockedReason: null };
  if (input.balance === null) return { line: `Uses ${cost} from your balance`, detail, blockedReason: null };
  if (cost > 1 && input.balance < cost) {
    const short = `This referral request uses ${cost} from your balance. You have ${input.balance}. Add ${cost - input.balance} more.`;
    return { line: short, detail: "Top up in Plans to send this referral request now.", blockedReason: short };
  }
  if (input.balance <= 0) return { line: "Your balance is empty", detail: "Top up in Plans to send this referral request now.", blockedReason: "Your balance is empty. Top up in Plans." };
  return { line: `Uses ${cost} from your balance of ${input.balance}`, detail, blockedReason: null };
}


/** D-132 item 7: short cost phrases for the surfaces that retype the ask cost. Flat 1 credit while the level model is off. */
export const addCreditPhrase = (levelCost: boolean): string => (levelCost ? "Add credits" : "Add a credit");
/** D-132 item 3: the one-tap top-up that replaces Send when a by-level quote is short of credits. */
// The shortfall arithmetic stays in the cost line ("This ask costs N. You have M.
// Add K more."); the action is generic and lands on the live packs section,
// because no pack sells exactly K credits (D-132 item 3, designer review).
export const ADD_CREDITS_LABEL = "Add credits";
export const ADD_CREDITS_HREF = "/plans#packs";
export const topUpHref = (packsOnSale = true): string => (packsOnSale ? "/plans#packs" : "/premium?role=job_seeker");
export const creditUsedPhrase = (levelCost: boolean): string => (levelCost ? "its credits are used" : "1 is deducted from your balance");
/** Administrator-only copy (approval queue/record), not a public surface: left as-is by D-180. */
export const creditReservedPhrase = (levelCost: boolean): string => (levelCost ? "Credits reserved" : "1 credit reserved");

/**
 * Landing copy for the ask cost (D-132 item 7). Flat 1 credit while the level model is off;
 * with it on, the cost is the job level in credits (1 to 10). One place, so no page says
 * "every ask costs the same" once levels are live.
 */
export function askCostLanding(levelCost: boolean): { stepBody: string; waitBody: string; fairRule: string } {
  if (levelCost) {
    return {
      stepBody: `You see the cost before you ask: ${ASK_COST_SENTENCE} An ask costs its job level in credits, from 1 to 10.`,
      waitBody: "Credits are used only when a verified employee can see your ask - back if you withdraw first.",
      fairRule: "An ask costs its job level in credits, from 1 to 10, shown before you send. Nothing is used while it waits.",
    };
  }
  return {
    stepBody: `You see the cost before you ask: ${ASK_COST_SENTENCE} Every ask costs the same.`,
    waitBody: "1 is deducted from your balance only when a verified employee can see it. The charge is refunded if you withdraw before pickup, only if its original balance or allowance has not expired, ended or been revoked and has room for the refund.",
    fairRule: "Every referral request uses the same amount: 1 from your balance when a verified employee can see it, nothing while it waits.",
  };
}

/**
 * Neutral /plans SEO + sitemap copy (designer Oct 21): paid plans are not
 * live, so the meta must not promise what they do ("Passes and Keep warm
 * replace the 3 free asks" pre-announced D-115 mechanics - D-042: copy never
 * promises what the product does not do). One config source; change here when
 * the plan family goes live.
 */
export const PAID_PLANS_SENTENCE = "Extra credits when you need them; paid plans arrive soon.";
