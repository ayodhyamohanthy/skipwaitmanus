// Pure, consumed-field projections for OPS-live-qa-journeys; not new shared API contracts.
import { z } from "zod";
import { ACCOUNTS } from "./live-qa-signed-in.mjs";

export const DEMO = Object.freeze({ seeker: ACCOUNTS.seeker.email, referrer: ACCOUNTS.referrer.email });
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const count = z.number().int().min(0).max(3);
const freeSummary = z.object({
  plan: z.literal("free"), monthlyAllowance: z.literal(3), monthlyCreditsRemaining: count,
  purchasedCreditsRemaining: z.literal(0), promoCreditsRemaining: z.literal(0), totalAvailable: count,
  ledger: z.object({ balance: count }),
}).refine(summary => summary.totalAvailable === summary.monthlyCreditsRemaining && summary.totalAvailable === summary.ledger.balance);
const freeWalletProjection = z.object({ summary: freeSummary });
// Validate the public projection, including zero refunds; other transaction kinds remain readable.
const ledgerProjection = z.object({ entries: z.array(z.object({
  id: z.number().int().positive(), kind: z.string().min(1), credits: z.number().int(),
  bucket: z.string().min(1).nullable(),
  reference: z.object({ type: z.string().min(1).max(40), id: z.string().min(1).max(80) }).nullable(),
  createdAt: z.iso.datetime(),
})) });
const moneyExpectation = z.object({ spend: z.boolean(), refund: z.boolean(), walletDelta: z.number().int().optional() });
const lockedAttachment = z.strictObject({
  mimeType: z.string().nullish(), fileSize: z.number().int().nonnegative().nullish(), availability: z.literal("after_claim"),
});

/** Fail closed without copying an unexpected received identity into output. */
export function identityProblem(role, email) {
  if (typeof role !== "string" || !Object.hasOwn(DEMO, role)) return "unknown demo role";
  const expected = DEMO[role];
  return typeof email === "string" && email.trim().toLowerCase() === expected
    ? null : `${role} is not signed in as the expected demo account ${expected}`;
}

/** Read plain or superjson tRPC data, including a single-call batch. */
export function trpcJson(body) {
  const one = Array.isArray(body) ? body[0] : body;
  const data = one?.result?.data;
  return object(data) && "json" in data ? data.json : data ?? null;
}

/** Legacy numeric-total helper; use freeWallet before allowing a journey mutation. */
export function walletTotal(body) {
  const total = body?.summary?.totalAvailable;
  return typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : null;
}

/** Only the consistent calendar free allowance may fund this sandbox journey. */
export function freeWallet(body) {
  const parsed = freeWalletProjection.safeParse(body);
  if (!parsed.success) return null;
  return { total: parsed.data.summary.totalAvailable, free: parsed.data.summary.monthlyCreditsRemaining };
}

/** Parse consumed public ledger fields, never provider or internal idempotency fields. */
export function ledgerEntries(body) {
  const parsed = ledgerProjection.safeParse(body);
  return parsed.success ? parsed.data.entries : null;
}

function requestKey(requestId) {
  if (typeof requestId !== "number" && (typeof requestId !== "string" || !/^[1-9]\d*$/.test(requestId))) return null;
  const id = Number(requestId);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}

/** Keep every keyed leg visible, even if its amount/kind is defective. */
export function ledgerFor(entries, requestId) {
  const id = requestKey(requestId);
  if (id === null || !Array.isArray(entries)) return { spend: [], refund: [] };
  const rows = entries.filter(entry => object(entry) && object(entry.reference)
    && entry.reference.type === "referral_request" && typeof entry.reference.id === "string"
    && entry.reference.id.startsWith(`${id}#`));
  const isRefund = entry => entry.kind === "withdrawal_refund" || entry.kind === "expiry_refund"
    || entry.reference.id.startsWith(`${id}#refund#`);
  return { spend: rows.filter(entry => !isRefund(entry)), refund: rows.filter(isRefund) };
}

/** Prove exact cycle legs, not a sum: sandbox creates may top up without a grant row. */
export function moneyProblems(input = {}) {
  if (!object(input)) return ["invalid money proof"];
  const { requestId, entries, before, after } = input;
  const id = requestKey(requestId);
  const expected = moneyExpectation.safeParse(input.expect);
  if (id === null || !expected.success) return ["invalid request or money expectations"];
  const parsed = ledgerEntries({ entries });
  if (parsed === null) return ["the credit ledger is missing or malformed"];
  const problems = [];
  const { spend, refund } = ledgerFor(parsed, id);
  if (expected.data.spend && spend.length !== 1) problems.push(`expected exactly one spend row for request ${id}; found ${spend.length}`);
  if (!expected.data.spend && spend.length) problems.push(`request ${id} was spent but must stay uncharged`);
  if (spend.some(row => row.kind !== "credit_spend" || row.credits !== -1 || row.bucket !== "cycle" || row.reference?.id !== `${id}#1`)) {
    problems.push(`the spend row for request ${id} must be credit_spend -1 from cycle at ${id}#1`);
  }
  if (expected.data.refund && refund.length !== 1) problems.push(`expected exactly one withdrawal refund row for request ${id}; found ${refund.length}`);
  if (!expected.data.refund && refund.length) problems.push(`request ${id} was refunded but must stay spent`);
  if (refund.some(row => row.kind !== "withdrawal_refund" || row.credits !== 1 || row.bucket !== "cycle" || row.reference?.id !== `${id}#refund#1`)) {
    problems.push(`the refund row for request ${id} must be withdrawal_refund +1 from cycle at ${id}#refund#1`);
  }
  // Optional compatibility only: the sandbox runner supplies no aggregate wallet delta.
  if (expected.data.walletDelta !== undefined) {
    if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after) || after < 0) problems.push("the wallet counts are missing or malformed");
    else if (after - before !== expected.data.walletDelta) problems.push(`wallet moved ${after - before}, expected ${expected.data.walletDelta}`);
  }
  return problems;
}

/** Before acceptance only locked attachment metadata may be present (D-019(e)). */
export function privacyProblems(preview) {
  if (!object(preview) || !object(preview.request)) return ["no preview"];
  const request = preview.request;
  const problems = [];
  if ("candidateName" in request) problems.push("the preview names the seeker");
  if (!Array.isArray(request.attachments)) return [...problems, "the preview has no attachments array"];
  for (const file of request.attachments) {
    if (object(file) && ("fileName" in file || "url" in file || "id" in file)) problems.push("the preview opens a file");
    if (!lockedAttachment.safeParse(file).success) problems.push("a preview file is not locked metadata");
  }
  return problems;
}

/** After this referrer's own acceptance the name and every attached file must open. */
export function revealProblems(detail) {
  if (!object(detail) || !object(detail.request)) return ["no accepted detail"];
  const request = detail.request;
  const problems = [];
  if (!nonempty(request.candidateName)) problems.push("the accepted detail has no candidate name");
  if (!Array.isArray(request.attachments) || request.attachments.length === 0) return [...problems, "the accepted detail has no files"];
  for (const file of request.attachments) {
    if (!object(file) || !nonempty(file.fileName)) problems.push("an accepted file has no name");
    if (!object(file) || !nonempty(file.url)) problems.push("an accepted file has no link");
  }
  return problems;
}
