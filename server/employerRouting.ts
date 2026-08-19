import { reviewedEmployerFromTargetRoleUrl } from "../shared/referralUrl";

const hostedJobPlatforms = [
  "linkedin.com", "indeed.com", "glassdoor.com", "greenhouse.io", "lever.co", "ashbyhq.com",
  "workable.com", "smartrecruiters.com", "jobvite.com", "teamtailor.com", "bamboohr.com",
  "myworkdayjobs.com", "icims.com", "rippling.com", "recruitee.com", "breezy.hr",
  "monster.com", "ziprecruiter.com", "naukri.com", "shine.com", "foundit.in", "wellfound.com",
  "dice.com", "simplyhired.com", "talent.com", "jooble.org", "flexjobs.com", "jobstreet.com",
  "stepstone.com", "seek.com.au", "bayt.com", "adzuna.com", "lensa.com", "careerbuilder.com",
  "snagajob.com", "cutshort.io", "instahyre.com", "hirist.com", "timesjobs.com",
];

const legalSuffixes = /\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co|plc|gmbh|pte|private)\b/gi;

function normalizedHost(value: string) { return value.trim().toLowerCase().replace(/^www\./, ""); }
function isHostOrSubdomain(hostname: string, domain: string) { return hostname === domain || hostname.endsWith(`.${domain}`); }

export function normalizedEmployerKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(legalSuffixes, " ").replace(/[^a-z0-9]/g, "").trim();
}

export function isHostedJobPlatform(hostname: string) {
  const host = normalizedHost(hostname);
  return hostedJobPlatforms.some(platform => isHostOrSubdomain(host, platform));
}

export function directEmployerDomainFromTargetUrl(targetRoleUrl: string): string | undefined {
  try {
    const hostname = normalizedHost(new URL(targetRoleUrl).hostname);
    if (!hostname || isHostedJobPlatform(hostname)) return undefined;
    const labels = hostname.split(".");
    return labels.length > 2 ? labels.slice(-2).join(".") : hostname;
  } catch {
    return undefined;
  }
}

export function verifiedEmployerDomainFromProtectedHostedListing(targetRoleUrl: string) {
  return reviewedEmployerFromTargetRoleUrl(targetRoleUrl)?.domain;
}

function cleanHandle(value: string | undefined) {
  const decoded = value ? decodeURIComponent(value).trim() : "";
  return decoded && /^[a-z0-9][a-z0-9._-]{1,100}$/i.test(decoded) ? decoded : undefined;
}

export function hostedEmployerCandidatesFromTargetUrl(targetRoleUrl: string) {
  try {
    const url = new URL(targetRoleUrl);
    const host = normalizedHost(url.hostname);
    const segments = url.pathname.split("/").filter(Boolean);
    const first = cleanHandle(segments[0]);
    const subdomain = host.split(".")[0];
    const candidates: string[] = [];

    if (isHostOrSubdomain(host, "lever.co") || isHostOrSubdomain(host, "greenhouse.io") || isHostOrSubdomain(host, "ashbyhq.com") || isHostOrSubdomain(host, "workable.com") || isHostOrSubdomain(host, "smartrecruiters.com") || isHostOrSubdomain(host, "jobvite.com") || isHostOrSubdomain(host, "recruitee.com") || isHostOrSubdomain(host, "breezy.hr")) {
      if (first) candidates.push(first);
    }
    if (isHostOrSubdomain(host, "teamtailor.com") || isHostOrSubdomain(host, "bamboohr.com") || isHostOrSubdomain(host, "myworkdayjobs.com")) {
      if (subdomain && !["jobs", "www", "careers", "wd1", "wd3", "wd5"].includes(subdomain)) candidates.push(subdomain);
    }
    if (isHostOrSubdomain(host, "icims.com") && first && first !== "jobs") candidates.push(first);
    return Array.from(new Set(candidates.map(normalizedEmployerKey).filter(Boolean)));
  } catch {
    return [];
  }
}

function entityDecode(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&nbsp;/gi, " ");
}

function valuesFromHtmlPattern(html: string, pattern: RegExp) {
  return Array.from(html.matchAll(pattern)).map(match => entityDecode(match[1] ?? "").replace(/\\u0026/g, "&").trim()).filter(value => value.length > 1 && value.length < 160);
}

function employerCandidatesFromPageTitle(title: string) {
  const atMatch = title.match(/\bat\s+([^|–-]{2,120})/i)?.[1];
  if (atMatch) return [atMatch];
  const parts = title.split(/[|–-]/).map(part => part.trim()).filter(Boolean);
  return parts.length >= 3 ? [parts[1]] : [];
}

type EmployerEvidence = { candidates: string[]; officialDomains: string[] };

function structuredHiringOrganizations(value: unknown, organizations: Array<Record<string, unknown>>) {
  if (Array.isArray(value)) {
    value.forEach(item => structuredHiringOrganizations(item, organizations));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const hiringOrganization = record.hiringOrganization;
  if (hiringOrganization && typeof hiringOrganization === "object" && !Array.isArray(hiringOrganization)) organizations.push(hiringOrganization as Record<string, unknown>);
  Object.values(record).forEach(item => structuredHiringOrganizations(item, organizations));
}

function employerEvidenceFromStructuredData(html: string): EmployerEvidence {
  const organizations: Array<Record<string, unknown>> = [];
  const structuredScripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi))
    .map(match => entityDecode(match[1] ?? "").trim())
    .filter(raw => raw.length > 1 && raw.length <= 256_000);
  for (const raw of structuredScripts) {
    try { structuredHiringOrganizations(JSON.parse(raw), organizations); } catch { /* Ignore malformed third-party structured data. */ }
  }
  const candidates: string[] = [];
  const officialDomains: string[] = [];
  for (const organization of organizations) {
    const name = typeof organization.name === "string" ? organization.name : undefined;
    const candidate = name ? normalizedEmployerKey(name) : undefined;
    if (!candidate) continue;
    candidates.push(candidate);
    const urls = [organization.sameAs, organization.url].flatMap(value => Array.isArray(value) ? value : [value]);
    for (const officialUrl of urls) {
      if (typeof officialUrl !== "string") continue;
      const domain = directEmployerDomainFromTargetUrl(officialUrl);
      const domainKey = domain ? normalizedEmployerKey(domain.split(".")[0] ?? "") : undefined;
      if (domain && domainKey === candidate) officialDomains.push(domain);
    }
  }
  return { candidates: Array.from(new Set(candidates)), officialDomains: Array.from(new Set(officialDomains)) };
}

export function employerCandidatesFromJobPageHtml(html: string) {
  const structuredEvidence = employerEvidenceFromStructuredData(html);
  const candidates = [
    ...structuredEvidence.candidates,
    ...valuesFromHtmlPattern(html, /"hiringOrganization"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/gi),
    ...valuesFromHtmlPattern(html, /"(?:companyName|employerName|company_name)"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/gi),
    ...valuesFromHtmlPattern(html, /class=["'][^"']*topcard__org-name-link[^"']*["'][^>]*>\s*([^<]{2,160})</gi),
    ...valuesFromHtmlPattern(html, /<title[^>]*>\s*([^<]{2,200})\s*<\/title>/gi).flatMap(employerCandidatesFromPageTitle),
    ...valuesFromHtmlPattern(html, /(?:data-test|data-testid)=["'][^"']*(?:company|employer)[^"']*["'][^>]*>\s*([^<]{2,160})</gi),
    ...valuesFromHtmlPattern(html, /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["'][^>]*>/gi).flatMap(employerCandidatesFromPageTitle),
    ...valuesFromHtmlPattern(html, /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*>/gi).flatMap(employerCandidatesFromPageTitle),
  ];
  return Array.from(new Set(candidates.map(normalizedEmployerKey).filter(value => value.length > 1)));
}

export function officialEmployerDomainsFromJobPageHtml(html: string) {
  return employerEvidenceFromStructuredData(html).officialDomains;
}

export function publicEmployerPageUrls(targetRoleUrl: string) {
  try {
    const url = new URL(targetRoleUrl);
    const host = normalizedHost(url.hostname);
    const linkedInJobId = isHostOrSubdomain(host, "linkedin.com") ? url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1] : undefined;
    if (linkedInJobId) return [`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${linkedInJobId}`];
    return [url.toString()];
  } catch {
    return [];
  }
}

export function verifiedEmployerDomainFromCandidates(candidates: string[], verifiedDomains: Array<string | null | undefined>) {
  const matches = new Set<string>();
  for (const domain of verifiedDomains) {
    if (!domain) continue;
    const normalized = normalizedHost(domain);
    const domainKey = normalizedEmployerKey(normalized.split(".")[0] ?? "");
    if (domainKey && candidates.includes(domainKey)) matches.add(normalized);
  }
  return matches.size === 1 ? Array.from(matches)[0] : undefined;
}
