import { z } from "zod";
import { readApiJson } from "@/lib/apiResponse";

// Response contracts for the live employer REST surface (server/employerRoutes.ts).
// Parsed at the edge so the dashboard only renders fields the server really sent.
export const employerAccountSchema = z.object({
  id: z.number(),
  companyName: z.string(),
  billingEmail: z.string(),
  credits: z.number(),
  budgetMonthlyUsdCents: z.number(),
  approvalStatus: z.enum(["pending", "approved", "rejected", "suspended", "revoked"]).optional(),
  decisionNote: z.string().nullable().optional(),
});
export type EmployerAccount = z.infer<typeof employerAccountSchema>;

const accountResponseSchema = z.object({ account: employerAccountSchema.nullable().optional() });
const opportunitiesResponseSchema = z.object({ opportunities: z.array(z.object({ id: z.number(), isActive: z.boolean(), isSponsored: z.boolean() })) });
const spendRowSchema = z.object({
  kind: z.enum(["profile_unlock", "sponsorship", "credit_purchase"]),
  creditsSpent: z.number().optional(),
  creditsAdded: z.number().optional(),
  createdAt: z.string(),
});
const spendResponseSchema = z.object({ spend: z.array(spendRowSchema) });
type SpendRow = z.infer<typeof spendRowSchema>;
type ErrorPayload = { error?: string };

// Server-side list limits (listEmployerOpportunities / listEmployerSpendHistory).
export const LIST_LIMIT = 50;

export type EmployerActivity =
  | { access: "open"; opportunities: z.infer<typeof opportunitiesResponseSchema>["opportunities"]; spend: SpendRow[] }
  | { access: "restricted" };

const ACCOUNT_ERROR = "We could not load your employer account";
const OPEN_ERROR = "We could not open your employer account";
const ACTIVITY_ERROR = "We could not load your employer activity";

function parsed<T>(schema: z.ZodType<T>, payload: unknown, message: string): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(message);
  return result.data;
}

export async function fetchEmployerAccount(): Promise<EmployerAccount | null> {
  const response = await fetch("/api/employer/account", { credentials: "include" });
  const payload = await readApiJson<ErrorPayload>(response, ACCOUNT_ERROR);
  if (!response.ok) throw new Error(payload.error || ACCOUNT_ERROR);
  return parsed(accountResponseSchema, payload, ACCOUNT_ERROR).account ?? null;
}

export async function openEmployerAccount(companyName: string): Promise<EmployerAccount | null> {
  const response = await fetch("/api/employer/account", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyName: companyName.trim() }) });
  const payload = await readApiJson<ErrorPayload>(response, OPEN_ERROR);
  if (!response.ok) throw new Error(payload.error || OPEN_ERROR);
  return parsed(accountResponseSchema, payload, OPEN_ERROR).account ?? null;
}

// Roles and the credit ledger are approved-employer tools: a 403 means the
// application is not approved (yet), which the overview shows honestly.
export async function fetchEmployerActivity(): Promise<EmployerActivity> {
  const [rolesResponse, spendResponse] = await Promise.all([
    fetch("/api/employer/opportunities", { credentials: "include" }),
    fetch("/api/employer/spend-history", { credentials: "include" }),
  ]);
  if (rolesResponse.status === 403 || spendResponse.status === 403) return { access: "restricted" };
  const [roles, spend] = await Promise.all([readApiJson<ErrorPayload>(rolesResponse, ACTIVITY_ERROR), readApiJson<ErrorPayload>(spendResponse, ACTIVITY_ERROR)]);
  if (!rolesResponse.ok) throw new Error(roles.error || ACTIVITY_ERROR);
  if (!spendResponse.ok) throw new Error(spend.error || ACTIVITY_ERROR);
  return {
    access: "open",
    opportunities: parsed(opportunitiesResponseSchema, roles, ACTIVITY_ERROR).opportunities,
    spend: parsed(spendResponseSchema, spend, ACTIVITY_ERROR).spend,
  };
}

/** A capped list can only promise a lower bound, so say so instead of guessing. */
export const countLabel = (count: number, capped: boolean) => (capped ? `${count}+` : String(count));

export function activityStats(activity: EmployerActivity | undefined) {
  if (!activity || activity.access !== "open") return { liveRoles: "—", sponsored: "—" };
  const capped = activity.opportunities.length >= LIST_LIMIT;
  return {
    liveRoles: countLabel(activity.opportunities.filter(role => role.isActive).length, capped),
    sponsored: countLabel(activity.opportunities.filter(role => role.isSponsored).length, capped),
  };
}

/** Just joined = an open workspace where nothing has happened yet. */
export function isJustJoined(account: EmployerAccount, activity: EmployerActivity | undefined) {
  if (account.credits > 0 || account.budgetMonthlyUsdCents > 0) return false;
  if (!activity) return false;
  if (activity.access === "restricted") return true;
  return activity.opportunities.length === 0 && activity.spend.length === 0;
}

export type CreditRow = { label: string; value: number };

export function creditActivity(spend: SpendRow[], now: number, days = 30): { rows: CreditRow[]; truncated: boolean } {
  const since = now - days * 86_400_000;
  const recent = spend.filter(row => new Date(row.createdAt).getTime() >= since);
  const sum = (kind: SpendRow["kind"], field: "creditsSpent" | "creditsAdded") => recent.filter(row => row.kind === kind).reduce((total, row) => total + (row[field] ?? 0), 0);
  return {
    rows: [
      { label: "Credits bought", value: sum("credit_purchase", "creditsAdded") },
      { label: "Spent on profile unlocks", value: sum("profile_unlock", "creditsSpent") },
      { label: "Spent on sponsored roles", value: sum("sponsorship", "creditsSpent") },
    ],
    // The ledger endpoint returns the latest 50 entries; if all of them fall in
    // the window, older entries in the same window may be missing.
    truncated: spend.length >= LIST_LIMIT && recent.length === spend.length,
  };
}
