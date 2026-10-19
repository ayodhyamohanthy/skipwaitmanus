// Edge contracts and fetchers for the seeker Requests screen (kit v4 /requests).
// Every number the screen draws comes from one live endpoint:
//   GET /api/company-referrals/mine -> the seeker's asks and their open-ask
//   slots (server-counted after the expiry reconcile, shared/openAskSlots.ts)
// (Withdraw lives in the thread: client/src/lib/threadApi.ts.)
// Payloads are parsed here so a malformed response reads as an error, never as
// a fabricated count.
import { z } from "zod";
import { companyIdentityFieldsSchema } from "@shared/companies";
import { openAskSlotsSchema, type OpenAskSlots } from "@shared/openAskSlots";
import { referralStatuses } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";

export const LOAD_ERROR = "We could not load your referral requests";
export const NETWORK_ERROR = "We couldn’t reach SkipWait. Check your connection and try again.";

const referralRequestSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().nullish(),
  targetRoleUrl: z.string().nullish().transform(value => value ?? null),
  companyDomain: z.string(),
  ...companyIdentityFieldsSchema.shape,
  compensation: z.string().nullish(),
  status: z.enum(referralStatuses),
  referrerId: z.number().int().nullish().transform(value => value ?? null),
  queueStatus: z.enum(["available_for_review", "waiting_for_coverage", "held_for_credit"]).nullish(),
  // D-061 window fields: a waiting ask counts 90 days from creation (and shows no countdown),
  // everything else 7 days from first visibility (pre-0095 rows: creation).
  waitingForCoverage: z.boolean().optional().catch(undefined),
  coverageVisibleAt: z.string().nullish().transform(value => value ?? null),
  // D-050: a personal-link ask its employee has not acted on still counts as unclaimed. Optional so a
  // payload from before the flag still parses; a malformed flag reads as not held (the server decides a withdraw).
  heldForReferrer: z.boolean().optional().catch(undefined),
  referrerMessage: z.string().nullish().transform(value => value ?? null),
  unreadMessageCount: z.coerce.number().int().min(0).catch(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  attachmentCount: z.coerce.number().int().min(0).catch(0),
  expiresAt: z.string().nullish(),
});

export type ReferralRequest = z.infer<typeof referralRequestSchema>;

// A slots payload that is missing or malformed reads as "not loaded", never as a count.
const requestListSchema = z.object({
  requests: z.array(referralRequestSchema).optional().transform(value => value ?? []),
  slots: openAskSlotsSchema.nullish().catch(null).transform(value => value ?? null),
});

export type MyRequestsPayload = { requests: ReferralRequest[]; slots: OpenAskSlots | null };

type TokenSource = () => Promise<string | null | undefined>;

async function authedFetch(url: string, getToken: TokenSource): Promise<Response> {
  const token = await getToken();
  try {
    return await fetch(url, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
}

function serverMessage(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.error === "string" && payload.error ? payload.error : fallback;
}

export async function fetchMyRequests(getToken: TokenSource): Promise<MyRequestsPayload> {
  const response = await authedFetch("/api/company-referrals/mine", getToken);
  const payload = await readApiJson<Record<string, unknown>>(response, LOAD_ERROR);
  if (!response.ok) throw new Error(serverMessage(payload, LOAD_ERROR));
  const parsed = requestListSchema.safeParse(payload);
  if (!parsed.success) throw new Error(LOAD_ERROR);
  return parsed.data;
}
