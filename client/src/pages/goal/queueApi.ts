// Data for the Referral queue (D-048 phase 3). Live endpoints, parsed at the edge:
//   GET  /api/company-referrals/inbox?scope=new|saved   the referrer's company asks (with displayRef, D-077(5))
//   GET  /api/company-referrals/:id/preview             the pre-accept view: role, link, note, a document COUNT only
//   POST /api/company-referrals/:id/one-click-review     accept (ethicsConfirmed) or pass with a reason (D-052)
//   POST /api/company-referrals/availability/open        open one more slot (D-062)
//   GET  /api/referrer-fast-track/me (+ /deactivate)      the referrer's personal link (D-017)
import { z } from "zod";
import { jobFunctionFieldSchema } from "@shared/jobFunctions";
import type { PassReasonOption } from "@shared/passReasons";
import { referralStatuses } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";

type TokenSource = () => Promise<string | null | undefined>;
const NETWORK_ERROR = "We couldn’t reach SkipWait. Check your connection and try again.";
export const QUEUE_LOAD_ERROR = "We couldn’t load your queue";

const rowSchema = z.object({
  id: z.number().int().positive(),
  displayRef: z.string().nullish().transform(value => value ?? null),
  targetRoleUrl: z.string().nullish().transform(value => value ?? null),
  companyDomain: z.string(),
  companyName: z.string().nullish().transform(value => value ?? null),
  jobFunction: jobFunctionFieldSchema,
  jobTitle: z.string().nullish().transform(value => value ?? null),
  status: z.enum(referralStatuses),
  waitingForCoverage: z.boolean().nullish().catch(null).transform(value => value === true),
  coverageVisibleAt: z.string().nullish().transform(value => value ?? null),
  createdAt: z.string(),
  attachmentCount: z.coerce.number().int().min(0).nullish().catch(null).transform(value => value ?? 0),
  officialLinkIncluded: z.boolean().nullish().catch(null).transform(value => value === true),
  resumeAttached: z.boolean().nullish().catch(null).transform(value => value === true),
  askStrength: z.enum(["strong", "good", "basic"]).nullish().catch(null).transform(value => value ?? null),
  expiresAt: z.string().nullish().transform(value => value ?? null),
});
export type QueueRow = z.infer<typeof rowSchema>;
const inboxSchema = z.object({ requests: z.array(z.unknown()).optional().transform(value => value ?? []) });

const previewSchema = z.object({
  request: z.object({
    id: z.number().int().positive(),
    displayRef: z.string().nullish().transform(value => value ?? null),
    title: z.string().nullish().transform(value => value ?? null),
    targetRoleUrl: z.string().nullish().transform(value => value ?? null),
    companyDomain: z.string(),
    companyName: z.string().nullish().transform(value => value ?? null),
    jobFunction: jobFunctionFieldSchema,
    candidateMessage: z.string().nullish().transform(value => value ?? ""),
    attachments: z.array(z.object({ availability: z.string().optional() })).optional().transform(value => value ?? []),
  }),
});
export type QueuePreview = z.infer<typeof previewSchema>["request"];

export class QueueRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call(path: string, getToken: TokenSource, fallback: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new QueueRequestError(NETWORK_ERROR, 0);
  }
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new QueueRequestError(typeof payload.error === "string" && payload.error ? payload.error : fallback, response.status);
  return payload;
}

/** New asks first, then asks saved earlier; pending only (decided asks live in the Inbox). A malformed row is dropped. */
export async function fetchQueue(getToken: TokenSource): Promise<QueueRow[]> {
  const [fresh, saved] = await Promise.all([
    call("/api/company-referrals/inbox?scope=new", getToken, QUEUE_LOAD_ERROR),
    call("/api/company-referrals/inbox?scope=saved", getToken, QUEUE_LOAD_ERROR),
  ]);
  const rows = (payload: Record<string, unknown>) => inboxSchema.parse(payload).requests.flatMap(raw => {
    const parsed = rowSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const seen = new Set<number>();
  return [...rows(fresh), ...rows(saved)].filter(row => {
    if (seen.has(row.id) || row.status !== "pending") return false;
    seen.add(row.id);
    return true;
  });
}

export async function fetchPreview(id: number, getToken: TokenSource): Promise<QueuePreview> {
  const parsed = previewSchema.safeParse(await call(`/api/company-referrals/${id}/preview`, getToken, "We couldn’t open this ask"));
  if (!parsed.success) throw new QueueRequestError("We couldn’t open this ask", 500);
  return parsed.data.request;
}

const decisionPath = (id: number) => `/api/company-referrals/${id}/one-click-review`;
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Accepting reveals names both ways, so the ethics confirmation always travels with it (PR #316). */
export async function acceptAsk(id: number, getToken: TokenSource): Promise<void> {
  await call(decisionPath(id), getToken, "We couldn’t accept this ask", json({ decision: "approved", ethicsConfirmed: true }));
}

/** A private pass with one of the seven shipped reasons; `legacy` keeps status, routing and credit logic unchanged. */
export async function passAsk(id: number, reason: PassReasonOption, getToken: TokenSource): Promise<void> {
  await call(decisionPath(id), getToken, "We couldn’t record your pass", json({ decision: "declined", declineReason: reason.legacy, passReason: reason.code }));
}

const capacitySchema = z.object({ availability: z.object({ allocatedCount: z.number().int().min(0).optional() }).optional() });
export async function openOneSlot(getToken: TokenSource): Promise<number> {
  const parsed = capacitySchema.safeParse(await call("/api/company-referrals/availability/open", getToken, "We couldn’t open a slot", json({ slotCount: 1 })));
  return parsed.success ? parsed.data.availability?.allocatedCount ?? 0 : 0;
}

const linkSchema = z.object({ link: z.object({ vanityUrl: z.string(), suggestedBioCopy: z.string(), isActive: z.boolean() }).nullish() });
export type PersonalLink = { url: string; bio: string; active: boolean };
export async function fetchPersonalLink(getToken: TokenSource): Promise<PersonalLink | null> {
  const parsed = linkSchema.safeParse(await call("/api/referrer-fast-track/me", getToken, "Your personal link is unavailable"));
  if (!parsed.success || !parsed.data.link) return null;
  return { url: parsed.data.link.vanityUrl, bio: parsed.data.link.suggestedBioCopy, active: parsed.data.link.isActive };
}
export async function pausePersonalLink(getToken: TokenSource): Promise<void> {
  await call("/api/referrer-fast-track/me/deactivate", getToken, "We couldn’t pause your link", { method: "POST" });
}
