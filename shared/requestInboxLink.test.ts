import { describe, expect, it } from "vitest";
import {
  GENERATED_SCREEN_NAME_PREFIX,
  LINK_LANDING_PRIVACY_LINE,
  REQUEST_INBOX_LINK_ENABLED,
  SCREEN_NAME_REFUSALS,
  inboxDirectFlagSchema,
  isIdentifyingScreenName,
  isSafeFastTrackAlias,
  linkLandingGoalLine,
  normalizeScreenName,
  publicReferralLinkSchema,
  publicScreenName,
  screenNameInputSchema,
} from "./requestInboxLink";

describe("D-089.server: the request-inbox link switch (D-327 §4.1)", () => {
  it("starts off, so every payload and route is unchanged until the release row flips it", () => {
    expect(REQUEST_INBOX_LINK_ENABLED).toBe(false);
  });
});

describe("screen name normalisation and format (§4.3)", () => {
  it("lower-cases, trims and turns spaces into dashes", () => {
    expect(normalizeScreenName("  Ada Lovelace  ")).toBe("ada-lovelace");
    expect(normalizeScreenName("Backend   Buddy")).toBe("backend-buddy");
  });

  it("accepts 3-30 characters of lower-case letters, numbers and inner dashes", () => {
    expect(isSafeFastTrackAlias("ada-lovelace")).toBe(true);
    expect(isSafeFastTrackAlias("abc")).toBe(true);
    expect(isSafeFastTrackAlias("a1b2c3")).toBe(true);
    expect(isSafeFastTrackAlias("a".repeat(30))).toBe(true);
  });

  it("refuses a reserved word, a too-short or too-long name, and edge dashes", () => {
    for (const reserved of ["admin", "api", "auth", "fast", "inbox", "login", "notifications", "refer", "request", "settings", "start"]) {
      expect(isSafeFastTrackAlias(reserved), reserved).toBe(false);
    }
    expect(isSafeFastTrackAlias("ab")).toBe(false);
    expect(isSafeFastTrackAlias("a".repeat(31))).toBe(false);
    expect(isSafeFastTrackAlias("-ada")).toBe(false);
    expect(isSafeFastTrackAlias("ada-")).toBe(false);
    expect(isSafeFastTrackAlias("ada lovelace")).toBe(false);
    expect(isSafeFastTrackAlias("ada@example.com")).toBe(false);
  });

  it("keeps the generated ref- form valid so the resolvers still accept it", () => {
    expect(isSafeFastTrackAlias(`${GENERATED_SCREEN_NAME_PREFIX}a1b2c3d4e5`)).toBe(true);
  });
});

describe("the real-name check (§4.3)", () => {
  const identity = { fullName: "Ada Lovelace", workEmail: "ada.lovelace@acme-corp.com" };

  it("refuses the slug of the person's own name", () => {
    expect(isIdentifyingScreenName("ada-lovelace", identity)).toBe(true);
    expect(isIdentifyingScreenName("Ada Lovelace", identity)).toBe(true);
  });

  it("refuses any single name token of three or more characters", () => {
    expect(isIdentifyingScreenName("ada", identity)).toBe(true);
    expect(isIdentifyingScreenName("lovelace", identity)).toBe(true);
  });

  it("ignores a name token shorter than three characters", () => {
    expect(isIdentifyingScreenName("al", { fullName: "Al Bo", workEmail: "x@acme-corp.com" })).toBe(false);
  });

  it("refuses the work email's local part and its tokens joined by a dash", () => {
    expect(isIdentifyingScreenName("ada.lovelace", identity)).toBe(true);
    expect(isIdentifyingScreenName("ada-lovelace", identity)).toBe(true);
    // The underscore form is refused earlier, by the format check, so it never reaches a route.
    expect(isSafeFastTrackAlias("ada_lovelace")).toBe(false);
  });

  it("allows a name that is not the person's name or email", () => {
    expect(isIdentifyingScreenName("backend-buddy", identity)).toBe(false);
    expect(isIdentifyingScreenName("hiring-help", identity)).toBe(false);
  });

  it("is exact-match only, so a name-like handle that does not match is allowed (§11)", () => {
    expect(isIdentifyingScreenName("ada-l", identity)).toBe(false);
    expect(isIdentifyingScreenName("adalovelace", identity)).toBe(false);
  });

  it("does not treat an empty identity as identifying", () => {
    expect(isIdentifyingScreenName("backend-buddy", {})).toBe(false);
    expect(isIdentifyingScreenName("backend-buddy", { fullName: null, workEmail: null })).toBe(false);
  });
});

describe("request and response contracts (§4.3, §4.6, §4.7)", () => {
  it("accepts only a screenName body and refuses an unknown field", () => {
    expect(screenNameInputSchema.parse({ screenName: "backend-buddy" })).toEqual({ screenName: "backend-buddy" });
    expect(screenNameInputSchema.safeParse({ screenName: "backend-buddy", vanityAlias: "x" }).success).toBe(false);
    expect(screenNameInputSchema.safeParse({}).success).toBe(false);
    expect(screenNameInputSchema.safeParse({ screenName: "" }).success).toBe(false);
  });

  it("parses the public payload and refuses any extra field", () => {
    expect(publicReferralLinkSchema.parse({ companyDomain: "acme-corp.com", isActive: true, screenName: "backend-buddy" }))
      .toEqual({ companyDomain: "acme-corp.com", isActive: true, screenName: "backend-buddy" });
    expect(publicReferralLinkSchema.parse({ companyDomain: "acme-corp.com", isActive: true, screenName: null }))
      .toEqual({ companyDomain: "acme-corp.com", isActive: true, screenName: null });
    expect(publicReferralLinkSchema.safeParse({ companyDomain: "acme-corp.com", isActive: true, screenName: null, referrerId: 7 }).success).toBe(false);
    expect(publicReferralLinkSchema.safeParse({ companyDomain: "acme-corp.com", isActive: false, screenName: null }).success).toBe(false);
  });

  it("parses the inbox marker and refuses any extra field", () => {
    expect(inboxDirectFlagSchema.parse({ askedYouDirectly: true })).toEqual({ askedYouDirectly: true });
    expect(inboxDirectFlagSchema.safeParse({ askedYouDirectly: true, referrerId: 7 }).success).toBe(false);
    expect(inboxDirectFlagSchema.safeParse({ askedYouDirectly: "yes" }).success).toBe(false);
  });

  it("never shows a generated alias as a screen name", () => {
    expect(publicScreenName(`${GENERATED_SCREEN_NAME_PREFIX}a1b2c3d4e5`)).toBeNull();
    expect(publicScreenName("backend-buddy")).toBe("backend-buddy");
  });

  it("carries the three refusal codes and their plain words", () => {
    expect(SCREEN_NAME_REFUSALS.identifying.code).toBe("screen_name_identifying");
    expect(SCREEN_NAME_REFUSALS.taken.code).toBe("screen_name_taken");
    expect(SCREEN_NAME_REFUSALS.invalid.code).toBe("screen_name_invalid");
    for (const refusal of Object.values(SCREEN_NAME_REFUSALS)) expect(refusal.error.length).toBeGreaterThan(20);
  });
});

describe("the seeker landing copy (§4.9)", () => {
  it("names the screen name when there is one and stays anonymous otherwise", () => {
    expect(linkLandingGoalLine("Acme Corp", "backend-buddy")).toBe("Ask backend-buddy, a verified employee at Acme Corp");
    expect(linkLandingGoalLine("Acme Corp", null)).toBe("Ask a verified employee at Acme Corp");
  });

  it("promises only what the code guarantees: no seeker name or file before an accept", () => {
    expect(LINK_LANDING_PRIVACY_LINE).toContain("not your name or files, until they accept");
    expect(LINK_LANDING_PRIVACY_LINE).not.toContain("identity stays private");
  });
});
