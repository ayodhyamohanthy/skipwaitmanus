import { Agent, fetch as undiciFetch } from "undici";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { normalizeTargetRoleUrl, reviewedEmployerFromTargetRoleUrl } from "../shared/referralUrl";
import { directEmployerDomainFromTargetUrl, isHostedJobPlatform } from "./employerRouting";
import { isValidTargetRoleUrl } from "../shared/referralUrl";
import { BoundedTtlCache } from "./boundedTtlCache";

export type EmployerConfidence = "verified"|"direct-domain"|"ambiguous"|"unreachable";
export type JobLinkPreview = { canonicalUrl:string; status:"fresh"|"unreachable"; employerConfidence:EmployerConfidence; companyDomain?:string; companyName?:string; roleTitle?:string; fetched?:boolean; reason:string; recoveryAction:string };
const cache=new BoundedTtlCache<string,JobLinkPreview>(5000);
const pending=new Map<string,Promise<JobLinkPreview>>();
export function resetJobLinkPreviewCache(){cache.clear();pending.clear()}
export function jobLinkPreviewCacheSize(){return cache.size}
const blockedRanges=new Set(["unspecified","broadcast","multicast","linkLocal","loopback","private","uniqueLocal","carrierGradeNat","reserved","rfc6052"]);
// ipaddr reports an IPv4 address written in IPv6 form (`::ffff:169.254.169.254`) as
// its own `ipv4Mapped` range, so classifying it directly admits loopback, private
// space, carrier-grade NAT, and the cloud metadata service. `URL.hostname` also
// brackets IPv6 literals, which `ipaddr.parse` does not accept.
export function isPublicAddress(address:string){try{const parsed=ipaddr.parse(address.replace(/^\[|\]$/g,""));const checked=parsed instanceof ipaddr.IPv6&&parsed.isIPv4MappedAddress()?parsed.toIPv4Address():parsed;return !blockedRanges.has(checked.range())}catch{return false}}
export async function pinnedDispatcher(hostname:string){const answers=await lookup(hostname,{all:true,verbatim:true});if(!answers.length||answers.some(a=>!isPublicAddress(a.address)))throw Error("unsafe_destination");const allowed=new Map(answers.map(a=>[a.address,a.family]));return new Agent({connect:{lookup:(_host,opts,cb)=>{const first=answers[0];if(!allowed.has(first.address))return cb(Error("dns_rebinding"),"",4);if((opts as {all?:boolean}).all)return cb(null,answers as never);cb(null,first.address,first.family)}}});}
const allowedHostedApi=(url:URL)=>
  (url.hostname==="www.linkedin.com"&&url.pathname.startsWith("/jobs-guest/jobs/api/jobPosting/")) ||
  ((url.hostname==="boards.greenhouse.io"||url.hostname==="job-boards.greenhouse.io") && /^\/[a-z0-9._-]+(?:\/|$)/i.test(url.pathname));
export async function fetchPublicJobLink(input:string){let current=new URL(input);for(let redirect=0;redirect<8;redirect++){if(!["http:","https:"].includes(current.protocol))throw Error("unsupported_protocol");if(isHostedJobPlatform(current.hostname)&&!allowedHostedApi(current))throw Error("hosted_redirect_blocked");const dispatcher=await pinnedDispatcher(current.hostname);const response=await undiciFetch(current,{dispatcher,redirect:"manual",signal:AbortSignal.timeout(5000),headers:{"user-agent":"skipwait.me job preview","accept":"text/html,application/xhtml+xml"}});if(response.status>=300&&response.status<400){const location=response.headers.get("location");if(!location)throw Error("bad_redirect");current=new URL(location,current);continue}if(!response.ok)throw Error("unreachable");const length=Number(response.headers.get("content-length")||0);if(length>512000){await response.body?.cancel();return {canonicalUrl:current.toString(),body:""}};const reader=response.body?.getReader();let total=0;const chunks:Uint8Array[]=[];while(reader){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>512000){await reader.cancel();return {canonicalUrl:current.toString(),body:""}}chunks.push(value)}return {canonicalUrl:current.toString(),body:Buffer.concat(chunks).toString("utf8")}}throw Error("redirect_limit")}
const ROLE_TITLE_LIMIT = 120;
const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    const code = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : lower.startsWith("#") ? Number.parseInt(lower.slice(1), 10) : undefined;
    if (code !== undefined) return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    return HTML_ENTITIES[lower] ?? whole;
  });
}
function cleanTitle(value: string) {
  return decodeHtmlEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function metaContent(tag: string, key: string): string | undefined {
  const attributes: Record<string, string> = {};
  for (const match of Array.from(tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g))) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  const name = (attributes.property ?? attributes.name ?? "").toLowerCase();
  return name === key ? attributes.content : undefined;
}
function jsonLdRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(item => jsonLdRecords(item));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...["@graph", "itemListElement", "mainEntity"].flatMap(key => (key in record ? jsonLdRecords(record[key]) : []))];
}
function jobPostingTitle(body: string): string | undefined {
  for (const match of Array.from(body.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))) {
    let parsed: unknown;
    try { parsed = JSON.parse(match[1]); } catch { continue; }
    for (const record of jsonLdRecords(parsed)) {
      const type = record["@type"];
      const isJobPosting = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      if (isJobPosting && typeof record.title === "string" && record.title.trim()) return record.title;
    }
  }
  return undefined;
}
/** The role title from a body already fetched, or undefined: JSON-LD JobPosting, og:title, <title>. Never a second request (D-094 item 2). */
export function extractRoleTitle(body: string, companyName?: string): string | undefined {
  const ogTitle = Array.from(body.matchAll(/<meta\b[^>]*>/gi)).map(tag => metaContent(tag[0], "og:title")).find(value => typeof value === "string" && value.trim());
  const documentTitle = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const raw = jobPostingTitle(body) ?? ogTitle ?? documentTitle;
  if (typeof raw !== "string") return undefined;
  const title = cleanTitle(raw).slice(0, ROLE_TITLE_LIMIT).trim();
  if (!title) return undefined;
  if (companyName && title.toLowerCase() === companyName.trim().toLowerCase()) return undefined;
  return title;
}
export async function previewJobLink(input:string,resolve:(url:string)=>Promise<string|undefined>,fetcher=fetchPublicJobLink):Promise<JobLinkPreview>{
  const canonicalUrl=normalizeTargetRoleUrl(input);if(!isValidTargetRoleUrl(canonicalUrl))throw Error("unsafe_cache_key");
  const hit=cache.get(canonicalUrl);if(hit)return hit;
  const active=pending.get(canonicalUrl);if(active)return active;
  const work=(async()=>{let reachable=true;let body:string|undefined;const direct=directEmployerDomainFromTargetUrl(canonicalUrl);const reviewed=reviewedEmployerFromTargetRoleUrl(canonicalUrl);const host=new URL(canonicalUrl).hostname;const publicGreenhouse=host==="boards.greenhouse.io"||host==="job-boards.greenhouse.io";const requestedBody=Boolean(direct||publicGreenhouse);if(requestedBody){try{body=(await fetcher(canonicalUrl)).body}catch{reachable=false}}else if(!reviewed){reachable=false}let domain:string|undefined;try{domain=await resolve(canonicalUrl)}catch{/* unresolved */}const roleTitle=body===undefined?undefined:extractRoleTitle(body,reviewed?.name);const trustedDomain=domain&&(reachable||reviewed)?domain:undefined;const value:JobLinkPreview=trustedDomain?{canonicalUrl,status:reachable?"fresh":"unreachable",employerConfidence:reviewed?"verified":"direct-domain",companyDomain:trustedDomain,...(reviewed?{companyName:reviewed.name}:{}),...(roleTitle?{roleTitle}:{}),fetched:requestedBody,reason:reachable?"Company identified from the job link.":"Company identified from a reviewed listing, but the job page could not be reached.",recoveryAction:reachable?"Continue to your resume.":"Check that the job is still open."}:{canonicalUrl,status:reachable?"fresh":"unreachable",employerConfidence:reachable?"ambiguous":"unreachable",...(roleTitle?{roleTitle}:{}),fetched:requestedBody,reason:reachable?"We could not safely identify one company from this hosted job link.":"We could not reach this job link.",recoveryAction:reachable?"Confirm the company domain before continuing.":"Check the link and try again."};cache.set(canonicalUrl,value,value.status==="fresh"?120000:15000);return value})();
  pending.set(canonicalUrl,work);try{return await work}finally{pending.delete(canonicalUrl)}
}
