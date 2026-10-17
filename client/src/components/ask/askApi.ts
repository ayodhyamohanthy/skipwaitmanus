// Response boundary for the live /ask send path. The send payload (with the
// seeker's open-ask slots) and the typed slot-cap refusal are parsed with Zod
// before they drive the screen, and transport failures get plain copy instead
// of a raw browser error string.
import { z } from "zod";
import { SLOT_CAP_REACHED, openAskSlotsSchema, slotCapReachedSchema, type SlotCapReached } from "@shared/openAskSlots";
import type { SentAsk } from "@/components/ask/AskSent";

const sendAskResponseSchema = z.object({
  requestId: z.number().int().positive(),
  companyDomain: z.string().nullish(),
  coverageStatus: z.string().nullish(),
  // Informational: a missing or malformed count hides the line, never fakes one.
  slots: openAskSlotsSchema.nullish().catch(null),
});

// Written by the job-link company confirmation step; browser storage is untrusted.
const companyConfirmationSchema = z.object({ canonicalUrl: z.string(), confirmedDomain: z.string().min(1) });

export const ASK_NETWORK_ERROR = "We couldn't reach SkipWait. Check your connection and try again.";

/** The created (or idempotently replayed) ask, or null when the payload is not a send result. */
export function parseSentAsk(payload: Record<string, unknown>): SentAsk | null {
  const parsed = sendAskResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const companyDomain = parsed.data.companyDomain?.trim() || null;
  return { requestId: parsed.data.requestId, companyDomain, waitingForCoverage: parsed.data.coverageStatus === "waiting_for_company_coverage", slots: parsed.data.slots ?? null };
}

/** The server's 409 "all open slots in use" refusal, or null for any other response. */
export function parseSlotCapReached(status: number, payload: Record<string, unknown>): SlotCapReached | null {
  if (status !== 409 || payload.code !== SLOT_CAP_REACHED) return null;
  const parsed = slotCapReachedSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

// A change the plan does not include (server/planGates.ts PlanLimitError). The
// /ask path meets it only for pinned work today; `limit` stays a string so a new
// limit kind still reaches the seeker as the server's own words.
const planLimitSchema = z.object({ error: z.string().min(1), code: z.literal("plan_limit"), limit: z.string(), cap: z.number().int().min(0) });

/** The server's typed plan-limit refusal, or null for any other response. */
export function parsePlanLimit(status: number, payload: Record<string, unknown>): { limit: string; cap: number } | null {
  if (status !== 409 || payload.code !== "plan_limit") return null;
  const parsed = planLimitSchema.safeParse(payload);
  return parsed.success ? { limit: parsed.data.limit, cap: parsed.data.cap } : null;
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
