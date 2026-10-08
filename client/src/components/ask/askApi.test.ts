import { describe, expect, it } from "vitest";
import { ASK_NETWORK_ERROR, askErrorMessage, confirmedDomainFor, countOpenAsks, parseSentAsk } from "./askApi";

describe("ask send boundary", () => {
  it("accepts a created or replayed ask and normalizes optional fields", () => {
    expect(parseSentAsk({ requestId: 9, companyDomain: "wipro.com", coverageStatus: "covered", extra: true })).toEqual({ requestId: 9, companyDomain: "wipro.com", waitingForCoverage: false });
    expect(parseSentAsk({ requestId: 12, companyDomain: " ", coverageStatus: "waiting_for_company_coverage" })).toEqual({ requestId: 12, companyDomain: null, waitingForCoverage: true });
    expect(parseSentAsk({ requestId: 3, companyDomain: null })).toEqual({ requestId: 3, companyDomain: null, waitingForCoverage: false });
  });

  it("rejects payloads that do not prove an ask was created", () => {
    for (const payload of [{}, { requestId: "9" }, { requestId: 0 }, { requestId: 1.5 }, { error: "nope" }]) expect(parseSentAsk(payload)).toBeNull();
  });

  it("counts only pending asks and returns null for an unreadable list", () => {
    expect(countOpenAsks({ requests: [{ status: "pending" }, { status: "approved" }, { status: "pending" }] })).toBe(2);
    expect(countOpenAsks({ requests: [] })).toBe(0);
    expect(countOpenAsks({ requests: [{ id: 1 }] })).toBeNull();
    expect(countOpenAsks({ error: "We could not load your referral requests" })).toBeNull();
  });

  it("forwards a confirmed domain only for the exact confirmed link", () => {
    const stored = JSON.stringify({ canonicalUrl: "https://careers.example.com/job/42", confirmedDomain: "tcs.com" });
    expect(confirmedDomainFor("https://careers.example.com/job/42", stored)).toBe("tcs.com");
    expect(confirmedDomainFor("https://careers.example.com/job/43", stored)).toBeUndefined();
    expect(confirmedDomainFor("https://careers.example.com/job/42", null)).toBeUndefined();
    expect(confirmedDomainFor("https://careers.example.com/job/42", "{not json")).toBeUndefined();
    expect(confirmedDomainFor("https://careers.example.com/job/42", JSON.stringify({ canonicalUrl: "https://careers.example.com/job/42", confirmedDomain: "" }))).toBeUndefined();
  });

  it("maps transport failures to plain copy and keeps server messages", () => {
    expect(askErrorMessage(new TypeError("Failed to fetch"), "fallback")).toBe(ASK_NETWORK_ERROR);
    expect(askErrorMessage(new Error("You have used this month's included credits."), "fallback")).toBe("You have used this month's included credits.");
    expect(askErrorMessage("boom", "fallback")).toBe("fallback");
  });
});
