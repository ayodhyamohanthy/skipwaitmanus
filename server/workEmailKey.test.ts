import { describe, expect, it } from "vitest";
import { WORK_EMAIL_FINGERPRINT_PREFIX, workEmailFingerprintSecret, workEmailStorageKeys } from "./workEmailKey";

/*
 * Queue task 3 (work-email-hmac-storage). Stage 1 stored the fingerprint only
 * when WORK_EMAIL_HMAC_KEY was set, so with the secret unset the verification
 * tables still held the plaintext address and the verify aside's "A one-way
 * fingerprint of your email" line was false in production. The fingerprint is
 * now unconditional: the configured key wins, otherwise the key derives from
 * JWT_SECRET with its own domain prefix. Reads always accept the legacy
 * plaintext form, so a code or receipt written before the change still verifies.
 */
describe("work email storage keys (task 3)", () => {
  it("always writes the fingerprint of the normalized address, never the address", () => {
    const keys = workEmailStorageKeys(" Ref@Acme.com ", "test-secret");
    expect(keys.write).toMatch(/^h:[0-9a-f]{64}$/);
    expect(keys.write).not.toContain("acme");
    expect(keys.write).not.toContain("@");
    expect(workEmailStorageKeys("ref@acme.com", "test-secret").write).toBe(keys.write);
    expect(workEmailStorageKeys("ref@acme.com", "other-secret").write).not.toBe(keys.write);
    expect(keys.write.length).toBeLessThanOrEqual(320);
  });

  it("still reads the legacy plaintext form so a code issued before the change verifies", () => {
    const keys = workEmailStorageKeys("Ref@Acme.com", "test-secret");
    expect(keys.read).toEqual([keys.write, "ref@acme.com"]);
  });

  it("stores a fingerprint even when no secret is configured at all", () => {
    const derived = workEmailStorageKeys("Ref@Acme.com", workEmailFingerprintSecret({}));
    expect(derived.write).toMatch(/^h:[0-9a-f]{64}$/);
    expect(derived.write).not.toContain("acme");
    expect(derived.read).toEqual([derived.write, "ref@acme.com"]);
  });

  it("prefers WORK_EMAIL_HMAC_KEY and otherwise derives a domain-separated key from JWT_SECRET", () => {
    expect(workEmailFingerprintSecret({ WORK_EMAIL_HMAC_KEY: " configured-key ", JWT_SECRET: "jwt-secret" })).toBe("work-email:configured-key");
    const fromJwt = workEmailFingerprintSecret({ JWT_SECRET: "jwt-secret" });
    expect(fromJwt).not.toBe(workEmailFingerprintSecret({ JWT_SECRET: "another-secret" }));
    expect(fromJwt).not.toContain("configured-key");
    // A blank key is not a key: an empty deployment value must not silently disable the fingerprint.
    expect(workEmailFingerprintSecret({ WORK_EMAIL_HMAC_KEY: "  ", JWT_SECRET: "jwt-secret" })).toBe(fromJwt);
    // Distinct from the Slack webhook derivation, so one secret never reuses another purpose's key.
    expect(fromJwt).not.toBe("skipwait:slack-webhook:jwt-secret");
  });

  it("names the fingerprint form so a stored value is recognisable without a read", () => {
    expect(WORK_EMAIL_FINGERPRINT_PREFIX).toBe("h:");
    expect(workEmailStorageKeys("ref@acme.com", "test-secret").write.startsWith(WORK_EMAIL_FINGERPRINT_PREFIX)).toBe(true);
  });
});
