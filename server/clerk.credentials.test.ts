import { describe, expect, it } from "vitest";

const clerkSecretKey = process.env.CLERK_SECRET_KEY;

describe.skipIf(!clerkSecretKey)("Clerk credentials", () => {
  it("authenticates against the Clerk instance endpoint", async () => {
    const response = await fetch("https://api.clerk.com/v1/instance", {
      headers: { Authorization: `Bearer ${clerkSecretKey}` },
    });
    expect(response.ok).toBe(true);
  }, 15_000);
});
