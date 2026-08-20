import { describe, expect, it } from "vitest";

describe("live Chargebee credential", () => {
  it("authorizes a minimal production item-price read when the live Write Key is configured", async () => {
    const apiKey = process.env.CHARGEBEE_LIVE_API_KEY;
    if (!apiKey) return;

    const response = await fetch("https://skipwait.chargebee.com/api/v2/item_prices?limit=1", {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
    });

    expect(response.status).toBe(200);
  });
});
