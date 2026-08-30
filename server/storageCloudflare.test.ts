import { describe, expect, it } from "vitest";

describe("Cloudflare R2 storage configuration gate", () => {
  it("reports not-configured until all four R2 variables are present", async () => {
    const previous = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].map(key => [key, process.env[key]] as const);
    previous.forEach(([key]) => { delete process.env[key]; });
    const mod = await import("./storageCloudflare");
    expect(mod.r2Configured()).toBe(false);
    expect(() => { void mod.storagePut("x", Buffer.from("y")); }).toThrow(/R2 storage is not configured/);
    previous.forEach(([key, value]) => { if (value !== undefined) process.env[key] = value; });
  });
});
