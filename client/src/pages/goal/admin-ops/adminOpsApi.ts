// Ops REST contracts (D-048-p3-admin-ops): the same paths, methods, headers,
// bodies and error copy as the five kit pages they sit behind
// (D-048-admin.md §4.1 - the reskin changes presentation only), parsed at the
// edge. Rows that do not match their schema are dropped the way
// adminApi.ts `loadEnrollments` already drops them, so a malformed row never
// renders as undefined; a failed or absent list still reads as empty, exactly
// as the kit page reads it.
import { z } from "zod";
import { flowBaselineSchema } from "@shared/flowBaseline";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError } from "@/components/admin/adminApi";
import { readApiJson } from "@/lib/apiResponse";

export type TokenSource = () => Promise<string | null | undefined>;

export const ACTIVITY_FALLBACK = "We could not load operational activity";
export const FLOW_HEALTH_FALLBACK = "We could not load referral flow health";
export const REVENUE_FALLBACK = "We could not load revenue";
export const SCHEMA_STATUS_FALLBACK = "We could not load the schema reconcile status";
export const SCHEMA_RUN_FALLBACK = "We could not run the schema reconcile";
export const PARTNERS_FALLBACK = "We could not load partner modules";
export const SPONSORSHIPS_FALLBACK = "We could not load sponsorships";
export const CREATE_MODULE_FALLBACK = "We could not create the partner module";

const bearer = async (getToken?: TokenSource): Promise<Record<string, string>> => {
  const token = await getToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function readPayload(response: Response, fallback: string): Promise<Record<string, unknown>> {
  return readApiJson<Record<string, unknown>>(response, fallback);
}

/** Throws the server's own message when the kit page would; empty when it would show none. */
function errorFrom(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.error === "string" && payload.error ? payload.error : fallback;
}

function rows<T>(source: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(source)) return [];
  return source.flatMap(item => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

// ---------- /admin/activity ----------

export const activityEventSchema = z.object({
  id: z.number(),
  action: z.string(),
  outcome: z.enum(["success", "failure", "denied"]),
  resourceType: z.string().nullish(),
  resourceId: z.string().nullish(),
  companyDomain: z.string().nullish(),
  metadata: z.string().nullish(),
  createdAt: z.union([z.string(), z.date()]),
  actorName: z.string().nullish(),
  actorEmail: z.string().nullish(),
});
export type ActivityEvent = z.infer<typeof activityEventSchema>;

export async function loadActivity(getToken: TokenSource, query: string, outcome: string): Promise<ActivityEvent[]> {
  const params = new URLSearchParams({ limit: "250" });
  if (query.trim()) params.set("query", query.trim());
  if (outcome) params.set("outcome", outcome);
  const response = await fetch(`/api/admin/activity?${params.toString()}`, { headers: await bearer(getToken), credentials: "include" });
  const payload = await readPayload(response, ACTIVITY_FALLBACK);
  if (!response.ok) throw new Error(errorFrom(payload, ACTIVITY_FALLBACK));
  return rows(payload.events, activityEventSchema);
}

// ---------- /admin/flow-health ----------

export const flowHealthSchema = z.object({
  funnel: z.object({ requestsCreated: z.number(), requestsClaimed: z.number(), decisionsRecorded: z.number(), waitingForCoverage: z.number() }),
  coverageGaps: z.array(z.object({ companyDomain: z.string(), waitingRequests: z.number(), verifiedCoverage: z.number() })).default([]),
  instrumentation: z.object({ uploadedDocuments: z.number(), recordedFailures: z.number() }),
});
export type FlowHealth = z.infer<typeof flowHealthSchema>;

export const revenueSummarySchema = z.object({
  byProvider: z.array(z.object({ provider: z.string(), currency: z.string(), totalAmount: z.number(), count: z.number() })).default([]),
  totalsByCurrency: z.array(z.object({ currency: z.string(), totalAmount: z.number(), count: z.number() })).default([]),
  refundedTotalByCurrency: z.array(z.object({ currency: z.string(), totalAmount: z.number(), count: z.number() })).default([]),
  recordedAt: z.string().default(""),
});
export type RevenueSummary = z.infer<typeof revenueSummarySchema>;

/** What the kit page renders when a payload arrives without the field. */
export const EMPTY_FLOW_HEALTH: FlowHealth = { funnel: { requestsCreated: 0, requestsClaimed: 0, decisionsRecorded: 0, waitingForCoverage: 0 }, coverageGaps: [], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } };
export const EMPTY_REVENUE: RevenueSummary = { byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: "" };

export type FlowHealthReport = { health: FlowHealth; baseline: z.infer<typeof flowBaselineSchema> | null; revenue: RevenueSummary };

/** The kit page's two parallel GETs; an unparseable baseline reads as unavailable. */
export async function loadFlowHealth(getToken: TokenSource): Promise<FlowHealthReport> {
  const headers = await bearer(getToken);
  const [healthResponse, revenueResponse] = await Promise.all([
    fetch("/api/admin/flow-health", { headers, credentials: "include" }),
    fetch("/api/admin/revenue", { headers, credentials: "include" }),
  ]);
  const healthPayload = await readPayload(healthResponse, FLOW_HEALTH_FALLBACK);
  const revenuePayload = await readPayload(revenueResponse, REVENUE_FALLBACK);
  if (!healthResponse.ok) throw new Error(errorFrom(healthPayload, FLOW_HEALTH_FALLBACK));
  if (!revenueResponse.ok) throw new Error(errorFrom(revenuePayload, REVENUE_FALLBACK));
  const health = flowHealthSchema.safeParse(healthPayload.health);
  const baseline = flowBaselineSchema.safeParse(healthPayload.baseline);
  const revenue = revenueSummarySchema.safeParse(revenuePayload.revenue);
  return { health: health.success ? health.data : EMPTY_FLOW_HEALTH, baseline: baseline.success ? baseline.data : null, revenue: revenue.success ? revenue.data : EMPTY_REVENUE };
}

// ---------- /admin/schema ----------

export const schemaSnapshotSchema = z.object({
  reconciled: z.boolean(),
  results: z.array(z.object({ statement: z.string(), ok: z.boolean(), error: z.string().optional() })).default([]),
  firstError: z.string().nullable(),
});
export type SchemaSnapshot = z.infer<typeof schemaSnapshotSchema>;

export async function readSchemaReconcile(getToken: TokenSource): Promise<SchemaSnapshot> {
  const response = await fetch("/api/admin/schema/reconcile", { headers: await bearer(getToken), credentials: "include" });
  const payload = await readPayload(response, SCHEMA_STATUS_FALLBACK);
  if (!response.ok) throw new Error(errorFrom(payload, SCHEMA_STATUS_FALLBACK));
  const parsed = schemaSnapshotSchema.safeParse(payload);
  if (!parsed.success) throw new Error(SCHEMA_STATUS_FALLBACK);
  return parsed.data;
}

/** Runs the fixed allowlisted statements - the same POST, no free-form SQL. */
export async function runSchemaReconcile(getToken: TokenSource): Promise<SchemaSnapshot> {
  const response = await fetch("/api/admin/schema/reconcile", { method: "POST", headers: await bearer(getToken), credentials: "include" });
  const payload = await readPayload(response, SCHEMA_RUN_FALLBACK);
  if (!response.ok) throw new Error(errorFrom(payload, SCHEMA_RUN_FALLBACK));
  const parsed = schemaSnapshotSchema.safeParse(payload);
  if (!parsed.success) throw new Error(SCHEMA_RUN_FALLBACK);
  return parsed.data;
}

// ---------- /admin/smoke ----------

export const smokeStatusSchema = z.object({
  enabled: z.boolean().optional(),
  active: z.boolean().optional(),
  role: z.string().optional(),
  csrf: z.string().optional(),
});
export type SmokeStatus = z.infer<typeof smokeStatusSchema>;

/** The kit page sends no bearer here: the fixture is cookie + CSRF gated only. */
export async function readSmokeStatus(): Promise<SmokeStatus> {
  const response = await fetch("/api/admin/smoke/status", { credentials: "include" });
  if (response.status === 404) return {};
  return smokeStatusSchema.parse(await response.json().catch(() => ({})));
}

export async function readSmokeSnapshot(): Promise<Record<string, unknown> | undefined> {
  const response = await fetch("/api/admin/smoke/snapshot", { credentials: "include" });
  return response.ok ? (await response.json().catch(() => undefined)) as Record<string, unknown> : undefined;
}

/** One smoke mutation: CSRF header and body, the kit page's exact failure copy. */
export async function postSmokeAction(path: string, csrf: string, body: Record<string, string>): Promise<void> {
  const response = await fetch(`/api/admin/smoke/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf || "" },
    body: JSON.stringify({ ...body, csrf }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Smoke action failed (${response.status})`);
  }
}

// ---------- /admin/partners ----------

export const partnerModuleSchema = z.object({
  id: z.number(),
  partnerName: z.string(),
  category: z.enum(["interview_prep", "resume_vetting", "skill_assessment", "other"]),
  headline: z.string(),
  description: z.string().nullish(),
  targetRoles: z.string().nullish(),
  ctaLabel: z.string(),
  ctaUrl: z.string(),
  isActive: z.boolean(),
  impressions: z.number(),
  clicks: z.number(),
});
export type PartnerModule = z.infer<typeof partnerModuleSchema>;

export const sponsorshipSchema = z.object({
  id: z.number(),
  companyDomain: z.string(),
  roleTitle: z.string(),
  sponsoredTier: z.string().nullish(),
  sponsoredUntil: z.union([z.string(), z.date()]).nullish(),
});
export type Sponsorship = z.infer<typeof sponsorshipSchema>;

export type PartnerInventory = { modules: PartnerModule[]; sponsorships: Sponsorship[] };

/** The kit page's gate: a 403 on either read denies the whole inventory. */
export async function loadPartnerInventory(getToken: TokenSource): Promise<PartnerInventory> {
  const headers = await bearer(getToken);
  const [partnersResponse, sponsorResponse] = await Promise.all([
    fetch("/api/admin/partners", { headers, credentials: "include" }),
    fetch("/api/admin/sponsorships", { headers, credentials: "include" }),
  ]);
  if (partnersResponse.status === 403 || sponsorResponse.status === 403) throw new AdminAccessError(ADMIN_ACCESS_MESSAGE);
  const partnersPayload = await readPayload(partnersResponse, PARTNERS_FALLBACK);
  const sponsorPayload = await readPayload(sponsorResponse, SPONSORSHIPS_FALLBACK);
  if (!partnersResponse.ok) throw new Error(errorFrom(partnersPayload, PARTNERS_FALLBACK));
  return { modules: rows(partnersPayload.modules, partnerModuleSchema), sponsorships: sponsorResponse.ok ? rows(sponsorPayload.sponsorships, sponsorshipSchema) : [] };
}

export const newPartnerModuleSchema = z.object({
  partnerName: z.string().min(1),
  category: z.enum(["interview_prep", "resume_vetting", "skill_assessment", "other"]),
  headline: z.string().min(1),
  description: z.string(),
  targetRoles: z.string(),
  ctaLabel: z.string().min(1),
  ctaUrl: z.string().min(1),
});
export type NewPartnerModule = z.infer<typeof newPartnerModuleSchema>;

/** The kit form's exact POST body. */
export async function createPartnerModule(getToken: TokenSource, module: NewPartnerModule): Promise<void> {
  const response = await fetch("/api/admin/partners", { method: "POST", headers: { "Content-Type": "application/json", ...(await bearer(getToken)) }, credentials: "include", body: JSON.stringify(module) });
  const payload = await readPayload(response, CREATE_MODULE_FALLBACK);
  if (!response.ok) throw new Error(errorFrom(payload, CREATE_MODULE_FALLBACK));
}

export async function setPartnerModuleActive(getToken: TokenSource, id: number, isActive: boolean): Promise<void> {
  const response = await fetch(`/api/admin/partners/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await bearer(getToken)) }, credentials: "include", body: JSON.stringify({ isActive }) });
  if (!response.ok) throw new Error("module update failed");
}

export async function endSponsorship(getToken: TokenSource, id: number): Promise<void> {
  const response = await fetch(`/api/admin/opportunities/${id}/end-sponsorship`, { method: "POST", headers: await bearer(getToken), credentials: "include" });
  if (!response.ok) throw new Error("sponsorship end failed");
}
