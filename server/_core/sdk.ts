import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { ENV } from "./env";
import * as db from "../db";
const ACCESS_TTL_MS = 30 * 60_000;
const ISSUER = "https://skipwait.me";
const AUDIENCE = "skipwait-web";
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
export type SessionPayload = { openId: string; appId: string; name: string };
class SDKServer {
  private getSessionSecret(){return new TextEncoder().encode(ENV.cookieSecret)}
  async createSessionToken(openId:string,options:{expiresInMs?:number;name?:string}={}){
    // All app-session issuance goes through an active-account gate. Re-read
    // after signing so a concurrent suspension cannot leave the login endpoint
    // reporting success with a token minted from stale account state.
    const before=await db.getUserByOpenId(openId);
    if(!before||before.suspended)throw new Error("ACCOUNT_NOT_ACTIVE");
    const token=await this.signSession({openId,appId:ENV.appId,name:options.name||""},options);
    const after=await db.getUserByOpenId(openId);
    if(!after||after.suspended||after.sessionsValidAfter.getTime()!==before.sessionsValidAfter.getTime())throw new Error("ACCOUNT_NOT_ACTIVE");
    return token;
  }
  async signSession(payload:SessionPayload,options:{expiresInMs?:number}={}){
    if(payload.appId!==ENV.appId) throw new Error("Session app ID mismatch");
    const issuedAt=Math.floor(Date.now()/1000), expiresInMs=Math.min(options.expiresInMs??ACCESS_TTL_MS,ACCESS_TTL_MS);
    return new SignJWT({openId:payload.openId,appId:payload.appId,name:payload.name}).setProtectedHeader({alg:"HS256",typ:"JWT"}).setIssuer(ISSUER).setAudience(AUDIENCE).setSubject(payload.openId).setIssuedAt(issuedAt).setJti(randomUUID()).setExpirationTime(issuedAt+Math.floor(expiresInMs/1000)).sign(this.getSessionSecret());
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
      return {openId,appId,name:typeof name==="string"?name:""};
    }catch{return null}
  }
  async revokeSession(cookieValue:string|undefined|null){
    if(!cookieValue)return;
    const session = await this.verifySession(cookieValue);
    if (session) await db.revokeUserSessions(session.openId);
  }
}
export const sdk=new SDKServer();
export const SESSION_ACCESS_TTL_MS=ACCESS_TTL_MS;
