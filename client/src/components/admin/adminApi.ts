import { z } from "zod";
import { readApiJson } from "@/lib/apiResponse";

/** Thrown for 401/403 so admin screens can show the access gate instead of retrying. */
export class AdminAccessError extends Error {}

export const ADMIN_NETWORK_ERROR = "We could not reach SkipWait. Check your connection and try again.";
export const ADMIN_ACCESS_MESSAGE = "Administrator access is required.";

export type TokenSource = () => Promise<string | null | undefined>;

/** One admin REST call: bearer token when present, access errors typed, payload Zod-validated. */
export async function adminRequest<T>(path: string, schema: z.ZodType<T>, getToken: TokenSource, fallback: string, body?: Record<string, string>): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, body ? { method: "POST", credentials: "include", headers, body: JSON.stringify(body) } : { credentials: "include", headers });
  } catch {
    throw new Error(ADMIN_NETWORK_ERROR);
  }
  if (response.status === 401 || response.status === 403) throw new AdminAccessError(ADMIN_ACCESS_MESSAGE);
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

/** Never retry an access denial; retry a transient failure once. */
export const adminRetry = (count: number, error: Error) => !(error instanceof AdminAccessError) && count < 1;

const truthy = z.union([z.boolean(), z.number()]).transform(value => Boolean(value));

export const flowHealthSchema = z.object({
  health: z.object({
    funnel: z.object({ requestsCreated: z.number(), requestsClaimed: z.number(), decisionsRecorded: z.number(), waitingForCoverage: z.number() }),
    coverageGaps: z.array(z.object({ companyDomain: z.string(), waitingRequests: z.number(), verifiedCoverage: z.number() })),
  }),
});
export type FlowHealth = z.infer<typeof flowHealthSchema>["health"];

export const safetyReportSchema = z.object({
  id: z.number(),
  reason: z.string(),
  details: z.string().nullable(),
  referralRequestId: z.number().nullable(),
  reportedUserId: z.number().nullable(),
  urgent: truthy,
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
});
export type SafetyReport = z.infer<typeof safetyReportSchema>;
export const safetyReportsSchema = z.object({ reports: z.array(safetyReportSchema) });

export const companySuggestionSchema = z.object({
  id: z.number(),
  companyName: z.string(),
  website: z.string().nullable(),
  role: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type CompanySuggestion = z.infer<typeof companySuggestionSchema>;
export const companySuggestionsSchema = z.object({ suggestions: z.array(companySuggestionSchema) });

/** Referrer enrollments from the unified approval queue (the live verification exceptions). */
export const enrollmentSchema = z.object({
  kind: z.literal("referrer_enrollment"),
  id: z.number(),
  status: z.string(),
  companyDomain: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
  meta: z.object({
    otpTime: z.string().nullable().optional(),
    referrerName: z.string().nullable().optional(),
    referrerEmail: z.string().nullable().optional(),
  }).optional(),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;
const approvalQueueSchema = z.object({ items: z.array(z.object({ kind: z.string() }).passthrough()) });

export async function loadEnrollments(getToken: TokenSource): Promise<Enrollment[]> {
  const { items } = await adminRequest("/api/admin/approval-queue?limit=250", approvalQueueSchema, getToken, "We could not load the approval queue");
  return items.flatMap(item => {
    const parsed = enrollmentSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export const decisionResultSchema = z.object({}).passthrough();

export const OPEN_ENROLLMENT_STATUSES = new Set(["pending", "under_review", "requires_review"]);
export const TERMINAL_CASE_STATUSES = new Set(["resolved", "dismissed", "approved", "declined", "rejected"]);

export const adminKeys = {
  flowHealth: ["admin", "flow-health"] as const,
  enrollments: ["admin", "approval-queue", "referrer_enrollment"] as const,
  reports: ["admin", "safety-reports"] as const,
  suggestions: ["admin", "company-suggestions"] as const,
};
