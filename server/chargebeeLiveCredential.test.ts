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
  // Opt in explicitly with RUN_EXTERNAL_CREDENTIAL_TESTS=true: this reads the
  // live production site, so it must never run on a plain `pnpm test`.
  it.runIf(process.env.RUN_EXTERNAL_CREDENTIAL_TESTS === "true")("authorizes a minimal production item-price read", async () => {
    const apiKey = process.env.CHARGEBEE_LIVE_API_KEY;
    expect(apiKey, "CHARGEBEE_LIVE_API_KEY must be configured").toBeTruthy();

    const response = await chargebeeCredentialRead("https://skipwait.chargebee.com/api/v2/item_prices?limit=1", Buffer.from(`${apiKey}:`).toString("base64"));

    expect(response.status).toBe(200);
  }, 35_000);
});
