import { decodeJwt, SignJWT, jwtVerify } from "jose";
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
  async createSessionToken(openId:string,options:{expiresInMs?:number;name?:string}={}){return this.signSession({openId,appId:ENV.appId,name:options.name||""},options)}
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
      if(account?.sessionsValidAfter&&payload.iat*1000<account.sessionsValidAfter.getTime())return null;
      return {openId,appId,name:typeof name==="string"?name:""};
    }catch{return null}
  }
  async revokeSession(cookieValue:string|undefined|null){
    if(!cookieValue)return;
    try{const p=decodeJwt(cookieValue);if(typeof p.sub==="string")await db.revokeUserSessions(p.sub)}catch{}
  }
}
export const sdk=new SDKServer();
export const SESSION_ACCESS_TTL_MS=ACCESS_TTL_MS;
