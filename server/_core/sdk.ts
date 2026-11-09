import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { ENV } from "./env";
import * as db from "../db";
// Sliding session (founder mandate Oct 16 2026, changeable): a session token lasts 30 days from its last
// renewal, and an active session is re-issued once it is more than a day old (see sessionRenewal.ts).
// Revocation is unchanged: account.sessionsValidAfter, suspension and logout still end a session at once.
const ACCESS_TTL_MS = 30 * 24 * 60 * 60_000;
const RENEW_AFTER_MS = 24 * 60 * 60_000;
const ISSUER = "https://skipwait.me";
const AUDIENCE = "skipwait-web";
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
export type SessionPayload = { openId: string; appId: string; name: string; sid?: string; amr?: "work_email_otp"; ssid?: string };
/** Only a WorkOS hosted-session id is ever carried in the app token. */
const hostedSid = (value: unknown): string | undefined => typeof value === "string" && /^session_[A-Za-z0-9]+$/.test(value) ? value : undefined;
/** D-057: the work-email-code claim is read and written only in this exact form; the subject never implies it. */
const workEmailAmr = (value: unknown): "work_email_otp" | undefined => value === "work_email_otp" ? "work_email_otp" : undefined;
/** D-057 §0b.2: one app-session chain. A random UUID; renewal keeps it, the jti never is it. */
const sessionChainId = (value: unknown): string | undefined => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) ? value : undefined;
class SDKServer {
  private getSessionSecret(){return new TextEncoder().encode(ENV.cookieSecret)}
  async createSessionToken(openId:string,options:{expiresInMs?:number;name?:string;sid?:string;amr?:"work_email_otp";ssid?:string}={}){
    // All app-session issuance goes through an active-account gate. Re-read
    // after signing so a concurrent suspension cannot leave the login endpoint
    // reporting success with a token minted from stale account state.
    const before=await db.getUserByOpenId(openId);
    if(!before||before.suspended)throw new Error("ACCOUNT_NOT_ACTIVE");
    const token=await this.signSession({openId,appId:ENV.appId,name:options.name||"",sid:hostedSid(options.sid),amr:workEmailAmr(options.amr),ssid:sessionChainId(options.ssid)??randomUUID()},options);
    const after=await db.getUserByOpenId(openId);
    if(!after||after.suspended||after.sessionsValidAfter.getTime()!==before.sessionsValidAfter.getTime())throw new Error("ACCOUNT_NOT_ACTIVE");
    return token;
  }
  async signSession(payload:SessionPayload,options:{expiresInMs?:number}={}){
    if(payload.appId!==ENV.appId) throw new Error("Session app ID mismatch");
    const issuedAt=Math.floor(Date.now()/1000), expiresInMs=Math.min(options.expiresInMs??ACCESS_TTL_MS,ACCESS_TTL_MS);
    return new SignJWT({openId:payload.openId,appId:payload.appId,name:payload.name,...(hostedSid(payload.sid)?{sid:hostedSid(payload.sid)}:{}),...(workEmailAmr(payload.amr)?{amr:"work_email_otp"}:{}),...(sessionChainId(payload.ssid)?{ssid:sessionChainId(payload.ssid)}:{})}).setProtectedHeader({alg:"HS256",typ:"JWT"}).setIssuer(ISSUER).setAudience(AUDIENCE).setSubject(payload.openId).setIssuedAt(issuedAt).setJti(randomUUID()).setExpirationTime(issuedAt+Math.floor(expiresInMs/1000)).sign(this.getSessionSecret());
  }
  async verifySession(cookieValue:string|undefined|null){
    if(!cookieValue)return null;
    try{
      const {payload}=await jwtVerify(cookieValue,this.getSessionSecret(),{algorithms:["HS256"],issuer:ISSUER,audience:AUDIENCE});
      const {openId,appId,name}=payload as Record<string,unknown>;
      if(!isNonEmptyString(openId)||appId!==ENV.appId||payload.sub!==openId||typeof payload.iat!=="number"||!isNonEmptyString(payload.jti))return null;
      const account=await db.getUserByOpenId(openId);
      if(!account||account.suspended)return null;
      // JWT iat and MySQL TIMESTAMP both enforce revocation at one-second granularity.
      // Comparing raw milliseconds falsely rejects a token minted later in the same second.
      if(account.sessionsValidAfter&&Math.floor(account.sessionsValidAfter.getTime()/1000)>payload.iat)return null;
      return {openId,appId,name:typeof name==="string"?name:"",sid:hostedSid((payload as Record<string,unknown>).sid),amr:workEmailAmr((payload as Record<string,unknown>).amr),ssid:sessionChainId((payload as Record<string,unknown>).ssid)};
    }catch{return null}
  }
  /** A fresh token for a valid session older than RENEW_AFTER_MS, else null. Young tokens cost no DB read. */
  async renewSessionIfDue(cookieValue:string|undefined|null){
    if(!cookieValue)return null;
    let iat:number;
    try{const {payload}=await jwtVerify(cookieValue,this.getSessionSecret(),{algorithms:["HS256"],issuer:ISSUER,audience:AUDIENCE});if(typeof payload.iat!=="number")return null;iat=payload.iat}catch{return null}
    if(Date.now()-iat*1000<RENEW_AFTER_MS)return null;
    const session=await this.verifySession(cookieValue);
    if(!session)return null;
    return this.createSessionToken(session.openId,{name:session.name,...(session.sid?{sid:session.sid}:{}),...(session.amr?{amr:session.amr}:{}),...(session.ssid?{ssid:session.ssid}:{})});
  }
  async revokeSession(cookieValue:string|undefined|null){
    if(!cookieValue)return;
    const session = await this.verifySession(cookieValue);
    if (session) await db.revokeUserSessions(session.openId);
  }
}
export const sdk=new SDKServer();
export const SESSION_ACCESS_TTL_MS=ACCESS_TTL_MS;
