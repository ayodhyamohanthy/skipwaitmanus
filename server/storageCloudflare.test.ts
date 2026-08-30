import { describe, expect, it } from "vitest";

describe("Cloudflare R2 storage configuration gate", () => {
  it("reports not-configured until all four R2 variables are present", async () => {
    const previous = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].map(key => [key, process.env[key]] as const);
    previous.forEach(([key]) => { delete process.env[key]; });
    const mod = await import("./storageCloudflare");
    expect(mod.r2Configured()).toBe(false);
    // storagePut is async: the rejection surfaces as a rejected promise, not a sync throw.
    await expect(mod.storagePut("x", Buffer.from("y"))).rejects.toThrow(/R2 storage is not configured/);
    previous.forEach(([key, value]) => { if (value !== undefined) process.env[key] = value; });
  });
});
