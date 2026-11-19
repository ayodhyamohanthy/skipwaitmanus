import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import ipaddr from "ipaddr.js";
import { isLegacyOpportunityUrlSafe, validateOpportunityTargetUrl } from "./opportunityTargetUrl";

const publicFetch = async (url: string) => ({ canonicalUrl: url, body: "" });

// The public-host gate resolves DNS, so these specs own that answer instead of
// sending a real query for `acme.com` from the test runner.
const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: dns.lookup }));

const PUBLIC_ANSWERS = [{ address: "93.184.216.34", family: 4 as const }];
const answers = (...addresses: string[]) => addresses.map(address => ({ address, family: (address.includes(":") ? 6 : 4) as 4 | 6 }));

/** Resolvers do not answer for an IP literal, so neither does this mock. */
function defaultLookup(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(bare)) return Promise.reject(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }));
  return Promise.resolve(PUBLIC_ANSWERS);
}

describe("opportunity target URL", () => {
  beforeEach(() => { dns.lookup.mockReset(); dns.lookup.mockImplementation(defaultLookup); });

  it.each(["javascript:alert(1)","data:text/html,x","file:///etc/passwd","ftp://acme.com/job","http://acme.com/job","https://user:pass@acme.com/job","https://acme.com:8443/job","https://127.0.0.1/job","https://[::1]/job"])("rejects unsafe %s",async value=>{await expect(validateOpportunityTargetUrl(value,"acme.com",async()=>"acme.com",publicFetch)).rejects.toThrow();});
  it("accepts and canonicalizes a verified direct company link",async()=>{await expect(validateOpportunityTargetUrl("https://WWW.ACME.COM/jobs/1/#apply","acme.com",async()=>"acme.com",publicFetch)).resolves.toBe("https://acme.com/jobs/1");});
  it("rejects an unrelated public domain",async()=>{await expect(validateOpportunityTargetUrl("https://example.org/jobs/1","acme.com",async()=>"example.org",publicFetch)).rejects.toThrow(/verified company/);});
  it("requires exact ATS resolution",async()=>{await expect(validateOpportunityTargetUrl("https://jobs.lever.co/acme/1","acme.com",async()=>"acme.com",publicFetch)).resolves.toContain("lever.co/acme/1");await expect(validateOpportunityTargetUrl("https://jobs.lever.co/acme/1","acme.com",async()=>undefined,publicFetch)).rejects.toThrow(/matched exactly/);});
  it("defense-filters unsafe and company-mismatched legacy rows",()=>{expect(isLegacyOpportunityUrlSafe("javascript:alert(1)","acme.com")).toBe(false);expect(isLegacyOpportunityUrlSafe("https://evil.example/jobs/1","acme.com")).toBe(false);expect(isLegacyOpportunityUrlSafe("https://careers.acme.com/jobs/1","acme.com")).toBe(true);});
  it("rejects a redirect outside the verified company",async()=>{const fetcher=vi.fn(async()=>({canonicalUrl:"https://google.com/phish",body:""}));await expect(validateOpportunityTargetUrl("https://acme.com/jobs/1","acme.com",async()=>"acme.com",fetcher)).rejects.toThrow(/redirected outside/);});
});

describe("public internet host gate", () => {
  beforeEach(() => { dns.lookup.mockReset(); dns.lookup.mockImplementation(defaultLookup); });

  // A public hostname whose record points inward is the whole attack: the link
  // reads as a careers page and the request lands on the machine running it.
  it.each([
    ["loopback", "::1"],
    ["mapped loopback", "::ffff:127.0.0.1"],
    ["cloud metadata", "169.254.169.254"],
    ["mapped cloud metadata", "::ffff:169.254.169.254"],
    ["private network", "10.0.0.5"],
    ["mapped private network", "::ffff:10.0.0.5"],
    ["site-local", "fc00::1"],
    ["link-local", "fe80::1"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["mapped carrier-grade NAT", "::ffff:100.64.0.1"],
    ["unspecified", "0.0.0.0"],
    ["NAT64 well-known prefix", "64:ff9b::7f00:1"],
  ])("refuses a company-shaped host that resolves to %s", async (_label, address) => {
    dns.lookup.mockResolvedValue(answers(address));
    await expect(validateOpportunityTargetUrl("https://careers.acme.com/jobs/1", "acme.com", async () => "acme.com", publicFetch)).rejects.toThrow(/public internet host/);
  });

  it("accepts the same host when the record is genuinely public", async () => {
    // Without this the refusal specs above could pass by always rejecting.
    dns.lookup.mockResolvedValue(answers("93.184.216.34"));
    await expect(validateOpportunityTargetUrl("https://careers.acme.com/jobs/1", "acme.com", async () => "acme.com", publicFetch)).resolves.toBe("https://careers.acme.com/jobs/1");
  });

  it("re-checks the host after a redirect that keeps the company domain", async () => {
    dns.lookup.mockResolvedValueOnce(answers("93.184.216.34")).mockResolvedValue(answers("::ffff:169.254.169.254"));
    const fetcher = vi.fn(async (url: string) => ({ canonicalUrl: url, body: "" }));
    await expect(validateOpportunityTargetUrl("https://careers.acme.com/jobs/1", "acme.com", async () => "acme.com", fetcher)).rejects.toThrow(/public internet host/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["https://[::1]/job", "https://[fd00::1]/job"])("refuses the IPv6 literal host %s without a DNS query", async value => {
    await expect(validateOpportunityTargetUrl(value, "acme.com", async () => "acme.com", publicFetch)).rejects.toThrow(/public internet host/);
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("answers an unresolvable host with the link rule rather than a resolver error", async () => {
    dns.lookup.mockRejectedValue(Object.assign(new Error("getaddrinfo ENOTFOUND careers.acme.com"), { code: "ENOTFOUND" }));
    await expect(validateOpportunityTargetUrl("https://careers.acme.com/jobs/1", "acme.com", async () => "acme.com", publicFetch)).rejects.toThrow(/public internet host/);
  });

  it("refuses a host that resolves to nothing", async () => {
    dns.lookup.mockResolvedValue([]);
    await expect(validateOpportunityTargetUrl("https://careers.acme.com/jobs/1", "acme.com", async () => "acme.com", publicFetch)).rejects.toThrow(/public internet host/);
  });
});

describe("opportunity publication integration contract", () => {
 const dbSource=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
 it("enforces hiring links and complete walk-in facts before insert",()=>{expect(dbSource).toContain('input.kind === "hiring_now" && !targetRoleUrl');expect(dbSource).toContain('input.walkInEndsAt <= input.walkInAt');});
 it("keeps public reads side-effect-free and validates only before insert",()=>{
  const publicRead=dbSource.slice(dbSource.indexOf("export async function listPublicCompanyOpportunities()"),dbSource.indexOf("export const isPrivateReferralJob"));
  const sponsoredRead=dbSource.slice(dbSource.indexOf("export async function listPublicCompanyOpportunitiesWithSponsorship()"),dbSource.indexOf("export async function listPartnerModules"));
  expect(publicRead).not.toContain("validateOpportunityTargetUrl"); expect(publicRead).not.toContain("db.update");
  expect(dbSource.indexOf("await validateOpportunityTargetUrl")).toBeLessThan(dbSource.indexOf("db.insert(companyOpportunities)"));
 });
});
