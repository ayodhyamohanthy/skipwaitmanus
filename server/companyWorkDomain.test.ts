import { describe, expect, it } from "vitest";
import { workDomainFor } from "./companyWorkDomain";

// SEARCH-work-domain (D-394): a discovered company carries the domain its employees' work email uses.
describe("workDomainFor", () => {
  it("maps Google's official site to the domain its employees verify with (owner, Nov 24)", () => {
    expect(workDomainFor("about.google")).toBe("google.com");
  });

  it("resolves a corporate subdomain to its parent", () => {
    expect(workDomainFor("about.netflix.com")).toBe("netflix.com");
    expect(workDomainFor("careers.example.co.uk")).toBe("example.co.uk");
    expect(workDomainFor("corporate.walmart.com")).toBe("walmart.com");
    expect(workDomainFor("investors.example.com")).toBe("example.com");
  });

  it("keeps a plain domain, lowercases it and drops a trailing dot", () => {
    expect(workDomainFor("Stripe.com")).toBe("stripe.com");
    expect(workDomainFor("openai.com.")).toBe("openai.com");
    expect(workDomainFor("play.example.com")).toBe("play.example.com");
  });

  it("never strips down to a public suffix or a bare brand TLD", () => {
    expect(workDomainFor("jobs.co.uk")).toBe("jobs.co.uk");
    expect(workDomainFor("careers.com.au")).toBe("careers.com.au");
    expect(workDomainFor("about.example")).toBe("about.example");
  });
});
