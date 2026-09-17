import { Agent, fetch as undiciFetch } from "undici";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { normalizeTargetRoleUrl, reviewedEmployerFromTargetRoleUrl } from "../shared/referralUrl";
import { directEmployerDomainFromTargetUrl, isHostedJobPlatform } from "./employerRouting";
import { isValidTargetRoleUrl } from "../shared/referralUrl";
import { BoundedTtlCache } from "./boundedTtlCache";

export type EmployerConfidence = "verified"|"direct-domain"|"ambiguous"|"unreachable";
export type JobLinkPreview = { canonicalUrl:string; status:"fresh"|"unreachable"; employerConfidence:EmployerConfidence; companyDomain?:string; companyName?:string; reason:string; recoveryAction:string };
const cache=new BoundedTtlCache<string,JobLinkPreview>(5000);
const pending=new Map<string,Promise<JobLinkPreview>>();
export function resetJobLinkPreviewCache(){cache.clear();pending.clear()}
export function jobLinkPreviewCacheSize(){return cache.size}
const blockedRanges=new Set(["unspecified","broadcast","multicast","linkLocal","loopback","private","uniqueLocal","carrierGradeNat","reserved"]);
export function isPublicAddress(address:string){try{return !blockedRanges.has(ipaddr.parse(address).range())}catch{return false}}
async function pinnedDispatcher(hostname:string){const answers=await lookup(hostname,{all:true,verbatim:true});if(!answers.length||answers.some(a=>!isPublicAddress(a.address)))throw Error("unsafe_destination");const allowed=new Map(answers.map(a=>[a.address,a.family]));return new Agent({connect:{lookup:(_host,opts,cb)=>{const first=answers[0];if(!allowed.has(first.address))return cb(Error("dns_rebinding"),"",4);if((opts as {all?:boolean}).all)return cb(null,answers as never);cb(null,first.address,first.family)}}});}
const allowedHostedApi=(url:URL)=>
  (url.hostname==="www.linkedin.com"&&url.pathname.startsWith("/jobs-guest/jobs/api/jobPosting/")) ||
  ((url.hostname==="boards.greenhouse.io"||url.hostname==="job-boards.greenhouse.io") && /^\/[a-z0-9._-]+(?:\/|$)/i.test(url.pathname));
export async function fetchPublicJobLink(input:string){let current=new URL(input);for(let redirect=0;redirect<8;redirect++){if(!["http:","https:"].includes(current.protocol))throw Error("unsupported_protocol");if(isHostedJobPlatform(current.hostname)&&!allowedHostedApi(current))throw Error("hosted_redirect_blocked");const dispatcher=await pinnedDispatcher(current.hostname);const response=await undiciFetch(current,{dispatcher,redirect:"manual",signal:AbortSignal.timeout(5000),headers:{"user-agent":"skipwait.me job preview","accept":"text/html,application/xhtml+xml"}});if(response.status>=300&&response.status<400){const location=response.headers.get("location");if(!location)throw Error("bad_redirect");current=new URL(location,current);continue}if(!response.ok)throw Error("unreachable");const length=Number(response.headers.get("content-length")||0);if(length>512000)throw Error("oversized");const reader=response.body?.getReader();let total=0;const chunks:Uint8Array[]=[];while(reader){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>512000){await reader.cancel();throw Error("oversized")}chunks.push(value)}return {canonicalUrl:current.toString(),body:Buffer.concat(chunks).toString("utf8")}}throw Error("redirect_limit")}
export async function previewJobLink(input:string,resolve:(url:string)=>Promise<string|undefined>,fetcher=fetchPublicJobLink):Promise<JobLinkPreview>{
  const canonicalUrl=normalizeTargetRoleUrl(input);if(!isValidTargetRoleUrl(canonicalUrl))throw Error("unsafe_cache_key");
  const hit=cache.get(canonicalUrl);if(hit)return hit;
  const active=pending.get(canonicalUrl);if(active)return active;
  const work=(async()=>{let reachable=true;const direct=directEmployerDomainFromTargetUrl(canonicalUrl);const reviewed=reviewedEmployerFromTargetRoleUrl(canonicalUrl);const host=new URL(canonicalUrl).hostname;const publicGreenhouse=host==="boards.greenhouse.io"||host==="job-boards.greenhouse.io";if(direct||publicGreenhouse){try{await fetcher(canonicalUrl)}catch{reachable=false}}else if(!reviewed){reachable=false}let domain:string|undefined;try{domain=await resolve(canonicalUrl)}catch{/* unresolved */}const trustedDomain=domain&&(reachable||reviewed)?domain:undefined;const value:JobLinkPreview=trustedDomain?{canonicalUrl,status:reachable?"fresh":"unreachable",employerConfidence:reviewed?"verified":"direct-domain",companyDomain:trustedDomain,...(reviewed?{companyName:reviewed.name}:{}),reason:reachable?"Company identified from the job link.":"Company identified from a reviewed listing, but the job page could not be reached.",recoveryAction:reachable?"Continue to your resume.":"Check that the job is still open."}:{canonicalUrl,status:reachable?"fresh":"unreachable",employerConfidence:reachable?"ambiguous":"unreachable",reason:reachable?"We could not safely identify one company from this hosted job link.":"We could not reach this job link.",recoveryAction:reachable?"Confirm the company domain before continuing.":"Check the link and try again."};cache.set(canonicalUrl,value,value.status==="fresh"?120000:15000);return value})();
  pending.set(canonicalUrl,work);try{return await work}finally{pending.delete(canonicalUrl)}
}
