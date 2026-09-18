import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTalentConsentPreview, TALENT_CONSENT_POLICY_VERSION } from "./db";

describe("talent-market consent and grants", () => {
  it("requires explicit versioned consent and describes paid access before opt-in", () => {
    const preview = getTalentConsentPreview();
    expect(preview.policyVersion).toBe(TALENT_CONSENT_POLICY_VERSION);
    expect(preview.paidUnlockInvolved).toBe(true);
    expect(preview.availableFields).toEqual(expect.arrayContaining(["headline", "location", "skills", "experience"]));
    expect(preview.audience).toMatch(/approved employers/i);
    expect(preview.contactFlow).toMatch(/seeker chooses/i);
  });

  it("keeps default-off, revoke, expiry, active-account and snapshot gates in source", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(schema).toContain('anonymityOptIn: boolean("anonymityOptIn").default(false)');
    for (const gate of ["consentId", "policyVersion", "profileSnapshot", "expiresAt", "revokedAt", "employerCompanyName"]) expect(schema).toContain(gate);
    expect(db).toContain('reason: "consent_withdrawn"');
    expect(db).toContain("eq(users.suspended,false)");
    const migration = readFileSync(new URL("../drizzle/0052_talent_consent_entitlements.sql", import.meta.url), "utf8");
    expect(migration).toContain("historic_pair_without_scoped_consent");
    expect(db).not.toContain("return {...profile[0]");
  });

  it("has a preview-before-grant UI and warns that re-opt-in restores nothing", () => {
    const settings = readFileSync(new URL("../client/src/pages/Settings.tsx", import.meta.url), "utf8");
    expect(settings).toContain("I reviewed this preview - opt in");
    expect(settings).toContain("does not restore old employer access");
    expect(settings).toContain("Opt out and revoke access");
  });
});
