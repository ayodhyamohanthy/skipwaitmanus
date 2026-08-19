const hostedJobPlatforms = [
  "linkedin.com", "indeed.com", "glassdoor.com", "greenhouse.io", "lever.co", "ashbyhq.com",
  "workable.com", "smartrecruiters.com", "jobvite.com", "teamtailor.com", "bamboohr.com",
  "myworkdayjobs.com", "icims.com", "rippling.com", "recruitee.com", "breezy.hr",
  "monster.com", "ziprecruiter.com", "naukri.com", "shine.com", "foundit.in", "wellfound.com",
  "dice.com", "simplyhired.com", "talent.com", "jooble.org", "flexjobs.com", "jobstreet.com",
  "stepstone.com", "seek.com.au", "bayt.com", "adzuna.com", "lensa.com", "careerbuilder.com",
  "snagajob.com", "cutshort.io", "instahyre.com", "hirist.com", "timesjobs.com",
];

// Only add an entry after manually verifying the public listing and the employer's official domain.
// This protects known Cloudflare-blocked listings without ever treating Wellfound itself as the employer.
const verifiedProtectedHostedListings = new Map<string, string>([
  ["wellfound.com/jobs/3971835-account-executive", "chatfin.ai"],
]);

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
  try {
    const url = new URL(targetRoleUrl);
    return verifiedProtectedHostedListings.get(`${normalizedHost(url.hostname)}${url.pathname.replace(/\/$/, "")}`);
  } catch {
    return undefined;
  }
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

export function employerCandidatesFromJobPageHtml(html: string) {
  const candidates = [
    ...valuesFromHtmlPattern(html, /"hiringOrganization"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/gi),
    ...valuesFromHtmlPattern(html, /"(?:companyName|employerName|company_name)"\s*:\s*"([^"\\]+(?:\\.[^"\\]*)*)"/gi),
    ...valuesFromHtmlPattern(html, /(?:data-test|data-testid)=["'][^"']*(?:company|employer)[^"']*["'][^>]*>\s*([^<]{2,160})</gi),
    ...valuesFromHtmlPattern(html, /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["'][^>]*>/gi).flatMap(employerCandidatesFromPageTitle),
    ...valuesFromHtmlPattern(html, /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*>/gi).flatMap(employerCandidatesFromPageTitle),
  ];
  return Array.from(new Set(candidates.map(normalizedEmployerKey).filter(value => value.length > 1)));
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
