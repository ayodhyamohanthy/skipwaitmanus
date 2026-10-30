import { describe, expect, it } from "vitest";
import {
  ASK_INVITE_RESERVATION_MS,
  ASK_INVITE_STATE_COPY,
  ASK_INVITE_TTL_MS,
  ASK_INVITE_TOKEN_PATTERN,
  ASK_INVITE_WEEKLY_CAP,
  askInviteActiveRequestKey,
  askInviteLandingResponseSchema,
  askInviteLandingSchema,
  askInviteMineSchema,
} from "./askInvites";

describe("D-090 BYOR contract", () => {
  it("pins the changeable knobs the decision names", () => {
    expect(ASK_INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(ASK_INVITE_RESERVATION_MS).toBe(ASK_INVITE_TTL_MS);
    expect(ASK_INVITE_WEEKLY_CAP).toBe(5);
  });

  it("accepts a 43-character base64url token and nothing else", () => {
    expect(ASK_INVITE_TOKEN_PATTERN.test("A".repeat(43))).toBe(true);
    expect(ASK_INVITE_TOKEN_PATTERN.test("a-b_c".repeat(8) + "a-b")).toBe(true);
    expect(ASK_INVITE_TOKEN_PATTERN.test("a".repeat(42))).toBe(false);
    expect(ASK_INVITE_TOKEN_PATTERN.test("a".repeat(44))).toBe(false);
    // Standard base64 padding and the "+" / "/" alphabet are not base64url.
    expect(ASK_INVITE_TOKEN_PATTERN.test("a".repeat(42) + "=")).toBe(false);
    expect(ASK_INVITE_TOKEN_PATTERN.test("+".repeat(43))).toBe(false);
    expect(ASK_INVITE_TOKEN_PATTERN.test("/".repeat(43))).toBe(false);
  });

  it("keys at most one live link per ask", () => {
    expect(askInviteActiveRequestKey(42)).toBe("link:42");
  });

  it("keeps the My asks line to a state and two dates", () => {
    const parsed = askInviteMineSchema.parse({ state: "active", createdAt: "2026-10-23T00:00:00.000Z", expiresAt: "2026-10-30T00:00:00.000Z", token: "leak" });
    expect(Object.keys(parsed).sort()).toEqual(["createdAt", "expiresAt", "state"]);
    expect(askInviteMineSchema.safeParse({ state: "nope", createdAt: "", expiresAt: "" }).success).toBe(false);
  });

  it("drops an unknown field on the landing payload instead of failing", () => {
    const parsed = askInviteLandingSchema.parse({
      state: "open", companyName: "Acme", roleTitle: "Designer", jobFunction: "Design",
      workMode: "Remote", location: "Pune", note: "a note", lockedFileCount: 2, seekerName: "should not survive",
    });
    expect(parsed).not.toHaveProperty("seekerName");
    expect(parsed.lockedFileCount).toBe(2);
  });

  it("reads an unparseable landing response as unavailable rather than crashing the page", () => {
    expect(askInviteLandingResponseSchema.parse({ invite: { state: "open" } }).invite.state).toBe("unavailable");
    expect(askInviteLandingResponseSchema.parse(undefined).invite.state).toBe("unavailable");
  });

  it("has one plain sentence for every landing state", () => {
    for (const state of ["open", "claimed_by_you", "used", "expired", "revoked", "closed", "unavailable"] as const) {
      expect(ASK_INVITE_STATE_COPY[state].length).toBeGreaterThan(10);
    }
  });
});
