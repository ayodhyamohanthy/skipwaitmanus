import { describe, expect, it } from "vitest";
import { askRedirectTarget, fastTrackAskFields } from "./fastTrackHandoff";

describe("fast-track ask hand-off (D-017)", () => {
  it("carries a Fast-Track link code", () => {
    expect(fastTrackAskFields("?fast=abc-123-xyz-456")).toEqual({ fastTrackCode: "abc-123-xyz-456" });
  });

  it("carries a vanity referral link", () => {
    expect(fastTrackAskFields("?referCompany=acme&referAlias=avery")).toEqual({
      fastTrackCompanySlug: "acme",
      fastTrackAlias: "avery",
    });
  });

  it("never carries two links at once", () => {
    expect(fastTrackAskFields("?fast=abc-123-xyz-456&referCompany=acme&referAlias=avery")).toEqual({
      fastTrackCode: "abc-123-xyz-456",
    });
  });

  it("carries nothing without a complete link", () => {
    expect(fastTrackAskFields("?referCompany=acme")).toEqual({});
    expect(fastTrackAskFields("")).toEqual({});
  });

  it("keeps the referral-link parameters on the /request → /ask redirect", () => {
    expect(askRedirectTarget("?fast=abc-123-xyz-456")).toBe("/ask?fast=abc-123-xyz-456");
    expect(askRedirectTarget("?referCompany=acme&referAlias=avery")).toBe("/ask?referCompany=acme&referAlias=avery");
    expect(askRedirectTarget("")).toBe("/ask");
  });
});
