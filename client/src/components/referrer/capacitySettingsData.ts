// Data boundary for the referrer workspace "Setup & capacity" tab. Reads the
// verified company (GET /api/company-referrals/access) and the live referrer
// preferences (GET/PUT /api/referrer-preferences), validating both with Zod.
import { z } from "zod";
import { companyIdentityFieldsSchema } from "@shared/companies";
import { REFERRER_AREAS } from "@shared/jobFunctions";
import { readApiJson } from "@/lib/apiResponse";

export type TokenSource = () => Promise<string | null | undefined>;

/** The shared referrer job areas (shared/jobFunctions.ts); PUT /api/referrer-preferences rejects anything else. */
export const WORK_FUNCTIONS = REFERRER_AREAS;
export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 15;
export const capacitySettingsKey = ["referrer-workspace", "capacity-settings"] as const;

const accessSchema = z.object({ verifiedCompanyAccess: z.boolean().optional(), workEmailDomain: z.string().nullish(), ...companyIdentityFieldsSchema.shape });
const preferencesSchema = z.object({
  preferences: z.object({
    // The profile form (tRPC) accepts 0-20; this control's real range is the PUT contract's 1-15.
    referralCapacity: z.number().int().transform(value => Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, value))),
    preferAreas: z.array(z.string()),
    paused: z.boolean(),
  }),
});

/** companyName is the server company directory name for companyDomain (null outside the directory). */
export type CapacitySettings = { companyDomain: string | null; companyName: string | null; capacity: number; areas: string[]; paused: boolean };
export type CapacitySettingsInput = { referralCapacity: number; preferAreas: string[]; paused: boolean };

const knownFunction = (value: string) => (WORK_FUNCTIONS as readonly string[]).includes(value);

async function authedJson(path: string, getToken: TokenSource, fallback: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const token = await getToken();
  const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  return payload;
}

function parsePreferences(payload: Record<string, unknown>) {
  const parsed = preferencesSchema.safeParse(payload);
  if (!parsed.success) throw new Error("We could not read your referrer settings");
  return parsed.data.preferences;
}

export async function fetchCapacitySettings(getToken: TokenSource): Promise<CapacitySettings> {
  const [accessPayload, preferencesPayload] = await Promise.all([
    authedJson("/api/company-referrals/access", getToken, "We could not check your work-email access"),
    authedJson("/api/referrer-preferences", getToken, "We could not load your referrer settings"),
  ]);
  const access = accessSchema.safeParse(accessPayload);
  if (!access.success) throw new Error("We could not check your work-email access");
  const preferences = parsePreferences(preferencesPayload);
  return {
    companyDomain: access.data.verifiedCompanyAccess && access.data.workEmailDomain ? access.data.workEmailDomain : null,
    companyName: access.data.verifiedCompanyAccess && access.data.workEmailDomain ? access.data.companyName ?? null : null,
    capacity: preferences.referralCapacity,
    areas: preferences.preferAreas.filter(knownFunction),
    paused: preferences.paused,
  };
}

/** Keeps every saved area; the chosen function moves to the front as the primary lane. */
export function orderAreas(primary: string, saved: readonly string[]): string[] {
  if (!primary || !knownFunction(primary)) return saved.filter(knownFunction);
  return [primary, ...saved.filter(area => area !== primary && knownFunction(area))];
}

export async function saveCapacitySettings(getToken: TokenSource, input: CapacitySettingsInput): Promise<Omit<CapacitySettings, "companyDomain" | "companyName">> {
  const payload = await authedJson("/api/referrer-preferences", getToken, "We could not save your referrer settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const preferences = parsePreferences(payload);
  return { capacity: preferences.referralCapacity, areas: preferences.preferAreas.filter(knownFunction), paused: preferences.paused };
}
