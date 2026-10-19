// Deterministic job-title -> function classifier. Pure and shared, so the /ask
// composer shows exactly what the server stores (jobs.jobFunctionSource =
// "inferred") and the backfill script reproduces it on older rows.
//
// Matching: the text is lowercased, accents and punctuation become spaces,
// and each rule phrase must appear as whole words. Rules are ordered and the
// first rule that matches wins: cross-function phrases ("product designer",
// "people operations") come before the generic words they contain ("product",
// "operations"). No match -> null. The classifier never returns "Other"; that
// is an explicit seeker choice. A guess never blocks an ask.
import type { JobFunction } from "./jobFunctions";

export type InferredJobFunction = Exclude<JobFunction, "Other">;
type Rule = readonly [phrase: string, jobFunction: InferredJobFunction];

const rules = (jobFunction: InferredJobFunction, ...phrases: string[]): Rule[] => phrases.map(phrase => [phrase, jobFunction] as const);

export const JOB_FUNCTION_RULES: readonly Rule[] = [
  // Hardware and chip "design" is engineering.
  ...rules("Engineering", "design engineer", "design verification", "physical design", "hardware design", "rtl design", "asic", "fpga", "system administrator", "systems administrator", "sysadmin", "database administrator", "security engineer", "security analyst", "cybersecurity", "cyber security", "infosec"),
  ...rules("Design", "product designer", "product design", "ux designer", "ui designer", "ux ui", "ui ux", "ux researcher", "ux research", "user researcher", "user research", "interaction designer", "visual designer", "graphic designer", "brand designer", "motion designer", "service designer", "content designer", "design lead", "design manager", "head of design", "creative director", "art director"),
  ...rules("Marketing", "product marketing", "growth marketing", "content marketing", "digital marketing", "performance marketing", "brand manager", "social media", "public relations", "demand generation", "content writer", "content strategist", "copywriter"),
  ...rules("Data", "product analyst", "data engineer", "data engineering", "data architect", "data scientist", "data science", "data analyst", "data analytics", "analytics engineer", "business intelligence", "bi analyst", "bi developer", "bi engineer", "machine learning", "ml engineer", "ml scientist", "mlops", "deep learning", "computer vision", "nlp", "research scientist", "applied scientist", "statistician", "quantitative analyst", "quant"),
  ...rules("Sales", "sales engineer", "presales", "pre sales", "solutions consultant", "account executive", "account manager", "business development", "customer success", "inside sales", "sales development", "partnerships", "bdr", "sdr"),
  ...rules("HR", "people operations", "people partner", "talent acquisition", "talent partner", "human resources", "hr business partner", "hrbp", "recruiter", "recruiting", "recruitment"),
  ...rules("Finance", "financial analyst", "finance analyst", "fp a", "accounts payable", "accounts receivable", "chartered accountant", "accountant", "accounting", "treasury", "auditor", "audit", "tax"),
  ...rules("Operations", "customer support", "customer service", "technical support", "it support", "help desk", "helpdesk", "data entry", "supply chain", "project manager", "office manager", "executive assistant", "administrative assistant"),
  ...rules("Product", "product manager", "product owner", "product lead", "head of product", "product management", "product director", "director of product", "vp product", "vp of product", "group product"),
  ...rules("Engineering", "software engineer", "software developer", "software development", "engineering manager", "site reliability", "devops", "dev ops", "sre", "sdet", "qa engineer", "test engineer", "quality engineer", "test automation", "cloud engineer", "platform engineer", "backend", "back end", "frontend", "front end", "full stack", "fullstack", "mobile developer", "ios developer", "android developer", "web developer", "firmware", "embedded", "solutions architect", "solution architect", "technical architect", "tech lead"),
  // Generic words, most specific team first; "operations" comes last so
  // "Sales Operations" and "HR Operations" stay with their team.
  ...rules("Engineering", "engineer", "engineering", "developer", "programmer", "architect", "qa", "tester"),
  ...rules("Data", "data", "analytics", "analyst"),
  ...rules("Design", "designer", "design", "ux", "ui", "creative"),
  ...rules("Product", "product"),
  ...rules("Marketing", "marketing", "marketer", "brand", "seo", "sem", "growth", "communications"),
  ...rules("Sales", "sales", "salesperson"),
  ...rules("Finance", "finance", "financial"),
  ...rules("HR", "hr", "people", "talent"),
  ...rules("Operations", "operations", "ops", "logistics", "procurement"),
];

/** Lowercase ASCII words separated by single spaces ("UX/UI Designer" -> "ux ui designer"). */
export function normalizeClassifierText(text: string): string {
  return text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The function a job title (or any role text) names, or null when nothing matches. */
export function classifyJobFunction(text: string | null | undefined): InferredJobFunction | null {
  if (!text) return null;
  const padded = ` ${normalizeClassifierText(text)} `;
  if (padded.trim() === "") return null;
  for (const [phrase, jobFunction] of JOB_FUNCTION_RULES) if (padded.includes(` ${phrase} `)) return jobFunction;
  return null;
}

/** jobs.title written for asks created from a job link; it names no role. */
export const PLACEHOLDER_JOB_TITLE = "Role from shared job link";

// Hosted job boards whose leading path segments are the employer's handle
// (boards.greenhouse.io/<company>/jobs/123), not the role.
const HANDLE_SEGMENTS: ReadonlyArray<readonly [domain: string, segments: number]> = [
  ["greenhouse.io", 1], ["lever.co", 1], ["ashbyhq.com", 1], ["workable.com", 1], ["smartrecruiters.com", 1], ["jobvite.com", 1], ["wellfound.com", 2],
];
const isHostOrSubdomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * Role words in a job link's path ("/job/senior-product-designer-123" ->
 * "job senior product designer 123"). Host, query and fragment are ignored;
 * a LinkedIn "<title>-at-<company>-<id>" slug keeps only the title part.
 */
export function jobLinkRoleText(targetRoleUrl: string | null | undefined): string {
  if (!targetRoleUrl) return "";
  let url: URL;
  try { url = new URL(targetRoleUrl); } catch { return ""; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const skip = HANDLE_SEGMENTS.find(([domain]) => isHostOrSubdomain(host, domain))?.[1] ?? 0;
  const segments = url.pathname.split("/").filter(Boolean).slice(skip).map(segment => {
    try { return decodeURIComponent(segment.replace(/\+/g, " ")); } catch { return segment; }
  });
  const text = normalizeClassifierText(segments.join(" "));
  if (!isHostOrSubdomain(host, "linkedin.com")) return text;
  const at = ` ${text} `.lastIndexOf(" at ");
  return at > 0 ? text.slice(0, at - 1).trim() : text;
}

/** The function an ask's role names: a real job title first, then the job link's path. */
export function inferAskJobFunction(input: { title?: string | null; targetRoleUrl?: string | null }): InferredJobFunction | null {
  const title = input.title?.trim() && input.title.trim() !== PLACEHOLDER_JOB_TITLE ? input.title : null;
  return classifyJobFunction(title) ?? classifyJobFunction(jobLinkRoleText(input.targetRoleUrl));
}

/** The stored pair for a new ask: the seeker's explicit choice wins, otherwise the classifier's guess (possibly null). */
export function resolveAskJobFunction(input: { explicit?: JobFunction | null; targetRoleUrl: string }): { jobFunction: JobFunction | null; source: "seeker" | "inferred" } {
  if (input.explicit) return { jobFunction: input.explicit, source: "seeker" };
  return { jobFunction: inferAskJobFunction({ targetRoleUrl: input.targetRoleUrl }), source: "inferred" };
}
