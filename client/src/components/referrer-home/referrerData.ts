// Referrer data boundary for /referrer-home, /referrer-setup and /invite.
// Parses the live REST payloads with Zod at the edge and derives the kit v4
// referrer-home view from them. Derivations are pure so the honesty rules
// (real counts only, expiry from the same instant the seeker sees) stay testable.
import { reverifyDaysLeft } from "@shared/reverify";
import { z } from "zod";
import { getAskShelfLifeEndsAtMs, referralStatuses } from "@shared/referral";
import { companyIdentityOf, type CompanyIdentity } from "@shared/companies";
import { REFERRER_ACCESS_PATH, isVerifiedReferrer, referrerAccessResponseSchema } from "@shared/referrerAccess";
import { impactCardPayloadSchema, type ImpactCardPayload } from "@shared/shareImpactCard";
import { JOB_LEVELS, REFERRER_AREAS, jobFunctionFieldSchema, type JobFunction } from "@shared/jobFunctions";
import { referrerThankYouWallSchema, type ReferrerThankYouWall } from "@shared/landedJourney";
import { readApiJson } from "@/lib/apiResponse";
import { isWorkEmailCodeRequired, notifyWorkEmailCodeRequired } from "@/lib/referrerStepUpApi";

export type TokenSource = () => Promise<string | null | undefined>;

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Client-side re-verification nudge: warn 14 days before 90 days since the last verified work email. */
export { REVERIFY_DAYS } from "@shared/reverify";
export const REVERIFY_WARNING_DAYS = 14;

const timestamp = z.union([z.string(), z.date()]).transform(value => (typeof value === "string" ? value : value.toISOString()));
const count = z.number().int().nonnegative();

const profileSchema = z.object({ profile: z.object({ workEmailVerifiedAt: timestamp.nullish(), referralCapacity: z.number().int().nullish() }).nullish() });
const impactSchema = z.object({ summary: z.object({ reviewed: count, approved: count, introductions: count, interviews: count, offers: count, repliedWithin3DaysPct: z.number().min(0).max(100).nullish() }) });
const inboxRowSchema = z.object({
  id: z.number().int().positive(),
  companyDomain: z.string().min(1),
  jobFunction: jobFunctionFieldSchema,
  status: z.enum(referralStatuses),
  createdAt: timestamp,
  isClaimedByYou: z.boolean().optional().transform(value => value ?? false),
  unreadMessageCount: count.optional().transform(value => value ?? 0),
  attachmentCount: count.nullish(),
  expiresAt: timestamp.nullish(),
  // D-061 window fields: fallback clock when a payload carries no expiresAt.
  waitingForCoverage: z.boolean().nullish(),
  coverageVisibleAt: timestamp.nullish(),
  jobTitle: z.string().nullish(),
  askStrength: z.enum(["strong", "good", "basic"]).nullish().catch(null),
});
const inboxSchema = z.object({ requests: z.array(inboxRowSchema), hasEverReviewed: z.boolean().optional() });

const optionList = <T extends string>(options: readonly T[]) => z.array(z.string()).optional().transform(values => (values ?? []).filter((value): value is T => (options as readonly string[]).includes(value)));
export const referrerPreferencesSchema = z.object({
  referralCapacity: z.number().int().min(1).max(15).optional().transform(value => value ?? 3),
  preferAreas: optionList(REFERRER_AREAS),
  preferLevels: optionList(JOB_LEVELS),
  referrerVisibility: z.string().optional().transform((value): "anon" | "named" => (value === "named" ? "named" : "anon")),
  notifyNewAsk: z.boolean().optional().transform(value => value ?? true),
  paused: z.boolean().optional().transform(value => value ?? false),
});
const preferencesPayloadSchema = z.object({ preferences: referrerPreferencesSchema });

/** Verified work-email access (shared/referrerAccess.ts); companyName/companyInitials come from the server company directory. */
/** `codeRequired`: verified, but this session needs the in-session work-email step-up before referrer actions (D-057). */
export type CompanyAccess = { verified: boolean; domain: string; companyName: string | null; companyInitials: string | null; codeRequired?: boolean };
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
  /** Durable server flag: claimed or passed at least one ask ever. Null when the server predates the field (fail-closed: no samples). */
  hasEverReviewed: boolean | null;
  /** The seeker-writable private thank-you wall (queue row 20 slice D); null until it loads. */
  thankYous: ReferrerThankYouWall | null;
};

function authHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(path: string, getToken: TokenSource, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const token = await getToken();
  const response = await fetch(path, { credentials: "include", headers: authHeaders(token) });
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  // D-057: a referrer read refused for this session re-checks the verdict, so the page shows the step-up.
  if (isWorkEmailCodeRequired(response.status, payload)) notifyWorkEmailCodeRequired();
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
  if (isWorkEmailCodeRequired(response.status, payload)) notifyWorkEmailCodeRequired();
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

/** The server's verified-referrer verdict, judged by the one shared predicate. A failed or malformed check throws; it never reads as "not verified". */
export async function fetchCompanyAccess(getToken: TokenSource): Promise<CompanyAccess> {
  const access = await getJson(REFERRER_ACCESS_PATH, getToken, referrerAccessResponseSchema, "We could not check your work-email verification.");
  return { verified: isVerifiedReferrer(access), domain: access.workEmailDomain ?? "", companyName: access.companyName, companyInitials: access.companyInitials, ...(access.codeRequired ? { codeRequired: true } : {}) };
}

export async function fetchReferrerPreferences(getToken: TokenSource): Promise<ReferrerPreferences> {
  return (await getJson("/api/referrer-preferences", getToken, preferencesPayloadSchema, "We could not load your referrer settings.")).preferences;
}

export async function saveReferrerPreferences(getToken: TokenSource, patch: ReferrerPreferencesPatch): Promise<ReferrerPreferences> {
  return (await sendJson("/api/referrer-preferences", "PUT", patch, getToken, preferencesPayloadSchema, "We could not save your referrer settings.")).preferences;
}

/** The signed-in referrer's own share card, parsed at the edge; 5xx answers reach Sentry via readApiJson. */
export async function fetchImpactCard(getToken: TokenSource): Promise<ImpactCardPayload> {
  return getJson("/api/referrer/impact-card", getToken, impactCardPayloadSchema, "We could not load your impact card.");
}

const bundleSchema = z.object({
  access: referrerAccessResponseSchema,
  preferences: preferencesPayloadSchema.shape.preferences.nullable(),
  inboxNew: inboxSchema.nullable(),
  inboxCompleted: inboxSchema.nullable(),
  profile: profileSchema.nullable(),
  impact: impactSchema.shape.summary.nullable(),
  // Null when the bundle came from a server that has not shipped the wall yet: the
  // aside then shows no count rather than inventing one.
  thankYous: referrerThankYouWallSchema.nullish().transform(value => value ?? null),
  failed: z.array(z.string()),
});

type PrefetchedBundle = { at: number; response: Promise<Response> };

/** index.html only starts the home-bundle prefetch when this browser has loaded the bundle before, so signed-out visitors never trigger a 401 (the session cookie is httpOnly, so the page cannot see it directly). */
export const HOME_PREFETCH_HINT_KEY = "sw-home-prefetch-ok";
function setPrefetchHint(on: boolean) { try { if (on) localStorage.setItem(HOME_PREFETCH_HINT_KEY, "1"); else localStorage.removeItem(HOME_PREFETCH_HINT_KEY); } catch { /* storage unavailable */ } }

/** The request index.html started at page load, used once and only while fresh. Any problem means "ask again". */
async function takePrefetchedBundle(): Promise<z.infer<typeof bundleSchema> | null> {
  const holder = globalThis as unknown as { __swHomeBundle?: PrefetchedBundle };
  const prefetched = holder.__swHomeBundle;
  holder.__swHomeBundle = undefined;
  if (!prefetched || Date.now() - prefetched.at > 15_000) return null;
  try {
    const response = await prefetched.response;
    if (response.status === 401) setPrefetchHint(false);
    if (!response.ok) return null;
    const parsed = bundleSchema.safeParse(await response.json());
    if (parsed.success) setPrefetchHint(true);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** One request for the whole page. Returns null on any problem so the caller uses the separate endpoints instead. */
async function fetchHomeBundle(getToken: TokenSource): Promise<ReferrerHomeData | null> {
  try {
    const bundle = (await takePrefetchedBundle()) ?? await getJson("/api/referrer/home-bundle", getToken, bundleSchema, "bundle unavailable");
    setPrefetchHint(true);
    const access: CompanyAccess = (() => { const a = bundle.access; return { verified: isVerifiedReferrer(a), domain: a.workEmailDomain ?? "", companyName: a.companyName, companyInitials: a.companyInitials }; })();
    if (!access.verified) return { access, preferences: null, verifiedAt: null, profileCapacity: null, impact: null, fresh: [], completed: [], hasEverReviewed: null, thankYous: null };
    // The page needs preferences and both lists; profile, impact and the wall are optional extras.
    if (!bundle.preferences || !bundle.inboxNew || !bundle.inboxCompleted) return null;
    return {
      access,
      preferences: bundle.preferences,
      verifiedAt: bundle.profile?.profile?.workEmailVerifiedAt ?? null,
      profileCapacity: bundle.profile?.profile?.referralCapacity ?? null,
      impact: bundle.impact ?? null,
      fresh: bundle.inboxNew.requests,
      completed: bundle.inboxCompleted.requests,
      hasEverReviewed: bundle.inboxNew.hasEverReviewed ?? null,
      thankYous: bundle.thankYous ?? null,
    };
  } catch { return null; }
}

export async function fetchReferrerHome(getToken: TokenSource): Promise<ReferrerHomeData> {
  return (await fetchHomeBundle(getToken)) ?? fetchReferrerHomeSeparately(getToken);
}

async function fetchReferrerHomeSeparately(getToken: TokenSource): Promise<ReferrerHomeData> {
  const access = await fetchCompanyAccess(getToken);
  if (!access.verified) return { access, preferences: null, verifiedAt: null, profileCapacity: null, impact: null, fresh: [], completed: [], hasEverReviewed: null, thankYous: null };
  const [preferences, fresh, completed, profile, impact, thankYous] = await Promise.all([
    fetchReferrerPreferences(getToken),
    getJson("/api/company-referrals/inbox?scope=new", getToken, inboxSchema, "We could not load new asks."),
    getJson("/api/company-referrals/inbox?scope=completed", getToken, inboxSchema, "We could not load your reviews."),
    getOptional("/api/profile/me", getToken, profileSchema),
    getOptional("/api/referrer-impact/me", getToken, impactSchema),
    getOptional("/api/referrer/thank-yous", getToken, referrerThankYouWallSchema),
  ]);
  return {
    access,
    preferences,
    verifiedAt: profile?.profile?.workEmailVerifiedAt ?? null,
    profileCapacity: profile?.profile?.referralCapacity ?? null,
    impact: impact?.summary ?? null,
    fresh: fresh.requests,
    completed: completed.requests,
    hasEverReviewed: fresh.hasEverReviewed ?? null,
    thankYous,
  };
}

const handleSchema = z.object({ profile: z.object({ handle: z.string().nullish() }).nullish() });

/** The public profile handle (/p/:handle), or null when unset or unavailable. */
export async function fetchProfileHandle(getToken: TokenSource): Promise<string | null> {
  const handle = (await getOptional("/api/profile/me", getToken, handleSchema))?.profile?.handle?.trim();
  return handle ? handle : null;
}

/** The verified company's directory name and initials ("Wipro", "W"); the raw domain otherwise. */
export function companyIdentity(access: Pick<CompanyAccess, "domain" | "companyName" | "companyInitials">): CompanyIdentity {
  return companyIdentityOf({ companyDomain: access.domain, companyName: access.companyName, companyInitials: access.companyInitials });
}

/** Greeting for the viewer's local hour, so the heading never says evening at breakfast. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function expiryMs(row: Pick<InboxRow, "expiresAt" | "createdAt" | "waitingForCoverage" | "coverageVisibleAt">): number | null {
  const ms = row.expiresAt ? Date.parse(row.expiresAt) : getAskShelfLifeEndsAtMs(row);
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
  /** True only on a durable server "never claimed or passed" - gates the first-timer sample rows. False on doubt. */
  showSamples: boolean;
  paused: boolean;
  reverifyDue: boolean;
  /** Whole days left before the badge needs re-verifying (grandfathered by the shared policy); null when not verified. */
  reverifyDaysLeft: number | null;
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
  const daysLeft = reverifyDaysLeft(data.verifiedAt, nowMs);
  return {
    verified,
    company: data.access.domain ? companyIdentity(data.access) : null,
    waiting,
    expiringSoon,
    capacity,
    used,
    left: Math.max(0, capacity - used),
    atCapacity: verified && used >= capacity,
    isNew: verified && waiting.length === 0 && (data.impact?.reviewed ?? 0) === 0,
    showSamples: verified && waiting.length === 0 && data.hasEverReviewed === false,
    paused: verified && Boolean(data.preferences?.paused),
    reverifyDue: verified && daysLeft !== null && daysLeft <= REVERIFY_WARNING_DAYS,
    reverifyDaysLeft: verified ? daysLeft : null,
  };
}

const inviteSchema = z.object({ invite: z.object({ inviteCode: z.string().min(1) }) });

export async function fetchPersonalInviteCode(getToken: TokenSource): Promise<string> {
  return (await getJson("/api/personal-invites/me", getToken, inviteSchema, "Your personal invite link is temporarily unavailable. Please try again.")).invite.inviteCode;
}

const suggestionSchema = z.object({
  suggestion: z.object({
    id: z.number().int().positive(),
    companyName: z.string(),
    jobFunction: jobFunctionFieldSchema,
    alreadyRecorded: z.boolean().optional(),
  }),
});

export type CompanyDemandVote = { id: number; companyName: string; jobFunction: JobFunction | null; alreadyRecorded: boolean };

/**
 * Seeker demand signal: files a company suggestion (role "seeker"). It never
 * creates a referral request. The function is the kit's optional "Work function"
 * choice, and `alreadyRecorded` tells the panel whether this added a new vote or
 * returned the one this seeker already filed, so the thank-you copy stays true.
 */
export async function requestCompany(getToken: TokenSource, companyName: string, jobFunction: JobFunction | null): Promise<CompanyDemandVote> {
  const { suggestion } = await sendJson("/api/company-suggestions", "POST", { companyName, role: "seeker", jobFunction: jobFunction ?? undefined }, getToken, suggestionSchema, "We could not save this request. Try again.");
  return { ...suggestion, alreadyRecorded: suggestion.alreadyRecorded ?? false };
}
