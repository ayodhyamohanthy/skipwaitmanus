import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isLegacyOpportunityUrlSafe, validateOpportunityTargetUrl } from "./opportunityTargetUrl";
const publicFetch = async (url:string)=>({canonicalUrl:url,body:""});
describe("opportunity target URL",()=>{
 it.each(["javascript:alert(1)","data:text/html,x","file:///etc/passwd","ftp://acme.com/job","http://acme.com/job","https://user:pass@acme.com/job","https://acme.com:8443/job","https://127.0.0.1/job","https://[::1]/job"])("rejects unsafe %s",async value=>{await expect(validateOpportunityTargetUrl(value,"acme.com",async()=>"acme.com",publicFetch)).rejects.toThrow();});
 it("accepts and canonicalizes a verified direct company link",async()=>{await expect(validateOpportunityTargetUrl("https://WWW.ACME.COM/jobs/1/#apply","acme.com",async()=>"acme.com",publicFetch)).resolves.toBe("https://acme.com/jobs/1");});
 it("rejects an unrelated public domain",async()=>{await expect(validateOpportunityTargetUrl("https://example.org/jobs/1","acme.com",async()=>"example.org",publicFetch)).rejects.toThrow(/verified company/);});
 it("requires exact ATS resolution",async()=>{await expect(validateOpportunityTargetUrl("https://jobs.lever.co/acme/1","acme.com",async()=>"acme.com",publicFetch)).resolves.toContain("lever.co/acme/1");await expect(validateOpportunityTargetUrl("https://jobs.lever.co/acme/1","acme.com",async()=>undefined,publicFetch)).rejects.toThrow(/matched exactly/);});
 it("defense-filters unsafe and company-mismatched legacy rows",()=>{expect(isLegacyOpportunityUrlSafe("javascript:alert(1)","acme.com")).toBe(false);expect(isLegacyOpportunityUrlSafe("https://evil.example/jobs/1","acme.com")).toBe(false);expect(isLegacyOpportunityUrlSafe("https://careers.acme.com/jobs/1","acme.com")).toBe(true);});
 it("rejects a redirect outside the verified company",async()=>{const fetcher=vi.fn(async()=>({canonicalUrl:"https://google.com/phish",body:""}));await expect(validateOpportunityTargetUrl("https://acme.com/jobs/1","acme.com",async()=>"acme.com",fetcher)).rejects.toThrow(/redirected outside/);});
});

describe("opportunity publication integration contract",()=>{
 const dbSource=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
 it("enforces hiring links and complete walk-in facts before insert",()=>{expect(dbSource).toContain('input.kind === "hiring_now" && !targetRoleUrl');expect(dbSource).toContain('input.walkInEndsAt <= input.walkInAt');});
 it("revalidates and deactivates unsafe active legacy rows before return",()=>{expect(dbSource).toContain("await validateOpportunityTargetUrl(row.targetRoleUrl, row.companyDomain");expect(dbSource).toContain("set({ isActive: false })");});
});
