import { z } from "zod";

/** Hard off, no environment or public activation path. Not imported by runtime. */
export const VRA_SHADOW_ENABLED: boolean = false;
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const company = z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/);
const contextSchema = z.strictObject({ actorUserId: id, companyDomain: company, now: z.iso.datetime() });
const rowSchema = z.strictObject({
  requestId: id, seekerUserId: id, referrerUserId: id, companyDomain: company,
  roleTitle: z.string().trim().min(1).max(200), status: z.literal("approved"),
  acceptedEvent: z.strictObject({ id, requestId: id, actorUserId: id,
    resultingStatus: z.literal("approved"), createdAt: z.iso.datetime() }),
  access: z.strictObject({ active: z.literal(true), revoked: z.literal(false) }),
  note: z.string().max(4000).nullable(),
});
const consentSchema = z.strictObject({ requestId: id, seekerUserId: id,
  recipientUserId: id, version: z.literal(1), brief: z.literal(true), note: z.boolean() });

type Assessment =
  | { state: "unavailable"; externallyVerified: false; rewardAuthorized: false }
  | { state: "shadow_candidate"; requestId: number; acceptanceEventId: number;
      externallyVerified: false; rewardAuthorized: false };
export type ReferralBrief = { requestId: number; companyDomain: string; roleTitle: string; note?: string };

/** All arguments are untrusted until parsed. No caller assertion is proof. */
export function assessReferralAction(context: object, record: object | null): Assessment {
  const actor = contextSchema.safeParse(context);
  const row = rowSchema.safeParse(record);
  const unavailable = { state: "unavailable", externallyVerified: false, rewardAuthorized: false } as const;
  if (!actor.success || !row.success) return unavailable;
  const data = row.data;
  if (data.referrerUserId !== actor.data.actorUserId ||
      data.seekerUserId === data.referrerUserId ||
      data.companyDomain !== actor.data.companyDomain ||
      data.acceptedEvent.requestId !== data.requestId ||
      data.acceptedEvent.actorUserId !== data.referrerUserId ||
      Date.parse(data.acceptedEvent.createdAt) > Date.parse(actor.data.now)) return unavailable;
  // Acceptance is an internal event, never evidence of submission to an employer.
  return { state: "shadow_candidate", requestId: data.requestId,
    acceptanceEventId: data.acceptedEvent.id, externallyVerified: false, rewardAuthorized: false };
}

export function buildReferralBrief(context: object, record: object | null, consent: object): ReferralBrief | null {
  if (assessReferralAction(context, record).state !== "shadow_candidate") return null;
  const row = rowSchema.safeParse(record);
  const permission = consentSchema.safeParse(consent);
  if (!row.success || !permission.success) return null;
  const data = row.data;
  const allowed = permission.data;
  if (allowed.requestId !== data.requestId || allowed.seekerUserId !== data.seekerUserId ||
      allowed.recipientUserId !== data.referrerUserId) return null;
  const brief: ReferralBrief = { requestId: data.requestId,
    companyDomain: data.companyDomain, roleTitle: data.roleTitle };
  if (allowed.note && data.note !== null) brief.note = data.note;
  return brief;
}
