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
export const FREE_ASKS_CHIP = `${FREE_ASKS_PER_MONTH} free credits every month`;

/** The seeker half of the money sentence: what asking costs. */
export const ASK_COST_SENTENCE = `${FREE_ASKS_CHIP}; extra asks use credits.`;

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
  ? " If an accepted ask is not marked Referred in time, or the referrer steps back, the ask reopens to other employees with that credit still on it, and the credit comes back if the ask is then withdrawn or expires unclaimed."
  : "";

export const CREDIT_RULE = `An ask at a company where no verified employee is available yet waits at no cost. The moment one can see your ask, 1 credit is used; if you have none then, we hold the ask until you add one. The credit comes back once if you withdraw before someone picks the ask up, or if it expires unclaimed ${ASK_TTL_DAYS} days after it first reached a verified employee, as long as the credit itself has not expired by then. An ask that never reaches one closes after ${COVERAGE_WAIT_DAYS} days and costs nothing. Once someone picks the ask up, the credit stays spent, even if they pass.${REFERRED_REOPEN_SENTENCE}`;

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

/**
 * D-165 (3), verbatim: the checkout says what happens to unused Free credits
 * before payment. Day-first in UTC, the same shape as the plan dates.
 */
export function freeCreditsStayUntilLine(credits: number, until: Date): string {
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(until);
  return `Your ${credits} free ${credits === 1 ? "credit stays" : "credits stay"} until ${date}.`;
}

/** A credit goes back to the bucket it came from, so one whose month or plan cycle ended cannot come back (refundLedgerSpendTx logs 0). */
export const CREDIT_ENDED_CAVEAT = "unless its month or plan has ended by then";

/** The same rule as a footnote clause, after "Uses 1 credit and 1 open slot when a verified employee can see it". */
export const CREDIT_RULE_SHORT = `nothing is used while it waits for coverage, and the credit comes back once if you withdraw before pickup or the ask expires unclaimed, ${CREDIT_ENDED_CAVEAT}`;

export type AskCostLine = { line: string; detail: string; blockedReason: string | null };

/**
 * The ask composer's cost line, visible from the moment the drawer opens (no
 * drip pricing). Flat 1 credit today (D-006); D-132's level model is frozen
 * behind its flags, so when it ships this function alone changes and every
 * surface that quotes a cost follows (D-048-p3-live-review item 3).
 */
export function askCostLine(input: { open: boolean | null; balance: number | null; /** Credits this ask costs; 1 unless the level model (D-132, flagged) supplies it. */ cost?: number }): AskCostLine {
  const cost = Math.max(1, Math.round(input.cost ?? 1));
  const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;
  if (input.open === false) {
    return {
      line: "No credit used until a verified employee can see it",
      detail: `It waits up to ${COVERAGE_WAIT_DAYS} days. When one can, ${credits(cost)} ${cost === 1 ? "is" : "are"} used; if you don't have enough then, we hold it until you add ${cost === 1 ? "one" : "more"}.`,
      blockedReason: null,
    };
  }
  const detail = `Comes back if you withdraw before anyone picks it up, or if nobody picks it up within ${ASK_TTL_DAYS} days, ${CREDIT_ENDED_CAVEAT}. Once picked up, it stays spent, even if they pass.`;
  if (input.open === null) return { line: `Uses ${credits(cost)} when a verified employee can see it`, detail, blockedReason: null };
  if (input.balance === null) return { line: `Uses ${credits(cost)}`, detail, blockedReason: null };
  if (cost > 1 && input.balance < cost) {
    const short = `This ask costs ${credits(cost)}. You have ${input.balance}. Add ${cost - input.balance} more.`;
    return { line: short, detail: "Add credits in Plans and credits to send this ask now.", blockedReason: short };
  }
  if (input.balance <= 0) return { line: "You have no credits left", detail: "Add a credit pack in Plans and credits to send this ask now.", blockedReason: "You have no credits left. Add a credit pack in Plans and credits." };
  return { line: `Uses ${cost} of your ${input.balance} ${input.balance === 1 ? "credit" : "credits"}`, detail, blockedReason: null };
}


/** D-132 item 7: short cost phrases for the surfaces that retype the ask cost. Flat 1 credit while the level model is off. */
export const addCreditPhrase = (levelCost: boolean): string => (levelCost ? "Add credits" : "Add a credit");
export const creditUsedPhrase = (levelCost: boolean): string => (levelCost ? "its credits are used" : "1 credit is used");
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
    waitBody: "1 credit only when a verified employee can see your ask - back if you withdraw first.",
    fairRule: "Every ask costs the same: 1 credit when a verified employee can see it, nothing while it waits.",
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
