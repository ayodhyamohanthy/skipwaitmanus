import { describe, expect, it } from "vitest";
import type { PublicCompany } from "@shared/companies";
import { buildAskBody, askIdempotencyKey, ASK_IDEMPOTENCY_KEY } from "./askSend";
import { possessive } from "./copy";
import { costLine, directorySummary, filterCompanies, linkHint } from "./findModel";

const co = (name: string, functions: string[], open: boolean, domains = [`${name.toLowerCase().replace(/\s+/g, "")}.example`]): PublicCompany => ({
  slug: name.toLowerCase().replace(/\s+/g, "-"), name, initials: name.slice(0, 2).toUpperCase(), industry: "Software", location: "Global", functions, blurb: "", domains, openToReferrals: open,
});
const list = [co("Zeta Labs", ["Engineering"], true), co("alpha Bank", ["Finance"], false), co("Mid Co", ["Data", "Technology"], true)];

describe("directory", () => {
  it("sorts alphabetically so open companies are not pushed to the top", () => {
    expect(filterCompanies(list, { query: "", openOnly: false, fn: null }).map(company => company.name)).toEqual(["alpha Bank", "Mid Co", "Zeta Labs"]);
  });
  it("filters by search, availability and job function", () => {
    expect(filterCompanies(list, { query: "bank", openOnly: false, fn: null }).map(company => company.name)).toEqual(["alpha Bank"]);
    expect(filterCompanies(list, { query: "", openOnly: true, fn: null }).map(company => company.name)).toEqual(["Mid Co", "Zeta Labs"]);
    expect(filterCompanies(list, { query: "", openOnly: false, fn: "Data" }).map(company => company.name)).toEqual(["Mid Co"]);
    expect(directorySummary(list)).toEqual({ total: 3, open: 2 });
  });
});

describe("link hint", () => {
  const acme = co("Acme", [], true, ["acme.example"]);
  it("passes a link on the company's own domain", () => {
    expect(linkHint("https://careers.acme.example/jobs/x", acme, false)).toEqual({ tone: "pass", text: "Matches Acme’s careers site" });
  });
  it("is honest about job boards and unknown employers", () => {
    expect(linkHint("https://boards.greenhouse.io/acme/jobs/1", acme, false)?.tone).toBe("muted");
    expect(linkHint("https://careers.other.example/jobs/x", null, false)).toEqual({ tone: "muted", text: "We’ll confirm the employer when you send." });
  });
  it("flags another company's link, and an unfinished link only once touched", () => {
    expect(linkHint("https://careers.other.example/jobs/x", acme, false)?.tone).toBe("error");
    expect(linkHint("careers.acme", acme, false)).toBeNull();
    expect(linkHint("careers.acme", acme, true)?.tone).toBe("error");
  });
});

describe("cost line (D-034, D-047, D-063)", () => {
  it("names the balance at an open company and keeps the ended-credit caveat", () => {
    const line = costLine({ open: true, balance: 2 });
    expect(line.line).toBe("Uses 1 of your 2 credits");
    expect(line.detail).toContain("unless its month or plan has ended by then");
    expect(line.blockedReason).toBeNull();
  });
  it("blocks a send with no credits at an open company", () => {
    expect(costLine({ open: true, balance: 0 }).blockedReason).toBe("You have no credits left. Add a credit pack in Plans and credits.");
  });
  it("says a company with no available employee costs nothing yet", () => {
    expect(costLine({ open: false, balance: 0 })).toMatchObject({ line: "No credit used until a verified employee can see it", blockedReason: null });
  });
  it("stays general when the employer is not listed", () => {
    expect(costLine({ open: null, balance: 2 }).line).toBe("Uses 1 credit when a verified employee can see it");
  });
});

describe("send body", () => {
  it("carries exactly the routing fields the old composer sent", () => {
    expect(buildAskBody({ targetRoleUrl: " https://acme.example/jobs/x ", reasons: ["Built X", "", "Led Y"], resumeId: 7, companySlug: "acme", post: { opportunityId: 4 }, fastTrack: { fastTrackCode: "abcdefabcdefabcd" }, confirmedCompanyDomain: "acme.example" })).toEqual({
      targetRoleUrl: "https://acme.example/jobs/x", attachmentIds: [7], candidateMessage: "Built X\nLed Y", companySlug: "acme", opportunityId: 4, fastTrackCode: "abcdefabcdefabcd", confirmedCompanyDomain: "acme.example",
    });
    expect(buildAskBody({ targetRoleUrl: "https://acme.example/jobs/x", reasons: ["a"], resumeId: 1, companySlug: null, post: null, fastTrack: { fastTrackCompanySlug: "acme", fastTrackAlias: "ref-a" }, confirmedCompanyDomain: undefined })).toEqual({
      targetRoleUrl: "https://acme.example/jobs/x", attachmentIds: [1], candidateMessage: "a", fastTrackCompanySlug: "acme", fastTrackAlias: "ref-a",
    });
  });
  it("reuses one idempotency key until the send succeeds", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    const first = askIdempotencyKey(storage);
    expect(askIdempotencyKey(storage)).toBe(first);
    expect(store.get(ASK_IDEMPOTENCY_KEY)).toBe(first);
  });
  it("writes possessives the way people do", () => {
    expect([possessive("Acme"), possessive("Northwind Labs")]).toEqual(["Acme’s", "Northwind Labs’"]);
  });
});
