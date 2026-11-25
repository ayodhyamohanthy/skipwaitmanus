// Shown only when the field holds something that cannot be a link at all (for
// example "product designer at Acme"). A link without "https://" is never an
// error: completeTargetRoleUrl adds it (owner, Nov 19 2026).
export const TARGET_ROLE_URL_ERROR = "That doesn't look like a job link yet. Copy the link from the job posting and paste it here.";

export type ReviewedEmployer = { name: string; domain: string };

const reviewedEmployerLinks = new Map<string, ReviewedEmployer>([
  ["wellfound.com/jobs/3971835-account-executive", { name: "ChatFin", domain: "chatfin.ai" }],
  ["wellfound.com/jobs/4220336-senior-product-designer", { name: "Check", domain: "checkhq.com" }],
  ["linkedin.com/jobs/view/4446365088", { name: "Ethos", domain: "ethos.com" }],
  ["linkedin.com/jobs/view/4448866119", { name: "Rubrik", domain: "rubrik.com" }],
  ["linkedin.com/jobs/view/4389299303", { name: "MakeMyTrip", domain: "makemytrip.com" }],
]);

// A bare host such as "careers.acme.com", "www.linkedin.com/jobs/view/123" or
// "acme.com:8443/jobs": dot-separated labels ending in a letters-only TLD,
// then an optional port, then a path, query, fragment or the end.
const BARE_HOST_LINK = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#]|$)/i;
const EMBEDDED_WEB_LINK = /https?:\/\/[^\s<>"'`]+/i;
const WRAPPING = /^[\s<>"'`({[]+|[\s<>"'`)}\]]+$/g;

function parsedWebUrl(candidate: string): URL | null {
  try {
    const url = new URL(candidate);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname ? url : null;
  } catch {
    return null;
  }
}

/**
 * Turns whatever a seeker pasted into a complete web link, so nobody is told to
 * retype "https://" (owner, Nov 19 2026: no error, fix it automatically).
 * Handles a bare host ("careers.acme.com/jobs/1" becomes "https://…"), a
 * protocol-relative "//host/…", wrapping quotes or angle brackets, and a link
 * pasted inside other text ("Apply here: https://…"). Anything it cannot turn
 * into an http(s) link (plain words, mailto:, javascript:) comes back
 * unchanged, so the result is always safe to put back in the field.
 */
export function completeTargetRoleUrl(value: string): string {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (parsedWebUrl(trimmed)) return trimmed;
  const embedded = trimmed.match(EMBEDDED_WEB_LINK)?.[0];
  if (embedded) {
    // Sentence punctuation after a pasted link is not part of it; a closing
    // bracket is kept only when the link opened one (Wikipedia-style paths).
    let link = embedded.replace(/[.,;:!?]+$/, "");
    while (/[)\]}]$/.test(link) && !/[([{]/.test(link)) link = link.slice(0, -1).replace(/[.,;:!?]+$/, "");
    if (parsedWebUrl(link)) return link;
  }
  const bare = trimmed.replace(/[.,;:!?]+$/, "").replace(WRAPPING, "").replace(/[.,;:!?]+$/, "");
  if (/\s/.test(bare)) {
    // Text around a "www." link without its scheme ("Apply here: www.acme.com/jobs/1").
    const www = bare.match(/(?:^|[\s(<"'`])(www\.[^\s<>"'`]+)/i)?.[1]?.replace(/[.,;:!?)\]}]+$/, "");
    const completed = www && BARE_HOST_LINK.test(www) ? `https://${www}` : null;
    return completed && parsedWebUrl(completed) ? completed : value;
  }
  const withScheme = bare.startsWith("//") ? `https:${bare}` : BARE_HOST_LINK.test(bare) ? `https://${bare}` : null;
  return withScheme && parsedWebUrl(withScheme) ? withScheme : value;
}

export function isValidTargetRoleUrl(value: string | undefined | null) {
  if (!value?.trim()) return false;
  return parsedWebUrl(completeTargetRoleUrl(value).trim()) !== null;
}

export function normalizeTargetRoleUrl(value: string) {
  try {
    const url = new URL(completeTargetRoleUrl(value).trim());
    url.hash = "";
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hostname = hostname;
    if (hostname === "wellfound.com" || hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
      if (hostname.endsWith(".linkedin.com")) url.hostname = "linkedin.com";
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
      if (url.hostname === "linkedin.com") {
        const jobId = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)$/)?.[1];
        if (jobId) url.pathname = `/jobs/view/${jobId}`;
      }
      url.search = "";
    }
    return url.toString();
  } catch {
    // Unparseable input: hand back the trimmed original so server callers fall
    // through to their friendly "could not identify the employer" validation
    // error instead of leaking a raw `Invalid URL` TypeError as a 500. Every
    // downstream resolver guards its own URL parsing, so this is safe.
    return value.trim();
  }
}

export function reviewedEmployerFromTargetRoleUrl(value: string): ReviewedEmployer | undefined {
  try {
    const url = new URL(normalizeTargetRoleUrl(value));
    return reviewedEmployerLinks.get(`${url.hostname}${url.pathname}`);
  } catch {
    return undefined;
  }
}

/** Job boards and applicant systems that host listings for many employers. */
export const HOSTED_JOB_PLATFORMS = [
  "linkedin.com", "indeed.com", "glassdoor.com", "greenhouse.io", "lever.co", "ashbyhq.com",
  "workable.com", "smartrecruiters.com", "jobvite.com", "teamtailor.com", "bamboohr.com",
  "myworkdayjobs.com", "icims.com", "rippling.com", "recruitee.com", "breezy.hr",
  "monster.com", "ziprecruiter.com", "naukri.com", "shine.com", "foundit.in", "wellfound.com",
  "dice.com", "simplyhired.com", "talent.com", "jooble.org", "flexjobs.com", "jobstreet.com",
  "stepstone.com", "seek.com.au", "bayt.com", "adzuna.com", "lensa.com", "careerbuilder.com",
  "snagajob.com", "cutshort.io", "instahyre.com", "hirist.com", "timesjobs.com",
  // Multi-tenant ATS hosts: "acme.keka.com" is Acme's job, never Keka's (D-012).
  // Host-specific entries where the parent domain is the vendor's own company.
  "keka.com", "darwinbox.in", "darwinbox.com", "zohorecruit.com", "zohorecruit.in", "zohorecruit.eu",
  "jobs.zoho.com", "taleo.net", "successfactors.com", "successfactors.eu", "sapsf.com", "sapsf.eu",
  "oraclecloud.com", "myworkdaysite.com", "freshteam.com",
];

/**
 * Pre-check for a company page: the link must sit on one of the company's own
 * domains or on a hosted job board. The server still resolves the real employer.
 */
export function jobLinkFitsCompany(value: string, companyDomains: readonly string[]): boolean {
  let host: string;
  try { host = new URL(completeTargetRoleUrl(value).trim()).hostname.toLowerCase().replace(/^www\./, ""); } catch { return false; }
  const on = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  return companyDomains.some(domain => on(domain.trim().toLowerCase())) || HOSTED_JOB_PLATFORMS.some(on);
}
