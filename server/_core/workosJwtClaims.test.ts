import { afterEach, describe, expect, it } from "vitest";
import { configuredWorkosClientId, validateWorkosAccessClaims, workosConfigured } from "./workosAuth";
const now = 2_000_000_000;
const valid = { iss:"https://api.workos.com", sub:"user_123", client_id:"client_good", sid:"session_123", jti:"jti_123", iat:now-60, exp:now+240, token_use:"access" };
describe("WorkOS access-token binding",()=>{
 it("accepts exact provider and client binding",()=>expect(validateWorkosAccessClaims(valid,"client_good",now)).toBe(true));
 it.each([
  ["wrong issuer",{...valid,iss:"https://issuer.invalid"}],
  ["wrong client",{...valid,client_id:"client_other"}],
  ["expired",{...valid,exp:now-1}],
  ["future issued",{...valid,iat:now+120}],
  ["wrong token use",{...valid,token_use:"refresh"}],
  ["missing session",{...valid,sid:undefined}],
  ["wrong audience",{...valid,aud:"client_other"}],
  ["multi audience without azp",{...valid,aud:["client_good","client_other"]}],
  ["wrong authorized party",{...valid,aud:["client_good","client_other"],azp:"client_other"}],
 ])("rejects %s",(_name,payload)=>expect(validateWorkosAccessClaims(payload,"client_good",now)).toBe(false));
 it("accepts multi-audience only with exact azp",()=>expect(validateWorkosAccessClaims({...valid,aud:["client_good","api"],azp:"client_good"},"client_good",now)).toBe(true));
});
describe("WorkOS production configuration",()=>{
 const saved={...process.env};afterEach(()=>{process.env={...saved};});
 it("rejects malformed client IDs",()=>{process.env.WORKOS_CLIENT_ID="other";expect(()=>configuredWorkosClientId()).toThrow(/malformed/);});
 it("fails incomplete production configuration",()=>{process.env.NODE_ENV="production";process.env.WORKOS_CLIENT_ID="client_good";delete process.env.WORKOS_API_KEY;delete process.env.WORKOS_COOKIE_PASSWORD;expect(()=>workosConfigured()).toThrow(/incomplete/);});
 it("fails closed when production has no WorkOS plane at all",()=>{process.env.NODE_ENV="production";delete process.env.WORKOS_CLIENT_ID;delete process.env.WORKOS_API_KEY;delete process.env.WORKOS_COOKIE_PASSWORD;expect(()=>workosConfigured()).toThrow(/incomplete/);});
 it("keeps the dev session plane available locally when WorkOS is unset",()=>{process.env.NODE_ENV="development";delete process.env.WORKOS_CLIENT_ID;delete process.env.WORKOS_API_KEY;delete process.env.WORKOS_COOKIE_PASSWORD;expect(workosConfigured()).toBe(false);});
 it("accepts a complete production plane",()=>{process.env.NODE_ENV="production";process.env.WORKOS_CLIENT_ID="client_good";process.env.WORKOS_API_KEY="sk_test_key";process.env.WORKOS_COOKIE_PASSWORD="a_cookie_password";expect(workosConfigured()).toBe(true);});
});
