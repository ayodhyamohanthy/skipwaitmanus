import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { getDomain } from "tldts";
import { isHostedJobPlatform } from "./employerRouting";
import { fetchPublicJobLink } from "./jobLinkPreview";

const MAX_URL_LENGTH = 2048;
const blockedRanges = new Set(["unspecified","broadcast","multicast","linkLocal","loopback","private","uniqueLocal","carrierGradeNat","reserved"]);
function publicIp(address: string) { try { return !blockedRanges.has(ipaddr.parse(address).range()); } catch { return false; } }
function canonical(input: string) {
  if (!input || input.length > MAX_URL_LENGTH) throw new Error("Use a public HTTPS job link under 2,048 characters");
  const url = new URL(input.trim());
  if (url.protocol !== "https:") throw new Error("Opportunity links must use HTTPS");
  if (url.username || url.password) throw new Error("Opportunity links cannot include credentials");
  if (url.port && url.port !== "443") throw new Error("Opportunity links cannot use a custom port");
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.toString().length > MAX_URL_LENGTH) throw new Error("Use a public HTTPS job link under 2,048 characters");
  return url;
}
async function requirePublicHost(url: URL) {
  const literal = ipaddr.isValid(url.hostname) ? [url.hostname] : (await lookup(url.hostname, { all: true, verbatim: true })).map(row => row.address);
  if (!literal.length || literal.some(address => !publicIp(address))) throw new Error("Opportunity links must use a public internet host");
}
export function isLegacyOpportunityUrlSafe(input: string, companyDomain: string) {
  try {
    const url = canonical(input);
    if (ipaddr.isValid(url.hostname)) return false;
    if (isHostedJobPlatform(url.hostname)) return true;
    return getDomain(url.hostname, { allowPrivateDomains: false, detectIp: true }) === companyDomain.trim().toLowerCase();
  } catch { return false; }
}
export async function validateOpportunityTargetUrl(input: string, companyDomain: string, resolveEmployer: (url: string) => Promise<string | undefined>, fetcher = fetchPublicJobLink) {
  const expected = companyDomain.trim().toLowerCase();
  let url = canonical(input);
  await requirePublicHost(url);
  const hosted = isHostedJobPlatform(url.hostname);
  if (!hosted) {
    if (getDomain(url.hostname, { allowPrivateDomains: false, detectIp: true }) !== expected) throw new Error("The job link must belong to your verified company");
    const fetched = await fetcher(url.toString());
    url = canonical(fetched.canonicalUrl);
    await requirePublicHost(url);
    if (getDomain(url.hostname, { allowPrivateDomains: false, detectIp: true }) !== expected) throw new Error("The job link redirected outside your verified company");
  }
  const resolved = await resolveEmployer(url.toString());
  if (resolved?.trim().toLowerCase() !== expected) throw new Error(hosted ? "This hosted job link could not be matched exactly to your verified company" : "The job link must belong to your verified company");
  return url.toString();
}
