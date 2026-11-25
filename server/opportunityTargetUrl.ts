import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { getDomain } from "tldts";
import { isHostedJobPlatform } from "./employerRouting";
import { fetchPublicJobLink, isPublicAddress } from "./jobLinkPreview";
import { completeTargetRoleUrl } from "../shared/referralUrl";

const MAX_URL_LENGTH = 2048;
function bracketless(input: string) { return input.replace(/^\[|\]$/g, ""); }
function canonical(input: string) {
  if (!input || input.length > MAX_URL_LENGTH) throw new Error("Use a public HTTPS job link under 2,048 characters");
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Paste the public link to the job posting"); }
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
async function resolveAddresses(hostname: string) {
  // A resolver failure has to surface as the link rule: without this a mistyped
  // host reaches the member as `getaddrinfo ENOTFOUND ...`.
  try { return (await lookup(hostname, { all: true, verbatim: true })).map(row => row.address); }
  catch { throw new Error("Opportunity links must use a public internet host"); }
}
async function requirePublicHost(url: URL) {
  const hostname = bracketless(url.hostname);
  const addresses = ipaddr.isValid(hostname) ? [hostname] : await resolveAddresses(hostname);
  if (!addresses.length || addresses.some(address => !isPublicAddress(address))) throw new Error("Opportunity links must use a public internet host");
}
export function isLegacyOpportunityUrlSafe(input: string, companyDomain: string) {
  try {
    const url = canonical(input);
    if (ipaddr.isValid(bracketless(url.hostname))) return false;
    if (isHostedJobPlatform(url.hostname)) return true;
    return getDomain(url.hostname, { allowPrivateDomains: false, detectIp: true }) === companyDomain.trim().toLowerCase();
  } catch { return false; }
}
/**
 * What the referrer typed, made complete before the strict checks: "https://"
 * is added when it was left off (owner, Nov 19 2026: fix it, never error).
 * Every check below still runs on the result, and an explicit "http://" link
 * is still refused, so nothing unsafe gets through.
 */
function completedOpportunityInput(input: string) {
  return completeTargetRoleUrl(input).trim();
}
export async function validateOpportunityTargetUrl(input: string, companyDomain: string, resolveEmployer: (url: string) => Promise<string | undefined>, fetcher = fetchPublicJobLink) {
  const expected = companyDomain.trim().toLowerCase();
  if (!input || input.length > MAX_URL_LENGTH) throw new Error("Use a public HTTPS job link under 2,048 characters");
  let url = canonical(completedOpportunityInput(input));
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
