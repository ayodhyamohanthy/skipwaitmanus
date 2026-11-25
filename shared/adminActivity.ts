// ADMIN-activity-log (D-393): the admin activity log's filters, families and page shape, shared by the
// server routes (server/adminActivity.ts) and the admin page (client/src/pages/goal/admin-ops/).
import { z } from "zod";

export const ACTIVITY_FAMILIES = ["auth", "request", "billing", "account", "admin"] as const;
export type ActivityFamily = (typeof ACTIVITY_FAMILIES)[number];

export const ACTIVITY_FAMILY_LABELS: Readonly<Record<ActivityFamily, string>> = {
  auth: "Sign-in",
  request: "Referral requests",
  billing: "Billing",
  account: "Account",
  admin: "Admin",
};

/** Action prefixes per family. Work-email step-up is a sign-in event recorded by its own routes. */
export const ACTIVITY_FAMILY_PREFIXES: Readonly<Record<ActivityFamily, readonly string[]>> = {
  auth: ["auth.", "work_email.step_up", "work_email_otp."],
  request: ["company_referral.", "referral_request.", "ask_invite.", "first_look.", "referral_share_card.", "document.", "skippie_seeker."],
  billing: ["billing.", "payment.", "chargebee.", "promo.", "grant."],
  account: ["account.", "profile.", "privacy.", "follow.", "block.", "dm.", "notification.", "seeker_alert.", "referrer_fast_track.", "agent.", "agents.", "developer.", "assistant."],
  admin: ["admin."],
};

export const ACTIVITY_OUTCOMES = ["success", "failure", "denied"] as const;
export const ACTIVITY_PAGE_MAX = 250;
export const ACTIVITY_EXPORT_MAX = 5000;
/** Sign-in rows are kept this long; the daily auth-activity-retention job deletes older ones. */
export const AUTH_ACTIVITY_RETENTION_DAYS = 90;

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

export const activityFilterSchema = z.object({
  person: z.preprocess(blankToUndefined, z.string().trim().max(320).optional()),
  family: z.preprocess(blankToUndefined, z.enum(ACTIVITY_FAMILIES).optional()),
  outcome: z.preprocess(blankToUndefined, z.enum(ACTIVITY_OUTCOMES).optional()),
  query: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  action: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  from: z.preprocess(blankToUndefined, day.optional()),
  to: z.preprocess(blankToUndefined, day.optional()),
  before: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(ACTIVITY_PAGE_MAX).optional()),
});
export type ActivityFilter = z.infer<typeof activityFilterSchema>;

export const activityEventSchema = z.object({
  id: z.number(),
  action: z.string(),
  outcome: z.string(),
  resourceType: z.string().nullable().optional(),
  resourceId: z.string().nullable().optional(),
  companyDomain: z.string().nullable().optional(),
  metadata: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  actorUserId: z.number().nullable().optional(),
  actorName: z.string().nullable().optional(),
  actorEmail: z.string().nullable().optional(),
});
export type ActivityEventRow = z.infer<typeof activityEventSchema>;

export const requestTransitionSchema = z.object({
  id: z.number(),
  referralRequestId: z.number(),
  action: z.string(),
  fromStatus: z.string(),
  resultingStatus: z.string(),
  actorUserId: z.number().nullable(),
  role: z.enum(["seeker", "referrer", "actor"]),
  createdAt: z.union([z.string(), z.date()]),
});
export type RequestTransitionRow = z.infer<typeof requestTransitionSchema>;

/** Whom a person filter matched: account ids, and whether sign-in attempts are also matched by email. */
export type ActivityPersonMatch = { userIds: number[]; emailKey?: string };

/** A CSV cell that a spreadsheet would run as a formula is prefixed with a quote (CSV injection). */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
