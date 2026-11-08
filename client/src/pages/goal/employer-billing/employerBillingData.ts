// The goal /employer/billing data edge. Same routes and fields as the kit page
// (client/src/pages/EmployerBilling.tsx): GET /api/employer/account, GET
// /api/employer/spend-history and POST /api/employer/unlock-credits/purchase
// (server/employerRoutes.ts). Parsed at the edge so the page renders only what the
// server sent, and the checkout carries the Idempotency-Key the route requires -
// without it the route answers 428, so a top-up can never start silently.
// The account contract is the shared employer data layer's (employerData.ts,
// read-only under D-276); no employer rule lives here.
import { z } from "zod";
import { LIST_LIMIT, employerAccountSchema, type EmployerAccount } from "@/components/employer/employerData";
import { readApiJson } from "@/lib/apiResponse";
import { UNLOCK_PACKS, type UnlockPackId } from "./unlockPacks";

const ACCOUNT_ERROR = "We could not load your employer account";
const SPEND_ERROR = "We could not load your spend history";
const CHECKOUT_ERROR = "We could not start the Razorpay checkout";

/** The route's own 428 answer for a missing key, and 202 for an order the
 * provider is still creating: both are stated plainly, never as a silent retry. */
export const CHECKOUT_PREPARING_MESSAGE = "Razorpay is still preparing your checkout. Try again in a few seconds.";

// listEmployerSpendHistory returns three row kinds, newest first, capped at 50.
export const spendRowSchema = z.object({
  kind: z.enum(["profile_unlock", "sponsorship", "credit_purchase"]),
  creditsSpent: z.number().optional(),
  creditsAdded: z.number().optional(),
  displayRef: z.string().optional(),
  tier: z.string().nullable().optional(),
  pack: z.string().nullable().optional(),
  opportunityId: z.number().nullable().optional(),
  createdAt: z.string(),
});
export type SpendRow = z.infer<typeof spendRowSchema>;

const spendResponseSchema = z.object({ spend: z.array(spendRowSchema) });
const accountResponseSchema = z.object({ account: employerAccountSchema.nullable().optional() });

export type EmployerSpend =
  | { access: "open"; rows: SpendRow[]; capped: boolean }
  | { access: "restricted" };
export type OpenSpend = Extract<EmployerSpend, { access: "open" }>;

export type BillingState = { account: EmployerAccount | null; spend: EmployerSpend };

const serverError = (payload: unknown) =>
  payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "";

export async function fetchBillingState(): Promise<BillingState> {
  const [accountResponse, spendResponse] = await Promise.all([
    fetch("/api/employer/account", { credentials: "include" }),
    fetch("/api/employer/spend-history", { credentials: "include" }),
  ]);
  const accountPayload = await readApiJson<Record<string, unknown>>(accountResponse, ACCOUNT_ERROR);
  if (!accountResponse.ok) throw new Error(serverError(accountPayload) || ACCOUNT_ERROR);
  const parsedAccount = accountResponseSchema.safeParse(accountPayload);
  if (!parsedAccount.success) throw new Error(ACCOUNT_ERROR);
  const account = parsedAccount.data.account ?? null;
  // The ledger is an approved-employer tool: a 403 is the server's own answer,
  // not a load failure, and the page says what is closed rather than guessing.
  if (spendResponse.status === 403) return { account, spend: { access: "restricted" } };
  const spendPayload = await readApiJson<Record<string, unknown>>(spendResponse, SPEND_ERROR);
  if (!spendResponse.ok) throw new Error(serverError(spendPayload) || SPEND_ERROR);
  const parsedSpend = spendResponseSchema.safeParse(spendPayload);
  if (!parsedSpend.success) throw new Error(SPEND_ERROR);
  return { account, spend: { access: "open", rows: parsedSpend.data.spend, capped: parsedSpend.data.spend.length >= LIST_LIMIT } };
}

const checkoutResponseSchema = z.object({
  orderId: z.string(),
  amount: z.number(),
  currency: z.string(),
  keyId: z.string().optional(),
  pack: z.enum(["starter", "growth", "scale"]),
  credits: z.number(),
});
export type UnlockTopUpOrder = z.infer<typeof checkoutResponseSchema>;

/**
 * Create the Razorpay order for one pack. The key is the caller's attempt key, so
 * a retry of the same attempt cannot create a second order (standing rule: every
 * externally visible mutation is idempotent and recoverable).
 */
export async function startUnlockTopUp(input: { pack: UnlockPackId; idempotencyKey: string }): Promise<UnlockTopUpOrder> {
  const response = await fetch("/api/employer/unlock-credits/purchase", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({ pack: input.pack }),
  });
  if (response.status === 202) throw new Error(CHECKOUT_PREPARING_MESSAGE);
  const payload = await readApiJson<Record<string, unknown>>(response, CHECKOUT_ERROR);
  if (!response.ok) throw new Error(serverError(payload) || CHECKOUT_ERROR);
  const parsed = checkoutResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(CHECKOUT_ERROR);
  const expected = UNLOCK_PACKS.find(p => p.id === input.pack);
  if (
    !expected ||
    parsed.data.pack !== input.pack ||
    parsed.data.amount !== expected.amountInPaise ||
    parsed.data.currency !== "INR" ||
    parsed.data.credits !== expected.adds
  ) {
    throw new Error(CHECKOUT_ERROR);
  }
  return parsed.data;
}

/**
 * Load checkout.js on demand and open the provider's own modal, as the kit page
 * does. No payment is claimed here - the caller states only that the checkout
 * opened; `onCaptured` runs on the provider's capture event, which is the truth
 * that the ledger has moved. The kit page's hardcoded theme colour is not sent:
 * the goal-palette audit (scripts/designTokenAuditCore.mjs R1) admits no colour
 * literal in goal scope, and the provider styles its own modal.
 */
export async function openRazorpayCheckout(input: { orderId: string; amount: number; keyId?: string; description: string; onCaptured: () => void }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Checkout is unavailable"));
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("We could not open the Razorpay checkout"));
    document.head.appendChild(script);
  });
  const RazorpayCtor = (window as unknown as { Razorpay?: new (options: Record<string, unknown>) => { open(): void } }).Razorpay;
  if (!RazorpayCtor) throw new Error("We could not open the Razorpay checkout");
  new RazorpayCtor({
    key: input.keyId,
    amount: input.amount,
    currency: "INR",
    name: "skipwait.me",
    description: input.description,
    order_id: input.orderId,
    handler: input.onCaptured,
  }).open();
}
