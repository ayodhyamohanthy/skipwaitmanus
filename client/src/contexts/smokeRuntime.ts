export type SmokeIdentity={id:number;role:"seeker"|"referrer"|"admin"|"employer";email:string;company:string};
export type SmokeBootstrap={active:boolean;csrf?:string;identity?:SmokeIdentity;snapshot?:Record<string,any>};
let smoke:SmokeBootstrap={active:false};
let transport:typeof fetch=(...args)=>globalThis.fetch(...args);
export const setSmokeTransport=(next:typeof fetch)=>{transport=next};
export const smokeState=()=>smoke;
export const setSmokeState=(next:SmokeBootstrap)=>{smoke=next};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const list=(key:string)=>smoke.snapshot?.[key]??[];
const readContract=(path:string)=>{
 const s=smoke.snapshot||{};
 if(path==="/api/referral-impact")return s.referralImpact;
 if(path==="/api/jobs")return {jobs:list("jobs")};
 if(path==="/api/opportunities")return {opportunities:list("opportunities")};
 if(path==="/api/company-referrals/mine")return {requests:list("requests")};
 if(path==="/api/company-referrals/inbox")return {requests:list("inbox")};
 if(path==="/api/referrer/impact-summary")return s.impact;
 if(path==="/api/notifications")return {notifications:list("notifications"),unreadCount:1};
 if(path==="/api/saved-roles")return {savedRoleIds:[-301]};
 if(path==="/api/personal-invites/me")return s.invites;
 if(path==="/api/referrer-fast-track/me")return s.fastTrack;
 if(path==="/api/partners")return {partners:list("partners")};
 if(path==="/api/privacy/requests")return {requests:list("privacyRequests")};
 if(path==="/api/employer/account")return s.employer?.account;
 if(path==="/api/employer/talent")return {talent:list("talent")};
 if(path==="/api/employer/opportunities")return {opportunities:list("employerOpportunities")};
 if(path==="/api/employer/spend-history")return {entries:list("spendHistory")};
 if(path.startsWith("/api/credits/summary"))return s.wallet;
 if(path==="/api/admin/activity")return {events:list("adminEvents")};
 if(path==="/api/admin/users")return {users:list("adminUsers")};
 if(path==="/api/admin/approval-queue")return {items:list("approvals")};
 if(path==="/api/admin/payments/review")return {payments:list("payments")};
 if(path==="/api/admin/revenue")return s.revenue;
 if(path==="/api/admin/privacy-requests")return {requests:list("privacyRequests")};
 if(path==="/api/admin/flow-health")return s.flowHealth;
 if(path==="/api/admin/partners")return {partners:list("partners")};
 if(path==="/api/admin/sponsorships")return {sponsorships:list("sponsorships")};
 if(path==="/api/admin/schema/reconcile")return s.schema;
 return undefined;
};
const allowedActions=[/^\/api\/notifications\/-\d+\/read$/, /^\/api\/saved-roles\/-\d+$/, /^\/api\/company-referrals\/-\d+\/withdraw$/, /^\/api\/privacy\/requests(?:\/erasure)?$/, /^\/api\/personal-invites\/claim$/];
export async function smokeFetch(input:RequestInfo|URL,init?:RequestInit){
 if(!smoke.active)return transport(input,init);
 const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url,location.origin),path=url.pathname,method=(init?.method||((input as Request)?.method)||"GET").toUpperCase();
 if(path.startsWith("/api/admin/smoke/"))return transport(input,init);
 if(path.startsWith("/api/trpc/"))return json({error:{json:{message:"Live tRPC is unavailable in smoke mode",code:-32009,data:{code:"CONFLICT",httpStatus:409}}}},409);
 if(method==="GET"){const value=readContract(path);return value===undefined?json({smokeMode:true,error:`No synthetic GET contract for ${path}`},404):json(value)}
 if(!allowedActions.some(rule=>rule.test(path)))return json({smokeMode:true,error:`Live mutation denied: ${method} ${path}`},409);
 return json({smokeMode:true,ok:true,id:-999,status:"synthetic"});
}
export async function bootstrapSmoke(nativeFetch:typeof fetch=globalThis.fetch){
 setSmokeTransport(nativeFetch);
 try{const status=await nativeFetch("/api/admin/smoke/status",{credentials:"include",cache:"no-store"});if(!status.ok)return smoke;const info=await status.json();if(!info.active)return smoke;const response=await nativeFetch("/api/admin/smoke/snapshot",{credentials:"include",cache:"no-store"});if(!response.ok)throw new Error("Smoke snapshot failed");smoke={...info,active:true,snapshot:await response.json()};return smoke}catch{smoke={active:false};return smoke}
}
