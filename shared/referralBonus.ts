// D-099 referral-bonus contract (slice A, D-374): one current, sourced figure per
// company, entered by an admin who read it on the employer's own site. Every
// public reader parses with these schemas; nothing else defines a bonus shape.
//
// The employer sets and pays its own referral programme; skipwait.me never pays
// referrers (D-055, D-063). No public page, sitemap entry or call to action rides
// on a bonus (D-374): the only public surface is one neutral fact line on
// /explore/:slug (slice B).
import { z } from "zod";

/** A figure older than this is treated as not published on every public surface (ruling 4). */
export const BONUS_FRESHNESS_DAYS = 365;

/** The report reasons a person may choose (ruling 7). `new_source` is stored but never offered. */
export const BONUS_REPORT_REASONS = ["figure_changed", "source_gone", "not_this_company", "other"] as const;
export type BonusReportReason = (typeof BONUS_REPORT_REASONS)[number];

/** Every stored reason, including the reserved `new_source` (migration enum). */
export const BONUS_STORED_REPORT_REASONS = [...BONUS_REPORT_REASONS, "new_source"] as const;

/** Ruling 7: five reports per person per 24 hours, then one neutral 429. */
export const BONUS_REPORTS_PER_DAY = 5;
export const BONUS_REPORT_LIMIT_MESSAGE = "You have sent several reports today. Thank you; we will look at them.";

/** Ruling 2's plain refusal. */
export const BONUS_SOURCE_DOMAIN_ERROR = (companyName: string) => `The source must be on ${companyName}'s own website.`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;

const isoDateString = z.string().trim().max(40).regex(ISO_DATE, "Use an ISO date")
  .refine(value => !Number.isNaN(Date.parse(value)), "Use an ISO date");

/** Real ISO 4217 codes only: `ABC` and `usd` are refused (ruling 3, §7 test 1). */
const SUPPORTED_CURRENCIES: ReadonlySet<string> = (() => {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  try { return new Set(supported ? supported("currency") : []); } catch { return new Set<string>(); }
})();

const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code")
  .refine(value => SUPPORTED_CURRENCIES.size === 0 || SUPPORTED_CURRENCIES.has(value), "Use a real currency code");

/** One published figure as every public reader sees it. Allow-list only (ruling §5.3). */
export const publicBonusSchema = z.object({
  amountMinor: z.number().int().positive().max(10 ** 12),
  currency: currencySchema,
  upTo: z.boolean(),
  scopeNote: z.string().trim().max(120).nullable(),
  sourceUrl: z.string().url().max(2048),
  sourceHost: z.string().trim().min(1).max(255),
  checkedAt: isoDateString,
}).strict();
export type PublicBonus = z.infer<typeof publicBonusSchema>;

const companyIdentitySchema = z.object({
  slug: z.string().trim().min(1).max(48),
  name: z.string().trim().min(1).max(160),
  initials: z.string().trim().min(1).max(4),
}).strict();

export const bonusListResponseSchema = z.object({
  bonuses: z.array(z.object({ company: companyIdentitySchema, bonus: publicBonusSchema }).strict()),
}).strict();
export type BonusListResponse = z.infer<typeof bonusListResponseSchema>;

export const bonusDetailResponseSchema = z.object({
  company: companyIdentitySchema,
  state: z.enum(["published", "not_published"]),
  bonus: publicBonusSchema.nullable(),
}).strict();
export type BonusDetailResponse = z.infer<typeof bonusDetailResponseSchema>;

/** Admin upsert (ruling 1-3). `checkedAt` may not be in the future. */
export const adminBonusUpsertSchema = z.object({
  amountMinor: z.number().int().positive().max(10 ** 12),
  currency: currencySchema,
  upTo: z.boolean(),
  scopeNote: z.string().trim().max(120).nullable(),
  sourceUrl: z.string().url().max(2048),
  checkedAt: isoDateString.refine(value => Date.parse(value) <= Date.now(), "The checked date can't be in the future"),
}).strict();
export type AdminBonusUpsert = z.infer<typeof adminBonusUpsertSchema>;

/** The report a signed-in person files (ruling 7). */
export const bonusReportInputSchema = z.object({
  reason: z.enum(BONUS_REPORT_REASONS),
  note: z.string().trim().max(280).nullable(),
  suggestedSourceUrl: z.string().url().max(2048).refine(value => value.startsWith("https:"), "Use an https link").nullable(),
}).strict();
export type BonusReportInput = z.infer<typeof bonusReportInputSchema>;

/** Admin decision on a report (ruling 7). */
export const bonusReportDecisionSchema = z.object({ decision: z.enum(["fixed", "dismissed"]) }).strict();
export type BonusReportDecision = z.infer<typeof bonusReportDecisionSchema>;

/** The currency's own fraction digits: the minor-unit divisor (ruling 5). */
export function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Ruling 5: the employer's currency, no conversion, "Up to " when the figure is a ceiling. */
export function formatBonus(bonus: Pick<PublicBonus, "amountMinor" | "currency" | "upTo">): string {
  const digits = currencyFractionDigits(bonus.currency);
  const divisor = 10 ** digits;
  const major = bonus.amountMinor / divisor;
  const locale = bonus.currency === "INR" ? "en-IN" : "en-US";
  const wholeMajor = bonus.amountMinor % divisor === 0;
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: bonus.currency,
    ...(wholeMajor ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
  }).format(major);
  return bonus.upTo ? `Up to ${formatted}` : formatted;
}

/** Ruling 4: computed in the app, never with MySQL `NOW()`. */
export function isFresh(checkedAt: string | Date, now: Date = new Date()): boolean {
  const checked = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  if (Number.isNaN(checked.getTime())) return false;
  return now.getTime() - checked.getTime() <= BONUS_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}

/** Ruling 2: https only, no credentials, no port, and the host is one of the company's own domains. */
export function sourceHostAllowed(sourceUrl: string, domains: readonly string[]): boolean {
  let parsed: URL;
  try { parsed = new URL(sourceUrl); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  return domains.some(domain => {
    const owned = domain.trim().toLowerCase();
    return owned.length > 0 && (host === owned || host.endsWith(`.${owned}`));
  });
}

/** The host a public payload shows next to the figure. */
export function sourceHostOf(sourceUrl: string): string {
  try { return new URL(sourceUrl).hostname.toLowerCase(); } catch { return ""; }
}
