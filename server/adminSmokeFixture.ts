import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";

type RealIdentity={account:{id:number;role?:"user"|"admin"}};
type SyntheticRole="seeker"|"referrer"|"admin"|"employer";
type Payload={nonce:string;adminId:number;role:SyntheticRole;csrf:string;exp:number};
type Fixture={role:SyntheticRole;user:{id:number;email:string;company:string};requests:Array<{id:number;title:string;status:string}>};
export type SmokeDeps={resolveIdentity:(req:Request)=>Promise<RealIdentity|undefined>;recordActivity?:(event:any)=>unknown};
const COOKIE="skipwait_admin_smoke",CSRF_COOKIE="skipwait_smoke_csrf",TTL_MS=15*60_000;
const fixtures=new Map<string,Fixture>();
const activations=new Map<number,number[]>();
const ids:Record<SyntheticRole,number>={seeker:-101,referrer:-102,admin:-103,employer:-104};
const emails:Record<SyntheticRole,string>={seeker:"seeker@smoke.invalid",referrer:"referrer@smoke.invalid",admin:"admin@smoke.invalid",employer:"employer@smoke.invalid"};
const denied=/^\/api\/(?:payments?|refunds?|auth\/referrer-otp|work-email-otp|documents?|admin\/(?:users|privacy|token|schema|partners)|privacy\/requests|employer\/billing)(?:\/|$)/;
const parseCookies=(req:Request)=>Object.fromEntries(String(req.headers.cookie||"").split(";").map(v=>v.trim().split(/=(.*)/).slice(0,2)).filter(([k])=>k));
const secret=()=>process.env.ADMIN_SMOKE_SECRET||"";
const sign=(body:string)=>createHmac("sha256",secret()).update(body).digest("base64url");
const encode=(p:Payload)=>{const body=Buffer.from(JSON.stringify(p)).toString("base64url");return `${body}.${sign(body)}`};
export function decodeSmokeCookie(raw:string|undefined,now=Date.now()):Payload|undefined{
 if(!raw||!secret()||!raw.includes("."))return;const [body,sig]=raw.split(".");const expected=sign(body);if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return;
 try{const p=JSON.parse(Buffer.from(body,"base64url").toString()) as Payload;if(p.exp<=now||!(["seeker","referrer","admin","employer"] as string[]).includes(p.role)||p.adminId<=0||!p.nonce||!p.csrf)return;return p}catch{return}
}
const cookieOptions="Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict";
const clearCookie=(res:Response)=>res.append("Set-Cookie",`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
const csrfOk=(req:Request,p?:Payload)=>{const cookies=parseCookies(req);const supplied=String(req.header("x-csrf-token")||req.body?.csrf||"");return Boolean(supplied&&cookies[CSRF_COOKIE]===supplied&&(!p||p.csrf===supplied))};
const fixture=(role:SyntheticRole):Fixture=>({role,user:{id:ids[role],email:emails[role],company:"Smoke Corp"},requests:[{id:-201,title:"Synthetic referral request",status:"pending"}]});
export function registerAdminSmokeFixture(app:Express,deps:SmokeDeps){
 app.use((req,res,next)=>{const p=decodeSmokeCookie(parseCookies(req)[COOKIE]);if(!p)return next();if(denied.test(req.path))return res.status(409).json({smokeMode:true,error:"This live or destructive operation is disabled in smoke mode"});if(req.path.startsWith("/api/")&&!req.path.startsWith("/api/admin/smoke/")&&req.path!=="/api/health"){const state=fixtures.get(p.nonce);if(!state)return res.status(401).json({error:"Smoke session is invalid or expired"});return res.json({smokeMode:true,role:p.role,data:state});}next()});
 app.get("/api/admin/smoke/status",async(req,res)=>{if(process.env.ENABLE_ADMIN_SMOKE_FIXTURE!=="true")return res.status(404).json({error:"Not found"});const p=decodeSmokeCookie(parseCookies(req)[COOKIE]);const csrf=p?.csrf||randomBytes(24).toString("base64url");res.append("Set-Cookie",`${CSRF_COOKIE}=${csrf}; Path=/; Max-Age=900; Secure; SameSite=Strict`);res.set("Cache-Control","no-store");res.json({enabled:true,active:Boolean(p&&fixtures.has(p.nonce)),role:p?.role,csrf})});
 app.post("/api/admin/smoke/activate",async(req,res)=>{if(process.env.ENABLE_ADMIN_SMOKE_FIXTURE!=="true")return res.status(404).json({error:"Not found"});if(!secret())return res.status(503).json({error:"Smoke fixture secret is not configured"});const identity=await deps.resolveIdentity(req);if(!identity||identity.account.role!=="admin")return res.status(403).json({error:"Administrator access is required"});if(!csrfOk(req))return res.status(403).json({error:"CSRF validation failed"});const now=Date.now(),recent=(activations.get(identity.account.id)||[]).filter(t=>now-t<60_000);if(recent.length>=5)return res.status(429).json({error:"Smoke activation rate limit exceeded"});recent.push(now);activations.set(identity.account.id,recent);const role=(req.body?.role||"seeker") as SyntheticRole;if(!(["seeker","referrer","admin","employer"] as string[]).includes(role))return res.status(400).json({error:"Invalid synthetic role"});const p={nonce:randomBytes(18).toString("base64url"),adminId:identity.account.id,role,csrf:parseCookies(req)[CSRF_COOKIE],exp:now+TTL_MS};fixtures.set(p.nonce,fixture(role));res.append("Set-Cookie",`${COOKIE}=${encode(p)}; ${cookieOptions}`);void deps.recordActivity?.({actorUserId:identity.account.id,action:"admin.smoke_activated",outcome:"success",resourceType:"smoke_fixture",metadata:{role}});res.json({active:true,role,expiresAt:new Date(p.exp).toISOString()})});
 const active=(req:Request,res:Response)=>{const p=decodeSmokeCookie(parseCookies(req)[COOKIE]);if(!p||!fixtures.has(p.nonce)){res.status(401).json({error:"Smoke session is invalid or expired"});return}return p};
 app.get("/api/admin/smoke/fixture",(req,res)=>{const p=active(req,res);if(p)res.json({smokeMode:true,data:fixtures.get(p.nonce)})});
 app.post("/api/admin/smoke/reset",(req,res)=>{const p=active(req,res);if(!p)return;if(!csrfOk(req,p))return res.status(403).json({error:"CSRF validation failed"});fixtures.set(p.nonce,fixture(p.role));res.json({smokeMode:true,reset:true,data:fixtures.get(p.nonce)})});
 app.post("/api/admin/smoke/exit",(req,res)=>{const p=active(req,res);if(!p)return;if(!csrfOk(req,p))return res.status(403).json({error:"CSRF validation failed"});fixtures.delete(p.nonce);clearCookie(res);void deps.recordActivity?.({actorUserId:p.adminId,action:"admin.smoke_exited",outcome:"success",resourceType:"smoke_fixture"});res.json({active:false})});
 app.all("/api/admin/smoke/fixture/*",(req,res)=>{const p=active(req,res);if(!p)return;if(req.method!=="GET"&&!csrfOk(req,p))return res.status(403).json({error:"CSRF validation failed"});res.json({smokeMode:true,role:p.role,data:fixtures.get(p.nonce)})});
}
export const __smokeTest={fixtures,ids,denied};
