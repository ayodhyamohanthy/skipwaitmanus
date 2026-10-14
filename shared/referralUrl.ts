export const TARGET_ROLE_URL_ERROR = "Paste a complete job link that starts with http:// or https://.";

export type ReviewedEmployer = { name: string; domain: string };

const reviewedEmployerLinks = new Map<string, ReviewedEmployer>([
  ["wellfound.com/jobs/3971835-account-executive", { name: "ChatFin", domain: "chatfin.ai" }],
  ["wellfound.com/jobs/4220336-senior-product-designer", { name: "Check", domain: "checkhq.com" }],
  ["linkedin.com/jobs/view/4446365088", { name: "Ethos", domain: "ethos.com" }],
  ["linkedin.com/jobs/view/4448866119", { name: "Rubrik", domain: "rubrik.com" }],
  ["linkedin.com/jobs/view/4389299303", { name: "MakeMyTrip", domain: "makemytrip.com" }],
]);

export function isValidTargetRoleUrl(value: string | undefined | null) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeTargetRoleUrl(value: string) {
  try {
    const url = new URL(value.trim());
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
];

/**
 * Pre-check for a company page: the link must sit on one of the company's own
 * domains or on a hosted job board. The server still resolves the real employer.
 */
export function jobLinkFitsCompany(value: string, companyDomains: readonly string[]): boolean {
  let host: string;
  try { host = new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, ""); } catch { return false; }
  const on = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  return companyDomains.some(domain => on(domain.trim().toLowerCase())) || HOSTED_JOB_PLATFORMS.some(on);
}
