/**
 * GATE-tier-floor (D-212, docs/plans/GATE-delivery.md): the tier a change earns from its paths, so a
 * money or sign-in change filed as Tier 2 still needs an independent pass (D-151, D-074).
 *
 * Tier 1 wins whenever any changed path is Tier 1; then Tier 2; then Tier 3 (docs and packets alone).
 * Test files alone never raise the tier, so a money change's own tests do not double-count.
 *
 * Pure: no git, no filesystem. `scripts/review-gate.mjs` feeds it the changed paths and, for
 * `server/db.ts`, each hunk's changed lines and the name of the function the hunk sits in. Amend a
 * list here; every session may (D-200 (2)).
 */

/** Database migrations: a schema change. */
export const TIER1_PATHS = [
  "drizzle/**",
];

/** Money and payments: anything that debits, credits, refunds or reconciles a customer's money. */
export const TIER1_MONEY = [
  "server/creditLedger.ts",
  "server/payments.ts",
  "server/paymentWebhooks.ts",
  "server/chargebee*.ts",
  "server/paymentRefund*.ts",
  "server/cardValidation.ts",
  "server/dailyMoneyCheck.ts",
  "server/coverageDelivery.ts",
  "server/heldAsk.ts",
];

/** Sign-in, sessions and identity: how a person proves who they are. */
export const TIER1_SIGNIN = [
  "server/_core/workosAuth.ts",
  "server/_core/sdk.ts",
  "server/_core/otpLogin.ts",
  "server/_core/seekerEmailCode.ts",
  "server/_core/context.ts",
  "server/_core/reviewerLogin.ts",
  "server/_core/devAuth.ts",
  "server/_core/sessionRenewal.ts",
  "server/passwordResetRoutes.ts",
  "server/workosWebhooks.ts",
  "server/workEmailOtp.ts",
];

/** Privacy: what a referrer may see about a seeker, and who may be told about an ask. */
export const TIER1_PRIVACY = [
  "server/referrerDocumentAccess.ts",
  "server/referrerAskView.ts",
  "shared/referrerAskView.ts",
  "server/blockedPairs.ts",
  "server/privateReferralRoutes.ts",
];

/** Secrets: the container environment passthrough. */
export const TIER1_SECRETS = [
  "src/worker.ts",
];

/** Shared money rules: the contracts the money code reads. */
export const TIER1_SHARED_MONEY = [
  "shared/creditLedger.ts",
  "shared/planCatalog.ts",
  "shared/planFamily.ts",
  "shared/moneyCopy.ts",
  "shared/referrerPurchases.ts",
];

/** Client sign-in and money surfaces. */
export const TIER1_CLIENT = [
  "client/src/components/*SignIn*.tsx",
  "client/src/pages/*SignIn*.tsx",
  "client/src/pages/Ask.tsx",
  "client/src/pages/MyCompanyInbox.tsx",
  "client/src/pages/Plans*.tsx",
  "client/src/components/plans/**",
];

/**
 * `server/db.ts` raises the tier when a changed line, or the function a hunk sits in, names money or
 * privacy. A name-only rule misses `createCompanyReferralRequest` and `deliverWaitingAskTx`, which
 * spend through `spendCreditsTx` (defined in `server/creditLedger.ts`).
 */
export const DB_MONEY_RULE = /credit|spend|refund|ledger|payment|wallet|grant|chargebee|tokenBalances|tokenTransactions|coverage|withdraw|referrerReviewEmailLinks|blocked/i;

/** Tier 2 areas: product code and CI, named without their Tier 1 surfaces. */
export const TIER2_PREFIXES = ["server/", "shared/", "client/src/", "functions/", ".github/workflows/"];

/** Docs: Markdown files anywhere in the repository (packets included). */
const DOCS = /\.mdx?$/i;
const TEST_FILE = /\.test\.tsx?$/;
const DB_FILE = "server/db.ts";

/** A glob (`*` inside one path segment, `**` across segments) to an anchored regular expression. */
export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c !== "*") { out += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&"); continue; }
    if (glob[i + 1] !== "*") { out += "[^/]*"; continue; }
    if (glob[i + 2] === "/") { out += "(?:.*/)?"; i += 2; } else { out += ".*"; i += 1; }
  }
  return new RegExp(`^${out}$`);
}

const TIER1_GLOBS = [...TIER1_PATHS, ...TIER1_MONEY, ...TIER1_SIGNIN, ...TIER1_PRIVACY, ...TIER1_SECRETS, ...TIER1_SHARED_MONEY, ...TIER1_CLIENT];
const TIER1_MATCHERS = TIER1_GLOBS.map(glob => [glob, globToRegExp(glob)]);

const stringsOf = value => (Array.isArray(value) ? value.filter(line => typeof line === "string") : []);

/** Normalise one change: a path string, or `{ path, added, removed, context }` for `server/db.ts`. */
function entryOf(change) {
  if (typeof change === "string") return { path: change.replace(/^\.\//, ""), added: [], removed: [], context: [] };
  return {
    path: typeof change?.path === "string" ? change.path.replace(/^\.\//, "") : "",
    added: stringsOf(change?.added),
    removed: stringsOf(change?.removed),
    context: stringsOf(change?.context),
  };
}

/** True when one `server/db.ts` change touches a money line or sits in a function whose name names money. */
function dbIsMoney(entry) {
  const lines = [...entry.added, ...entry.removed].filter(line => !/^[+-]{3}/.test(line));
  return lines.some(line => DB_MONEY_RULE.test(line)) || entry.context.some(line => DB_MONEY_RULE.test(line));
}

/**
 * The changed paths that made this change Tier 1, first-seen order. A test file never adds one of its
 * own: its Tier 1 surface, when that surface is also changed, already counts.
 */
export function tierReasonPaths(changes) {
  const reasons = [];
  const seen = new Set();
  for (const raw of Array.isArray(changes) ? changes : []) {
    const entry = entryOf(raw);
    if (!entry.path || seen.has(entry.path)) continue;
    seen.add(entry.path);
    if (TEST_FILE.test(entry.path)) continue;
    if (TIER1_MATCHERS.some(([, matcher]) => matcher.test(entry.path))) { reasons.push(entry.path); continue; }
    if (entry.path === DB_FILE && dbIsMoney(entry)) reasons.push(entry.path);
  }
  return reasons;
}

/**
 * The computed tier of a change: `{ tier, reason }`. Reason is "Tier 1 paths" when any listed
 * surface is touched, "docs only" when every file is Markdown (Tier 3), and "no files" for an empty
 * change (Tier 3). Anything else is product-adjacent code, so it counts as Tier 2, never below.
 */
export function classifyTier(changes) {
  const entries = (Array.isArray(changes) ? changes : []).map(entryOf).filter(entry => entry.path);
  if (!entries.length) return { tier: 3, reason: "no files" };
  if (tierReasonPaths(entries).length) return { tier: 1, reason: "Tier 1 paths" };
  if (entries.every(entry => DOCS.test(entry.path))) return { tier: 3, reason: "docs only" };
  return { tier: 2, reason: "Tier 2 paths" };
}

