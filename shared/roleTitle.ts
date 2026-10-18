import { PLACEHOLDER_JOB_TITLE } from "./jobFunctionClassifier";
import { displayJobFunction, type JobFunction } from "./jobFunctions";

/**
 * Every company ask stores the placeholder job title (PLACEHOLDER_JOB_TITLE), so screens that name an ask by its
 * role read a title from the job link's path when it has one ("/careers/senior-data-analyst" → "Senior Data
 * Analyst"). The link is already visible to the referrer before acceptance, so this reveals nothing new. A path
 * with no readable words (ids, uuids, query-only links) gives null and the caller falls back.
 */
const GENERIC_SEGMENTS = new Set([
  "jobs", "job", "careers", "career", "apply", "application", "posting", "postings", "details", "detail", "view", "en", "en-us", "en-gb", "en-in",
  "external", "opening", "openings", "position", "positions", "vacancy", "vacancies", "role", "roles", "listing", "listings", "job-listings",
  "search", "global", "us", "in", "uk", "o", "p", "j", "lever", "greenhouse", "workday", "jobdetail", "job-detail", "jobdetails", "job-details",
]);
const ACRONYMS = new Set(["ui", "ux", "qa", "sre", "ml", "ai", "api", "ios", "sdet", "sde", "hr", "vp", "cto", "ceo", "cfo", "coo", "cmo", "ii", "iii", "iv", "gtm", "b2b", "b2c", "saas", "it", "bi", "crm", "erp", "seo", "sem", "pm", "l1", "l2", "l3", "aws", "gcp", "ar", "ap", "fp&a", "nlp", "llm", "r&d", "hrbp", "eu", "apac", "emea", "kyc", "aml"]);
const MINOR = new Set(["and", "or", "of", "for", "the", "a", "an", "to", "in", "on", "with", "at"]);
const ID_TOKEN = /^(?:\d+|[a-f0-9]{6,}|r\d{3,}|jr\d+|req\d*|job\d+|[a-z]{0,3}\d{4,}[a-z0-9]*)$/i;

function words(segment: string): string[] | null {
  let text = segment.toLowerCase().replace(/\.(?:html?|aspx?|php|jsp)$/, "").replace(/[_+]|%20/g, "-");
  text = text.replace(/\b\d+-to-\d+-years?\b/g, " ").replace(/^job-listings-/, "");
  let tokens = text.split(/[-\s]+/).filter(Boolean).filter(token => !ID_TOKEN.test(token));
  const at = tokens.lastIndexOf("at");
  if (at > 1 && tokens.length - at <= 4) tokens = tokens.slice(0, at);
  if (tokens.length < 2 || tokens.length > 8) return null;
  if (!tokens.every(token => /^[a-z][a-z&]*$/.test(token) || ACRONYMS.has(token))) return null;
  if (tokens.every(token => GENERIC_SEGMENTS.has(token) || MINOR.has(token))) return null;
  return tokens;
}

function titleCase(tokens: readonly string[]): string {
  return tokens.map((token, index) => (ACRONYMS.has(token) ? token.toUpperCase() : index > 0 && MINOR.has(token) ? token : token[0].toUpperCase() + token.slice(1))).join(" ");
}

/** A readable role title from a job link's path, or null. */
export function roleTitleFromUrl(targetRoleUrl: string | null | undefined): string | null {
  if (!targetRoleUrl) return null;
  let path: string;
  try { path = new URL(targetRoleUrl).pathname; } catch { return null; }
  let segments: string[];
  try { segments = path.split("/").map(segment => decodeURIComponent(segment)); } catch { segments = path.split("/"); }
  for (const segment of segments.filter(Boolean).reverse()) {
    if (GENERIC_SEGMENTS.has(segment.toLowerCase())) continue;
    const found = words(segment);
    if (found) {
      const title = titleCase(found);
      return title.length <= 70 ? title : null;
    }
  }
  return null;
}

/** What to call an ask's role: a real title, else one read from the link, else "{Function} role", else the placeholder. */
export function displayRoleTitle(input: { title?: string | null; targetRoleUrl?: string | null; jobFunction?: JobFunction | null }): string {
  const stored = input.title?.trim();
  if (stored && stored !== PLACEHOLDER_JOB_TITLE) return stored;
  const fromUrl = roleTitleFromUrl(input.targetRoleUrl);
  if (fromUrl) return fromUrl;
  const fn = displayJobFunction(input.jobFunction ?? null);
  return fn ? `${fn} role` : PLACEHOLDER_JOB_TITLE;
}

/** The link as people read it: host and path without the scheme, "www." or a trailing slash. */
export function displayJobLink(targetRoleUrl: string | null | undefined): string | null {
  if (!targetRoleUrl) return null;
  try {
    const url = new URL(targetRoleUrl);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}
