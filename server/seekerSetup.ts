import { and, eq, isNull } from "drizzle-orm";
import { profiles, referralAttachments } from "../drizzle/schema";
import { DEFAULT_SEEKER_SETUP, GOAL_NAMES, LEVELS, LINK_KINDS, ROLES, VISA_OPTIONS, type SeekerSetup, type SeekerSetupPatch } from "../shared/seekerSetup";
import { getDb } from "./db";

/** Thrown when the caller names a resume that is not theirs (or is gone). */
export class SeekerSetupResumeError extends Error {
  constructor() { super("That resume is unavailable. Upload it again."); }
}

function parseList<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is T => typeof item === "string" && (allowed as readonly string[]).includes(item)).filter((item, i, all) => all.indexOf(item) === i);
  } catch { return []; }
}

type SetupRow = {
  openTo?: unknown; experienceLevel?: string | null; seekerGoal?: string | null; searchCity?: string | null; searchCountries?: string | null;
  searchRemote?: boolean | null; workAuthorization?: string | null; workLinkKinds?: unknown; defaultResumeAttachmentId?: number | null;
};

/** Stored values are re-validated on read: a bad row falls back to the honest default. */
export function shapeSeekerSetup(row: SetupRow | undefined, resume: SeekerSetup["resume"]): SeekerSetup {
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);
  return {
    goal: pick(row?.seekerGoal, GOAL_NAMES, DEFAULT_SEEKER_SETUP.goal),
    roles: parseList(row?.openTo, ROLES).slice(0, 3),
    level: pick(row?.experienceLevel, LEVELS, ""),
    links: parseList(row?.workLinkKinds, LINK_KINDS),
    city: row?.searchCity ?? "",
    countries: row?.searchCountries ?? "",
    remote: row?.searchRemote ?? DEFAULT_SEEKER_SETUP.remote,
    visa: pick(row?.workAuthorization, VISA_OPTIONS, DEFAULT_SEEKER_SETUP.visa),
    resume,
  };
}

/** The caller's resume, only while the document still exists, is theirs, and is not bound to an ask. */
async function ownedResume(userId: number, id: number | null | undefined): Promise<SeekerSetup["resume"]> {
  if (!id) return null;
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const row = (await db.select({ id: referralAttachments.id, fileName: referralAttachments.fileName }).from(referralAttachments)
    .where(and(eq(referralAttachments.id, id), eq(referralAttachments.ownerId, userId), isNull(referralAttachments.referralRequestId))).limit(1))[0];
  return row ?? null;
}

export async function getSeekerSetup(userId: number): Promise<SeekerSetup> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const row = (await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1))[0];
  return shapeSeekerSetup(row, await ownedResume(userId, row?.defaultResumeAttachmentId));
}

export async function updateSeekerSetup(userId: number, patch: SeekerSetupPatch): Promise<SeekerSetup> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const set: Record<string, unknown> = {};
  if (patch.goal !== undefined) set.seekerGoal = patch.goal;
  if (patch.roles !== undefined) set.openTo = JSON.stringify(patch.roles);
  if (patch.level !== undefined) set.experienceLevel = patch.level || null;
  if (patch.links !== undefined) set.workLinkKinds = JSON.stringify(patch.links);
  if (patch.city !== undefined) set.searchCity = patch.city || null;
  if (patch.countries !== undefined) set.searchCountries = patch.countries || null;
  if (patch.remote !== undefined) set.searchRemote = patch.remote;
  if (patch.visa !== undefined) set.workAuthorization = patch.visa;
  if (patch.resumeAttachmentId !== undefined) {
    if (patch.resumeAttachmentId !== null && !(await ownedResume(userId, patch.resumeAttachmentId))) throw new SeekerSetupResumeError();
    set.defaultResumeAttachmentId = patch.resumeAttachmentId;
  }
  if (Object.keys(set).length > 0) {
    const existing = (await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.userId, userId)).limit(1))[0];
    if (existing) await db.update(profiles).set({ ...set, updatedAt: new Date() }).where(eq(profiles.userId, userId));
    else await db.insert(profiles).values({ userId, ...set });
  }
  return getSeekerSetup(userId);
}
