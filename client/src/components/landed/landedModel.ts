// Landed journey data boundary (docs/KIT_V4_BUILD_PLAN.md §3b row 20, slice C). The
// hires come from the same /api/company-referrals/mine the Requests screen uses, and the
// thank-you posts to /api/landed/journey (server/db.ts recordLandedJourney). Nothing here
// is sample data: an ask only appears once its referrer has marked it "Referred", and a
// name only appears when the server revealed it.
import { z } from "zod";
import { landedJourneyRequestSchema, landedJourneyStateSchema, type LandedJourneyRequest, type LandedJourneyState } from "@shared/landedJourney";
import { NETWORK_ERROR, type ReferralRequest } from "@/components/requests/requestsApi";
import { readApiJson } from "@/lib/apiResponse";

/** The kit's opening line — the seeker edits it before anything is sent. */
export const DEFAULT_THANK_YOU = "Thank you for taking a chance on my ask — I really appreciate you opening the door.";

/** The note reached the row but not the conversation: say so, and let them retry. */
export const UNDELIVERED_ERROR = "We could not send your thank-you just now. It is saved — press Send thanks again.";

type TokenSource = () => Promise<string | null | undefined>;

const hour = (value: string) => { const ms = Date.parse(value); return Number.isNaN(ms) ? 0 : ms; };

/**
 * Asks that reached the landed journey: closed (the referrer marked the seeker hired)
 * and with a referrer behind it, newest activity first.
 */
export function hiresOf(requests: readonly ReferralRequest[]): ReferralRequest[] {
  return requests
    .filter(request => request.status === "closed" && request.referrerId !== null)
    .sort((a, b) => hour(b.updatedAt) - hour(a.updatedAt));
}

/** The referrer's given name once the server revealed it; the honest fallback before that. */
export function referrerGreeting(referrerName: string | null | undefined): string {
  const first = referrerName?.trim().split(/\s+/)[0] ?? "";
  return first || "your referrer";
}

const responseSchema = z.object({ state: landedJourneyStateSchema });

/** Record the thank-you (and later the pay-it-forward choice). Throws the server's own words. */
export async function sendLandedJourney(getToken: TokenSource, input: LandedJourneyRequest): Promise<LandedJourneyState> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch("/api/landed/journey", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(landedJourneyRequestSchema.parse(input)),
    });
  } catch { throw new Error(NETWORK_ERROR); }
  const payload = await readApiJson<Record<string, unknown>>(response, "We could not send your thank-you");
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : "We could not send your thank-you");
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(UNDELIVERED_ERROR);
  return parsed.data.state;
}
