// The people surfaces' data contract (D-048-p3-admin-people). This row's admin
// data module (components/admin/adminApi.ts) is read-only (§3) and declares no
// users or privacy payloads, and its adminRequest types a POST body as string
// values only - while /api/admin/users/:id/suspend answers 400 unless
// `suspended` is a real boolean (server/privateReferralRoutes.ts:1599). So the
// row's own module pins both payloads against what those routes actually
// answer, with the same call semantics: bearer token when present, the access
// gate typed, the payload Zod-parsed, plain words on any other failure.
import { z } from "zod";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError, type TokenSource } from "@/components/admin/adminApi";
import { readApiJson } from "@/lib/apiResponse";
import type { GoalStatusValue } from "@/components/goal/GoalStatus";

const truthy = z.union([z.boolean(), z.number()]).transform(value => Boolean(value));
const nullableText = z.string().nullable();

export const adminUserRowSchema = z.object({
  id: z.number(),
  email: nullableText,
  name: nullableText,
  accountType: nullableText,
  company: nullableText,
  workEmailVerifiedAt: nullableText,
  suspended: truthy,
  createdAt: z.string(),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export const adminUsersResponseSchema = z.object({ users: z.array(adminUserRowSchema).default([]) });
export const suspendResultSchema = z.object({ user: z.object({ suspended: truthy.optional() }).passthrough() });

export const privacyRequestRowSchema = z.object({
  id: z.number(),
  kind: z.string(),
  status: z.string(),
  resolution: nullableText,
  userId: z.number(),
  requesterName: nullableText,
  requesterEmail: nullableText,
  createdAt: z.string(),
  updatedAt: z.string(),
  reviewedAt: nullableText,
});
export type PrivacyRequestRow = z.infer<typeof privacyRequestRowSchema>;

export const privacyRequestsResponseSchema = z.object({ requests: z.array(privacyRequestRowSchema).default([]) });
export const privacyReviewResultSchema = z.object({ request: privacyRequestRowSchema.partial().default({}) });

export const adminPeopleKeys = { users: ["admin", "users"], privacyRequests: ["admin", "privacy-requests"] } as const;

/** One admin POST with a typed body: never a second access-gate rule. */
export async function adminPeoplePost<T>(path: string, schema: z.ZodType<T>, getToken: TokenSource, fallback: string, body: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) throw new AdminAccessError(ADMIN_ACCESS_MESSAGE);
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

/** A suspended account reads as ended, then its role, then the absence of one - the kit roster's order. */
const ACCOUNT_TYPE: Record<string, { status: GoalStatusValue; label: string }> = {
  job_seeker: { status: "queue_new", label: "Job Seeker" },
  referrer: { status: "referred", label: "Referrer" },
};

export function userStatus(user: AdminUserRow): { status: GoalStatusValue; label: string } {
  if (user.suspended) return { status: "expired", label: "Suspended" };
  return (user.accountType ? ACCOUNT_TYPE[user.accountType] : undefined) ?? { status: "withdrawn", label: "No profile" };
}

const PRIVACY_STATUS: Record<string, { status: GoalStatusValue; label: string }> = {
  requested: { status: "waiting", label: "Requested" },
  in_review: { status: "accepted", label: "In review" },
  completed: { status: "referred", label: "Completed" },
  declined: { status: "expired", label: "Declined" },
};

export function privacyStatus(request: PrivacyRequestRow): { status: GoalStatusValue; label: string } {
  return PRIVACY_STATUS[request.status] ?? { status: "withdrawn", label: request.status.replace("_", " ") };
}

export const accountLabelOf = (user: AdminUserRow) => user.email || `User #${user.id}`;
export const requesterLabelOf = (request: PrivacyRequestRow) => `${request.requesterName || "Account holder"} · ${request.requesterEmail || `User ${request.userId}`}`;
/** One date format for both people surfaces, with the locale pinned so a capture is reproducible. */
export const onDate = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const joinedOn = (value: string) => `Joined ${onDate(value)}`;
/** One date-time format, with the locale pinned so a capture is reproducible. */
export const stamp = (value: string) => new Date(value).toLocaleString("en-US");
export const requestedOn = (value: string) => `Requested ${stamp(value)}`;
