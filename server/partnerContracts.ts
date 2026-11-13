import { z } from "zod";
import type { PartnerModuleCategory } from "../drizzle/schema";

/**
 * Edge contracts for the partner-module surface owned by server/employerRoutes.ts:
 * the admin create/patch payloads and the budgets for the two unauthenticated
 * telemetry writes. db.ts sanitizes again on the way in; this is the boundary
 * that decides what an accepted request may contain at all, so a wrong-typed or
 * unknown field gets one clear 400 instead of reaching a `.trim()` call.
 */

const PARTNER_CATEGORIES = ["interview_prep", "resume_vetting", "skill_assessment", "other"] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

// Pinned to the drizzle enum in both directions: adding or dropping a value on
// either side stops compiling rather than drifting silently.
type BothTrue<A extends true, B extends true> = [A, B];
export type PartnerCategoryMatchesSchema = BothTrue<
  PartnerCategory extends PartnerModuleCategory ? true : false,
  PartnerModuleCategory extends PartnerCategory ? true : false
>;

export const isPartnerCategory = (value: unknown): value is PartnerCategory =>
  PARTNER_CATEGORIES.includes(value as PartnerCategory);

/**
 * Only web links. db.ts checks `new URL(value)`, which also accepts
 * `javascript:` and `data:` - those reach an <a href> on seeker-facing cards.
 */
const webUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(value => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "must be an http(s) link");

// Length ceilings mirror the partnerModules columns as db.ts applies them.
const partnerFields = {
  partnerName: z.string().trim().min(1).max(120),
  category: z.enum(PARTNER_CATEGORIES),
  headline: z.string().trim().min(1).max(180),
  description: z.string().trim().max(600),
  targetRoles: z.string().trim().max(600),
  ctaLabel: z.string().trim().min(1).max(80),
  ctaUrl: webUrl,
};

export const createPartnerModuleSchema = z
  .object({ ...partnerFields, description: partnerFields.description.optional(), targetRoles: partnerFields.targetRoles.optional() })
  .strict();
export const partnerModulePatchSchema = z
  .object({ ...partnerFields, description: partnerFields.description.nullable(), targetRoles: partnerFields.targetRoles.nullable() })
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

export type PartnerModuleCreation = {
  partnerName: string;
  category: PartnerCategory;
  headline: string;
  description?: string;
  targetRoles?: string;
  ctaLabel: string;
  ctaUrl: string;
};
export type PartnerModulePatch = {
  partnerName?: string;
  category?: PartnerCategory;
  headline?: string;
  description?: string | null;
  targetRoles?: string | null;
  ctaLabel?: string;
  ctaUrl?: string;
  isActive?: boolean;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function describeFailure(error: z.ZodError): string {
  const [issue] = error.issues;
  if (!issue) return "Invalid partner module payload";
  const field = issue.path.join(".");
  return field ? `${field} ${issue.message.toLowerCase()}` : issue.message;
}

export function parsePartnerModuleCreation(body: unknown): ParseResult<PartnerModuleCreation> {
  const parsed = createPartnerModuleSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: describeFailure(parsed.error) };
  const { partnerName, category, headline, description, targetRoles, ctaLabel, ctaUrl } = parsed.data;
  return { ok: true, value: { partnerName, category, headline, ctaLabel, ctaUrl, ...(description === undefined ? {} : { description }), ...(targetRoles === undefined ? {} : { targetRoles }) } };
}

export function parsePartnerModulePatch(body: unknown): ParseResult<PartnerModulePatch> {
  const parsed = partnerModulePatchSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: describeFailure(parsed.error) };
  const patch = parsed.data;
  if (!Object.keys(patch).length) return { ok: false, error: "nothing to update" };
  return { ok: true, value: patch };
}

export const TELEMETRY_WINDOW_MS = 60_000;
export const PARTNER_IMPRESSION_LIMIT_PER_WINDOW = 120;
export const PARTNER_CLICK_LIMIT_PER_WINDOW = 30;

export type TelemetryLimiter = {
  /** False once `key` has spent its budget in the window that contains `now`. */
  allow: (key: string, now: number) => boolean;
  /** Live bucket count, so the memory ceiling is checkable. */
  tracked: () => number;
};

/**
 * Fixed-window counter for a single container: a cost floor on anonymous
 * telemetry writes, not a fraud guarantee. Cross-container durability needs
 * shared storage, which this repository has not been approved to add.
 */
export function createTelemetryLimiter(input: { limitPerWindow: number; windowMs: number; maxKeys?: number }): TelemetryLimiter {
  const { limitPerWindow, windowMs } = input;
  const maxKeys = input.maxKeys ?? 4096;
  const buckets = new Map<string, { start: number; count: number }>();
  return {
    allow(key, now) {
      const start = Math.floor(now / windowMs) * windowMs;
      buckets.forEach((bucket, cached) => {
        if (bucket.start < start) buckets.delete(cached);
      });
      while (buckets.size >= maxKeys) {
        const oldest = buckets.keys().next();
        if (oldest.done) break;
        buckets.delete(oldest.value);
      }
      const current = buckets.get(key);
      if (current && current.start === start) {
        if (current.count >= limitPerWindow) return false;
        current.count += 1;
        return true;
      }
      buckets.set(key, { start, count: 1 });
      return true;
    },
    tracked: () => buckets.size,
  };
}
