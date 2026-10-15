import { describe, expect, it } from "vitest";
import { workEmailStorageKeys } from "./workEmailKey";

describe("work email storage keys (task 3 stage 1)", () => {
  it("keeps plaintext behaviour when the secret is absent", () => {
    expect(workEmailStorageKeys(" Ref@Acme.com ", undefined)).toEqual({ write: "ref@acme.com", read: ["ref@acme.com"] });
    expect(workEmailStorageKeys("ref@acme.com", "")).toEqual({ write: "ref@acme.com", read: ["ref@acme.com"] });
  });
  it("writes an HMAC fingerprint and still reads the plaintext form while the key is set", () => {
    const keys = workEmailStorageKeys("Ref@Acme.com", "test-secret");
    expect(keys.write).toMatch(/^h:[0-9a-f]{64}$/);
    expect(keys.write).not.toContain("acme");
    expect(keys.read).toEqual([keys.write, "ref@acme.com"]);
    expect(workEmailStorageKeys("ref@acme.com", "test-secret").write).toBe(keys.write);
    expect(workEmailStorageKeys("ref@acme.com", "other-secret").write).not.toBe(keys.write);
    expect(keys.write.length).toBeLessThanOrEqual(320);
  });
});
