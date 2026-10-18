// Data for My asks (D-048 phase 3). Two live reads, parsed at the edge:
//   GET /api/company-referrals/mine            the seeker's asks (with displayRef, D-077(5)) and open-ask slots
//   GET /api/credits/ledger?role=job_seeker     the seeker's ledger rows, joined per ask for honest credit lines
// A malformed payload is an error, never an invented count.
import { z } from "zod";
import { companyIdentityFieldsSchema } from "@shared/companies";
import { creditLedgerResponseSchema, type CreditLedgerEntry } from "@shared/creditLedger";
import { jobFunctionFieldSchema } from "@shared/jobFunctions";
import { openAskSlotsSchema, type OpenAskSlots } from "@shared/openAskSlots";
import { referralStatuses } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";

export const ASKS_LOAD_ERROR = "We couldn’t load your asks";
const NETWORK_ERROR = "We couldn’t reach SkipWait. Check your connection and try again.";
type TokenSource = () => Promise<string | null | undefined>;

const askSchema = z.object({
  id: z.number().int().positive(),
  displayRef: z.string().nullish().transform(value => value ?? null),
  title: z.string().nullish().transform(value => value ?? null),
  targetRoleUrl: z.string().nullish().transform(value => value ?? null),
  companyDomain: z.string(),
  ...companyIdentityFieldsSchema.shape,
  jobFunction: jobFunctionFieldSchema,
  status: z.enum(referralStatuses),
  referrerId: z.number().int().nullish().transform(value => value ?? null),
  queueStatus: z.enum(["available_for_review", "waiting_for_coverage", "held_for_credit"]).nullish().catch(null).transform(value => value ?? null),
  waitingForCoverage: z.boolean().nullish().catch(null).transform(value => value === true),
  coverageVisibleAt: z.string().nullish().transform(value => value ?? null),
  coverageHeldAt: z.string().nullish().catch(null).transform(value => value ?? null),
  heldForReferrer: z.boolean().nullish().catch(null).transform(value => value === true),
  // P0-allocated-ask-stuck: an ask handed to one referrer who has not claimed it stays withdrawable. Optional until
  // the server sends it; absent or malformed reads as false (the server still decides every withdrawal).
  unclaimedAssignment: z.boolean().nullish().catch(null).transform(value => value === true),
  unreadMessageCount: z.coerce.number().int().min(0).catch(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullish().transform(value => value ?? null),
});
export type MyAsk = z.infer<typeof askSchema>;

const asksResponseSchema = z.object({
  requests: z.array(askSchema).optional().transform(value => value ?? []),
  slots: openAskSlotsSchema.nullish().catch(null).transform(value => value ?? null),
});
export type MyAsksPayload = { asks: MyAsk[]; slots: OpenAskSlots | null };

async function authedFetch(path: string, getToken: TokenSource, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  try {
    return await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
}

export async function fetchMyAsks(getToken: TokenSource): Promise<MyAsksPayload> {
  const response = await authedFetch("/api/company-referrals/mine", getToken);
  const payload = await readApiJson<Record<string, unknown>>(response, ASKS_LOAD_ERROR);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : ASKS_LOAD_ERROR);
  const parsed = asksResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(ASKS_LOAD_ERROR);
  return { asks: parsed.data.requests, slots: parsed.data.slots };
}

/** The newest 100 ledger rows. Optional: a failure only hides credit lines. */
export async function fetchSeekerLedger(getToken: TokenSource): Promise<CreditLedgerEntry[]> {
  const response = await authedFetch("/api/credits/ledger?role=job_seeker&limit=100", getToken);
  const payload = await readApiJson<Record<string, unknown>>(response, "We couldn’t load your credit history");
  if (!response.ok) throw new Error("We couldn’t load your credit history");
  const parsed = creditLedgerResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("We couldn’t load your credit history");
  return parsed.data.entries;
}

/** Withdraw an unclaimed ask (POST /api/company-referrals/:id/withdraw). The server decides; its words are shown. */
export async function withdrawAsk(id: number, getToken: TokenSource): Promise<void> {
  const response = await authedFetch(`/api/company-referrals/${id}/withdraw`, getToken, { method: "POST" });
  const payload = await readApiJson<Record<string, unknown>>(response, "We couldn’t withdraw this ask");
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : "We couldn’t withdraw this ask");
}
