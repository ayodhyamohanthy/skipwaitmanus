import { describe, expect, it } from "vitest";
import { ASK_NETWORK_ERROR, askErrorMessage, confirmedDomainFor, parseSentAsk, parseSlotCapReached } from "./askApi";

const slots = { plan: "free", planLabel: "Free", open: 3, cap: 3, full: true, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 } } as const;

describe("ask send boundary", () => {
  it("accepts a created or replayed ask and normalizes optional fields", () => {
    expect(parseSentAsk({ requestId: 9, companyDomain: "wipro.com", coverageStatus: "covered", slots, extra: true })).toEqual({ requestId: 9, companyDomain: "wipro.com", waitingForCoverage: false, fastTrack: false, firstLook: false, slots });
    expect(parseSentAsk({ requestId: 12, companyDomain: " ", coverageStatus: "waiting_for_company_coverage" })).toEqual({ requestId: 12, companyDomain: null, waitingForCoverage: true, fastTrack: false, firstLook: false, slots: null });
    // A malformed slot count hides the line; it never blocks confirming a created ask.
    expect(parseSentAsk({ requestId: 3, companyDomain: null, slots: { open: "3" } })).toEqual({ requestId: 3, companyDomain: null, waitingForCoverage: false, fastTrack: false, firstLook: false, slots: null });
    // A personal-link ask (D-017) is flagged so the sent screen names who will see it; anything but true reads as false.
    expect(parseSentAsk({ requestId: 14, companyDomain: "tcs.com", coverageStatus: "covered", fastTrack: true })).toEqual({ requestId: 14, companyDomain: "tcs.com", waitingForCoverage: false, fastTrack: true, firstLook: false, slots: null });
    expect(parseSentAsk({ requestId: 15, companyDomain: "tcs.com", fastTrack: "yes" })).toEqual({ requestId: 15, companyDomain: "tcs.com", waitingForCoverage: false, fastTrack: false, firstLook: false, slots: null });
    // A post-bound ask (D-022/D-174) is flagged so the sent screen can say the poster sees it first; anything but true reads as an ordinary pool ask.
    expect(parseSentAsk({ requestId: 16, companyDomain: "tcs.com", coverageStatus: "covered", firstLook: true })).toEqual({ requestId: 16, companyDomain: "tcs.com", waitingForCoverage: false, fastTrack: false, firstLook: true, slots: null });
    expect(parseSentAsk({ requestId: 17, companyDomain: "tcs.com", firstLook: "yes" })).toEqual({ requestId: 17, companyDomain: "tcs.com", waitingForCoverage: false, fastTrack: false, firstLook: false, slots: null });
  });

  it("rejects payloads that do not prove an ask was created", () => {
    for (const payload of [{}, { requestId: "9" }, { requestId: 0 }, { requestId: 1.5 }, { error: "nope" }]) expect(parseSentAsk(payload)).toBeNull();
  });

  it("recognizes only the typed 409 slot-cap refusal", () => {
    const body = { error: "All 3 slots are in use. Wait for an answer, withdraw an ask, or get more slots with Momentum (15).", code: "slot_cap_reached", slots };
    expect(parseSlotCapReached(409, body)).toEqual(body);
    expect(parseSlotCapReached(400, body)).toBeNull();
    expect(parseSlotCapReached(409, { error: "This submission key was already used for a different referral request" })).toBeNull();
    expect(parseSlotCapReached(409, { ...body, slots: { ...slots, cap: "3" } })).toBeNull();
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
