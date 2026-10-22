import { describe, expect, it } from "vitest";
import type { PublicCompany } from "@shared/companies";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";
import { companyMatches, costLine, directorySummary, filterCompanies, linkHint, roleTitleFromUrl } from "./findModel";

const company = (name: string, over: Partial<Pick<PublicCompany, "openToReferrals" | "functions" | "domains" | "industry">> = {}): PublicCompany => ({
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  initials: name.slice(0, 2).toUpperCase(),
  industry: "Software",
  location: "Bengaluru",
  functions: ["Engineering", "Product"],
  blurb: "A company.",
  domains: [`${name.toLowerCase().replace(/\s+/g, "")}.com`],
  openToReferrals: true,
  ...over,
});

describe("find-a-referral directory", () => {
  const alpha = company("Alpha", { domains: ["alpha.com"] });
  const beta = company("Beta", { openToReferrals: false, functions: ["Finance"], domains: ["beta.com"] });
  const gamma = company("Gamma", { functions: ["Design"], domains: ["gamma.com"] });

  it("matches the search across name, industry and functions, case-insensitively", () => {
    expect(companyMatches(alpha, { query: "alp", openOnly: false, fn: null })).toBe(true);
    expect(companyMatches(alpha, { query: "software", openOnly: false, fn: null })).toBe(true);
    expect(companyMatches(gamma, { query: "design", openOnly: false, fn: null })).toBe(true);
    expect(companyMatches(alpha, { query: "finance", openOnly: false, fn: null })).toBe(false);
  });

  it("filters by availability and one job function", () => {
    const filter = { query: "", openOnly: false, fn: null } as const;
    expect(filterCompanies([beta, alpha, gamma], filter).map(item => item.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(filterCompanies([beta, alpha, gamma], { ...filter, openOnly: true }).map(item => item.name)).toEqual(["Alpha", "Gamma"]);
    expect(filterCompanies([beta, alpha, gamma], { ...filter, fn: "Finance" }).map(item => item.name)).toEqual(["Beta"]);
  });

  it("counts the companies shown and how many are open", () => {
    expect(directorySummary([alpha, beta, gamma])).toEqual({ total: 3, open: 2 });
    expect(directorySummary([])).toEqual({ total: 0, open: 0 });
  });
});

describe("job-link hint", () => {
  const acme = company("Acme", { domains: ["acme.com"] });

  it("says nothing for an empty field, and holds an unfinished link until touched", () => {
    expect(linkHint("", acme, false)).toBeNull();
    expect(linkHint("not a url", acme, false)).toBeNull();
    expect(linkHint("not a url", acme, true)).toEqual({ tone: "error", text: TARGET_ROLE_URL_ERROR });
  });

  it("passes a link on the company's own careers site", () => {
    expect(linkHint("https://careers.acme.com/jobs/1", acme, false)).toEqual({ tone: "pass", text: "Matches Acme’s careers site" });
  });

  it("refuses a link from a different employer", () => {
    expect(linkHint("https://other.com/jobs/1", acme, false)).toEqual({ tone: "error", text: "This link isn’t from Acme. Paste a job link from Acme’s own careers page." });
  });

  it("accepts a hosted job board but says the employer is confirmed at send", () => {
    expect(linkHint("https://www.linkedin.com/jobs/view/1", acme, false)).toEqual({ tone: "muted", text: "We’ll confirm it’s a Acme role when you send." });
  });

  it("uses the plural possessive for a name that ends in s", () => {
    expect(linkHint("https://careers.tcs.com/jobs/1", company("TCS", { domains: ["tcs.com"] }), false)).toEqual({ tone: "pass", text: "Matches TCS’ careers site" });
  });
});

describe("role title from the job link", () => {
  it("humanizes a readable careers slug", () => {
    expect(roleTitleFromUrl("https://careers.kestrelpay.com/careers/senior-backend-engineer-payments")).toBe("Senior Backend Engineer Payments");
    expect(roleTitleFromUrl("https://acme.com/jobs/product-designer-12345")).toBe("Product Designer");
  });

  it("skips the generic path words around the slug", () => {
    expect(roleTitleFromUrl("https://acme.com/jobs/view/staff-data-engineer/apply")).toBe("Staff Data Engineer");
  });

  it("returns nothing rather than inventing a title from a job id", () => {
    expect(roleTitleFromUrl("https://www.linkedin.com/jobs/view/4446365088")).toBeNull();
    expect(roleTitleFromUrl("not a url")).toBeNull();
    expect(roleTitleFromUrl("")).toBeNull();
  });
});

describe("ask cost line", () => {
  it("says nothing is used while a company has no available employee", () => {
    const cost = costLine({ open: false, balance: 7 });
    expect(cost.line).toBe("No credit used until a verified employee can see it");
    expect(cost.detail).toContain(`${COVERAGE_WAIT_DAYS} days`);
    expect(cost.blockedReason).toBeNull();
  });

  it("states the balance when it is known", () => {
    expect(costLine({ open: true, balance: 2 }).line).toBe("Uses 1 of your 2 credits");
    expect(costLine({ open: true, balance: 1 }).line).toBe("Uses 1 of your 1 credit");
    expect(costLine({ open: true, balance: 2 }).detail).toContain(`${ASK_TTL_DAYS} days`);
  });

  it("never invents a balance while it loads, and blocks a wallet with none", () => {
    expect(costLine({ open: true, balance: null }).line).toBe("Uses 1 credit");
    const none = costLine({ open: true, balance: 0 });
    expect(none.line).toBe("You have no credits left");
    expect(none.blockedReason).toContain("Add a credit pack");
  });

  it("describes the waiting case when availability is not known yet", () => {
    expect(costLine({ open: null, balance: null }).line).toBe("Uses 1 credit when a verified employee can see it");
  });
});
