// Referrer data boundary for /referrer-home, /referrer-setup and /invite.
// Parses the live REST payloads with Zod at the edge and derives the kit v4
// referrer-home view from them. Derivations are pure so the honesty rules
// (real counts only, expiry from the same instant the seeker sees) stay testable.
import { z } from "zod";
import { getAskExpiresAtMs, referralStatuses } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";
import { companySlugForJobCompany, getLaunchCompany } from "@/lib/companies";

export type TokenSource = () => Promise<string | null | undefined>;

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Client-side re-verification nudge: warn 14 days before 90 days since the last verified work email. */
export const REVERIFY_DAYS = 90;
export const REVERIFY_WARNING_DAYS = 14;
export const JOB_AREAS = ["Engineering", "Product", "Design", "Data", "Marketing", "Operations", "Sales", "Finance", "HR"] as const;
export const JOB_LEVELS = ["Intern", "Early career", "Mid-level", "Senior", "Lead+"] as const;

const timestamp = z.union([z.string(), z.date()]).transform(value => (typeof value === "string" ? value : value.toISOString()));
const count = z.number().int().nonnegative();

const accessSchema = z.object({ verifiedCompanyAccess: z.boolean().optional(), workEmailDomain: z.string().nullish() });
const profileSchema = z.object({ profile: z.object({ workEmailVerifiedAt: timestamp.nullish(), referralCapacity: z.number().int().nullish() }).nullish() });
const impactSchema = z.object({ summary: z.object({ reviewed: count, approved: count, introductions: count, interviews: count, offers: count, repliedWithin3DaysPct: z.number().min(0).max(100).nullish() }) });
const inboxRowSchema = z.object({
  id: z.number().int().positive(),
  companyDomain: z.string().min(1),
  status: z.enum(referralStatuses),
  createdAt: timestamp,
  isClaimedByYou: z.boolean().optional().transform(value => value ?? false),
  unreadMessageCount: count.optional().transform(value => value ?? 0),
  attachmentCount: count.nullish(),
  expiresAt: timestamp.nullish(),
});
const inboxSchema = z.object({ requests: z.array(inboxRowSchema) });

const optionList = <T extends string>(options: readonly T[]) => z.array(z.string()).optional().transform(values => (values ?? []).filter((value): value is T => (options as readonly string[]).includes(value)));
export const referrerPreferencesSchema = z.object({
  referralCapacity: z.number().int().min(1).max(15).optional().transform(value => value ?? 3),
  preferAreas: optionList(JOB_AREAS),
  preferLevels: optionList(JOB_LEVELS),
  referrerVisibility: z.string().optional().transform((value): "anon" | "named" => (value === "named" ? "named" : "anon")),
  notifyNewAsk: z.boolean().optional().transform(value => value ?? true),
  paused: z.boolean().optional().transform(value => value ?? false),
});
const preferencesPayloadSchema = z.object({ preferences: referrerPreferencesSchema });

export type CompanyAccess = { verified: boolean; domain: string };
export type ReferrerPreferences = z.infer<typeof referrerPreferencesSchema>;
export type ReferrerPreferencesPatch = Partial<Omit<ReferrerPreferences, "preferAreas" | "preferLevels">> & { preferAreas?: string[]; preferLevels?: string[] };
export type ReferrerImpact = z.infer<typeof impactSchema>["summary"];
export type InboxRow = z.infer<typeof inboxRowSchema>;
export type ReferrerHomeData = {
  access: CompanyAccess;
  preferences: ReferrerPreferences | null;
  verifiedAt: string | null;
  profileCapacity: number | null;
  impact: ReferrerImpact | null;
  fresh: InboxRow[];
  completed: InboxRow[];
};

function authHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(path: string, getToken: TokenSource, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const token = await getToken();
  const response = await fetch(path, { credentials: "include", headers: authHeaders(token) });
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

/** Optional reads: impact is 403 until verified; the profile only adds the verified date. */
async function getOptional<T>(path: string, getToken: TokenSource, schema: z.ZodType<T>): Promise<T | null> {
  try { return await getJson(path, getToken, schema, "unavailable"); } catch { return null; }
}

async function sendJson<T>(path: string, method: "PUT" | "POST", body: unknown, getToken: TokenSource, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const token = await getToken();
  const response = await fetch(path, { method, credentials: "include", headers: { "Content-Type": "application/json", ...authHeaders(token) }, body: JSON.stringify(body) });
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

export async function fetchCompanyAccess(getToken: TokenSource): Promise<CompanyAccess> {
  const access = await getJson("/api/company-referrals/access", getToken, accessSchema, "We could not check your work-email verification.");
  return { verified: Boolean(access.verifiedCompanyAccess), domain: access.workEmailDomain ?? "" };
}

export async function fetchReferrerPreferences(getToken: TokenSource): Promise<ReferrerPreferences> {
  return (await getJson("/api/referrer-preferences", getToken, preferencesPayloadSchema, "We could not load your referrer settings.")).preferences;
}

export async function saveReferrerPreferences(getToken: TokenSource, patch: ReferrerPreferencesPatch): Promise<ReferrerPreferences> {
  return (await sendJson("/api/referrer-preferences", "PUT", patch, getToken, preferencesPayloadSchema, "We could not save your referrer settings.")).preferences;
}

export async function fetchReferrerHome(getToken: TokenSource): Promise<ReferrerHomeData> {
  const access = await fetchCompanyAccess(getToken);
  if (!access.verified) return { access, preferences: null, verifiedAt: null, profileCapacity: null, impact: null, fresh: [], completed: [] };
  const [preferences, fresh, completed, profile, impact] = await Promise.all([
    fetchReferrerPreferences(getToken),
    getJson("/api/company-referrals/inbox?scope=new", getToken, inboxSchema, "We could not load new asks."),
    getJson("/api/company-referrals/inbox?scope=completed", getToken, inboxSchema, "We could not load your reviews."),
    getOptional("/api/profile/me", getToken, profileSchema),
    getOptional("/api/referrer-impact/me", getToken, impactSchema),
  ]);
  return {
    access,
    preferences,
    verifiedAt: profile?.profile?.workEmailVerifiedAt ?? null,
    profileCapacity: profile?.profile?.referralCapacity ?? null,
    impact: impact?.summary ?? null,
    fresh: fresh.requests,
    completed: completed.requests,
  };
}

/** "wipro.com" -> { name: "Wipro", mark: "W" }; the raw domain otherwise. */
export function companyIdentity(domain: string): { name: string; mark: string } {
  const launch = getLaunchCompany(companySlugForJobCompany(domain) ?? "");
  if (launch) return { name: launch.name, mark: launch.initials };
  return { name: domain, mark: (domain.charAt(0) || "?").toUpperCase() };
}

/** Greeting for the viewer's local hour, so the heading never says evening at breakfast. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function expiryMs(row: Pick<InboxRow, "expiresAt" | "createdAt">): number | null {
  const ms = row.expiresAt ? Date.parse(row.expiresAt) : getAskExpiresAtMs(row.createdAt);
  return ms === null || Number.isNaN(ms) ? null : ms;
}

/** Countdown for an unclaimed ask, from the same expiry instant the seeker sees. Null when none applies. */
export function askCountdown(row: InboxRow, nowMs: number): { label: string; urgent: boolean } | null {
  if (row.status !== "pending" || row.isClaimedByYou) return null;
  const ms = expiryMs(row);
  if (ms === null || ms <= nowMs) return null;
  const days = Math.ceil((ms - nowMs) / DAY_MS);
  return days <= 1 ? { label: "1 day left", urgent: true } : { label: `${days} days left`, urgent: false };
}

export type ReferrerHomeView = {
  verified: boolean;
  company: { name: string; mark: string } | null;
  waiting: InboxRow[];
  expiringSoon: number;
  capacity: number;
  used: number;
  left: number;
  atCapacity: boolean;
  isNew: boolean;
  paused: boolean;
  reverifyDue: boolean;
};

export function deriveReferrerHome(data: ReferrerHomeData, nowMs: number): ReferrerHomeView {
  const verified = data.access.verified;
  const waiting = data.fresh.filter(row => row.status === "pending");
  // Active load: asks you claimed that are approved or still have unread messages.
  const active = data.completed.filter(row => row.isClaimedByYou && (row.status === "approved" || row.unreadMessageCount > 0));
  const capacity = data.preferences?.referralCapacity ?? data.profileCapacity ?? 3;
  const used = active.length;
  const expiringSoon = waiting.filter(row => {
    const ms = expiryMs(row);
    return askCountdown(row, nowMs) !== null && ms !== null && ms - nowMs <= DAY_MS;
  }).length;
  const verifiedMs = data.verifiedAt ? Date.parse(data.verifiedAt) : Number.NaN;
  const daysSince = Number.isNaN(verifiedMs) ? null : Math.floor((nowMs - verifiedMs) / DAY_MS);
  return {
    verified,
    company: data.access.domain ? companyIdentity(data.access.domain) : null,
    waiting,
    expiringSoon,
    capacity,
    used,
    left: Math.max(0, capacity - used),
    atCapacity: verified && used >= capacity,
    isNew: verified && waiting.length === 0 && (data.impact?.reviewed ?? 0) === 0,
    paused: verified && Boolean(data.preferences?.paused),
    reverifyDue: verified && daysSince !== null && daysSince >= REVERIFY_DAYS - REVERIFY_WARNING_DAYS,
  };
}

const inviteSchema = z.object({ invite: z.object({ inviteCode: z.string().min(1) }) });

export async function fetchPersonalInviteCode(getToken: TokenSource): Promise<string> {
  return (await getJson("/api/personal-invites/me", getToken, inviteSchema, "Your personal invite link is temporarily unavailable. Please try again.")).invite.inviteCode;
}

const suggestionSchema = z.object({ suggestion: z.object({ id: z.number().int().positive(), companyName: z.string() }) });

/** Seeker demand signal: files a company suggestion (role "seeker"). It never creates a referral request. */
export async function requestCompany(getToken: TokenSource, companyName: string): Promise<{ id: number; companyName: string }> {
  return (await sendJson("/api/company-suggestions", "POST", { companyName, role: "seeker" }, getToken, suggestionSchema, "We could not save this request. Try again.")).suggestion;
}
