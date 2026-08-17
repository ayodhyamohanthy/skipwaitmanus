import { describe, expect, it } from "vitest";

describe("configured Chargebee credentials", () => {
  it("authenticates against the Chargebee test-site events endpoint", async () => {
    const apiKey = process.env.CHARGEBEE_API_KEY;
    expect(apiKey, "CHARGEBEE_API_KEY must be configured").toBeTruthy();

    const authorization = Buffer.from(`${apiKey}:`).toString("base64");
    const response = await fetch(
      "https://skipwait-test.chargebee.com/api/v2/events?limit=1",
      { headers: { Authorization: `Basic ${authorization}` } },
    );

    expect(response.status).toBe(200);
  }, 15_000);
});
