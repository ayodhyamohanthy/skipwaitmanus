// Job function taxonomy (kit v4): the one list of functions (teams) used by
// asks (jobs.jobFunction), referrer job areas (profiles.preferAreas), the
// thread and queue eyebrows ("DESIGN · WIPRO") and, in later waves, saved
// alerts, function-scoped routing and employer "asks by function".
//
// The list is the kit's (app/src/routes/referrer-setup.tsx) plus "Other", an
// explicit seeker choice for roles outside it. Stored values are VARCHAR, so
// every read parses with parseJobFunction and unknown values become null.
import { z } from "zod";

export const JOB_FUNCTIONS = ["Engineering", "Product", "Design", "Data", "Marketing", "Operations", "Sales", "Finance", "HR", "Other"] as const;
export type JobFunction = (typeof JOB_FUNCTIONS)[number];
export const jobFunctionSchema = z.enum(JOB_FUNCTIONS);

/** Areas a referrer can assess (kit /referrer-setup chips): every function except "Other". */
export const REFERRER_AREAS = ["Engineering", "Product", "Design", "Data", "Marketing", "Operations", "Sales", "Finance", "HR"] as const satisfies readonly JobFunction[];
export type ReferrerArea = (typeof REFERRER_AREAS)[number];
export const referrerAreaSchema = z.enum(REFERRER_AREAS);

/** Seniority levels a referrer can assess (kit /referrer-setup levels step). */
export const JOB_LEVELS = ["Intern", "Early career", "Mid-level", "Senior", "Lead+"] as const;
export type JobLevel = (typeof JOB_LEVELS)[number];
export const jobLevelSchema = z.enum(JOB_LEVELS);

/**
 * How a stored jobFunction was decided. "seeker": picked in the composer.
 * "inferred": the deterministic classifier at ask creation. "backfill": the
 * reviewed backfill script on a row created before the column existed. A NULL
 * source marks a row nothing has examined yet; later routing must treat any
 * value that is not "seeker" as a hint, never as a reason to exclude.
 */
export const JOB_FUNCTION_SOURCES = ["seeker", "inferred", "backfill"] as const;
export type JobFunctionSource = (typeof JOB_FUNCTION_SOURCES)[number];

/** Optional explicit choice on POST /api/company-referrals: a listed function, or absent/null to infer. */
export const askJobFunctionInputSchema = jobFunctionSchema.nullish();

/** Referrer preference lists on PUT /api/referrer-preferences: listed values only, each once. */
const uniqueList = <T extends string>(schema: z.ZodType<T>, max: number, noun: string) =>
  z.array(schema, { error: `Choose ${noun} from the list` }).max(max, `Choose up to ${max} ${noun}`)
    .refine(list => new Set(list).size === list.length, `List each of your ${noun} once`);
export const referrerAreasInputSchema = uniqueList(referrerAreaSchema, REFERRER_AREAS.length, "job areas");
export const referrerLevelsInputSchema = uniqueList(jobLevelSchema, JOB_LEVELS.length, "levels");

/** Lenient read of a stored or received value: a listed function, otherwise null. */
export function parseJobFunction(raw: string | null | undefined): JobFunction | null {
  const parsed = jobFunctionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Keeps only listed referrer areas, in order, once each (stored JSON may predate validation). */
export function parseReferrerAreas(values: readonly string[]): ReferrerArea[] {
  const known = new Set<string>(REFERRER_AREAS);
  return values.filter((value, index): value is ReferrerArea => known.has(value) && values.indexOf(value) === index);
}

/** Payload field on request, inbox, thread and queue rows: unknown strings read as null. */
export const jobFunctionFieldSchema = z.string().nullish().transform(value => parseJobFunction(value));

/** Response rows always carry `jobFunction`, normalized to a listed value or null. */
export function withParsedJobFunction<T extends object>(row: T): T & { jobFunction: JobFunction | null } {
  const raw = "jobFunction" in row ? row.jobFunction : null;
  return { ...row, jobFunction: parseJobFunction(typeof raw === "string" ? raw : null) };
}

/**
 * Eyebrow text for a request: "Design · Wipro" (the eyebrow style uppercases
 * it). "Other" and unknown functions show the company alone.
 */
export function functionEyebrow(jobFunction: JobFunction | null | undefined, company: string): string {
  return jobFunction && jobFunction !== "Other" ? `${jobFunction} · ${company}` : company;
}
