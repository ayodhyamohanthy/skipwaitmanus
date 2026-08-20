import { describe, expect, it } from "vitest";

async function chargebeeCredentialRead(url: string, authorization: string) {
  let lastTransportError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Authorization: `Basic ${authorization}` }, signal: AbortSignal.timeout(10_000) });
      if (response.status < 500) return response;
    } catch (error) { lastTransportError = error; }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw lastTransportError ?? new Error("Chargebee credential endpoint did not return a response");
}

describe("live Chargebee credential", () => {
  it("authorizes a minimal production item-price read when the live Write Key is configured", async () => {
    const apiKey = process.env.CHARGEBEE_LIVE_API_KEY;
    if (!apiKey) return;

    const response = await chargebeeCredentialRead("https://skipwait.chargebee.com/api/v2/item_prices?limit=1", Buffer.from(`${apiKey}:`).toString("base64"));

    expect(response.status).toBe(200);
  }, 35_000);
});
