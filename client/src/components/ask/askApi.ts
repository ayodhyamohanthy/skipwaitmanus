// Response boundary for the live /ask send path. The send payload (with the
// seeker's open-ask slots) and the typed slot-cap refusal are parsed with Zod
// before they drive the screen, and transport failures get plain copy instead
// of a raw browser error string.
import { z } from "zod";
import { SLOT_CAP_REACHED, openAskSlotsSchema, slotCapReachedSchema, type OpenAskSlots, type SlotCapReached } from "@shared/openAskSlots";

const sendAskResponseSchema = z.object({
  requestId: z.number().int().positive(),
  companyDomain: z.string().nullish(),
  coverageStatus: z.string().nullish(),
  // A personal-link ask (D-017) goes to the link's owner alone; anything but true reads as an ordinary ask.
  fastTrack: z.boolean().nullish().catch(null),
  // Informational: a missing or malformed count hides the line, never fakes one.
  slots: openAskSlotsSchema.nullish().catch(null),
});

// Written by the job-link company confirmation step; browser storage is untrusted.
const companyConfirmationSchema = z.object({ canonicalUrl: z.string(), confirmedDomain: z.string().min(1) });

/** The created (or idempotently replayed) ask as the composer's sent state reads it. */
export type SentAsk = { readonly requestId: number; readonly companyDomain: string | null; readonly waitingForCoverage: boolean; readonly fastTrack: boolean; readonly slots: OpenAskSlots | null };

export const ASK_NETWORK_ERROR = "We couldn't reach SkipWait. Check your connection and try again.";

/** The created (or idempotently replayed) ask, or null when the payload is not a send result. */
export function parseSentAsk(payload: Record<string, unknown>): SentAsk | null {
  const parsed = sendAskResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const companyDomain = parsed.data.companyDomain?.trim() || null;
  return { requestId: parsed.data.requestId, companyDomain, waitingForCoverage: parsed.data.coverageStatus === "waiting_for_company_coverage", fastTrack: parsed.data.fastTrack === true, slots: parsed.data.slots ?? null };
}

/** The server's 409 "all open slots in use" refusal, or null for any other response. */
export function parseSlotCapReached(status: number, payload: Record<string, unknown>): SlotCapReached | null {
  if (status !== 409 || payload.code !== SLOT_CAP_REACHED) return null;
  const parsed = slotCapReachedSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** The confirmed employer domain, only when it was confirmed for exactly this job link. */
export function confirmedDomainFor(targetRoleUrl: string, stored: string | null): string | undefined {
  if (!stored) return undefined;
  let raw: unknown;
  try { raw = JSON.parse(stored); } catch { return undefined; }
  const parsed = companyConfirmationSchema.safeParse(raw);
  return parsed.success && parsed.data.canonicalUrl === targetRoleUrl ? parsed.data.confirmedDomain : undefined;
}

/** fetch() rejects with a TypeError when the network drops; everything else carries server copy. */
export function askErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof TypeError) return ASK_NETWORK_ERROR;
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
