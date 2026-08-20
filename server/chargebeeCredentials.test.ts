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

describe("configured Chargebee credentials", () => {
  it("authenticates against the Chargebee test-site events endpoint", async () => {
    const apiKey = process.env.CHARGEBEE_API_KEY;
    expect(apiKey, "CHARGEBEE_API_KEY must be configured").toBeTruthy();

    const authorization = Buffer.from(`${apiKey}:`).toString("base64");
    const response = await chargebeeCredentialRead("https://skipwait-test.chargebee.com/api/v2/events?limit=1", authorization);

    expect(response.status).toBe(200);
  }, 35_000);
});
