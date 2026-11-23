// @vitest-environment node
// BANDED-release (D-383 (3)): the TEST-site international-card runner must be safe to run in CI. These tests pin the
// guards that keep it off the live site, out of the live key and out of the logs, and pin the workflow that runs it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CURRENCY, DEMO_PASSWORD_ENV, DEMO_SEEKER_EMAIL, HANDSHAKE_PLAN_LABEL, INTERNATIONAL_TEST_CARDS, KEY_ENV, PLAN, PRODUCTION_ORIGIN, SITE,
  apiKeyOf, cardOf, handshake, markdownOf, parseMode, probe, readBack, readLiveOffer, redactor, summaryOf,
} from "./bandedTestCardQa";

const root = path.resolve(__dirname, "..");
const WORKFLOW = readFileSync(path.join(root, ".github/workflows/banded-test-card-qa.yml"), "utf8");
const KEY = "test_fixture_key_0001";

afterEach(() => vi.unstubAllGlobals());

describe("TEST-site guards", () => {
  it("can only ever talk to the Chargebee TEST site", () => {
    expect(SITE).toBe("skipwait-test");
    expect(SITE).not.toMatch(/^skipwait$/);
  });

  it("reads the QA secret, never the live key", () => {
    expect(KEY_ENV).toBe("QA_CHARGEBEE_TEST_API_KEY");
    expect(KEY_ENV).not.toContain("LIVE");
  });

  it("refuses a missing or blank key without echoing anything", () => {
    expect(() => apiKeyOf({})).toThrow(/QA_CHARGEBEE_TEST_API_KEY is not set/);
    expect(() => apiKeyOf({ [KEY_ENV]: "   " })).toThrow(/not set/);
    expect(apiKeyOf({ [KEY_ENV]: ` ${KEY} ` })).toBe(KEY);
  });

  it("redacts the key from every printed line", () => {
    const redact = redactor(KEY);
    expect(redact(`Authorization: Basic ${KEY}`)).toBe("Authorization: Basic [redacted]");
    expect(redact("no secret here")).toBe("no secret here");
  });

  it("redacts a password as well as a key", () => {
    const redact = redactor(KEY, "demo-password-0001");
    expect(redact(`key ${KEY} password demo-password-0001`)).toBe("key [redacted] password [redacted]");
  });

  it("accepts only the three modes", () => {
    expect(parseMode(undefined)).toBe("probe");
    expect(parseMode("probe")).toBe("probe");
    expect(parseMode("card")).toBe("card");
    expect(parseMode("handshake")).toBe("handshake");
    expect(() => parseMode("live")).toThrow(/probe, card or handshake/);
  });
});

describe("the runbook's international test cards", () => {
  it("uses the documented international cards and nothing else", () => {
    expect(INTERNATIONAL_TEST_CARDS.map(card => card.number)).toEqual(["4012888888881881", "5555555555554444"]);
    expect(cardOf(0).brand).toBe("Visa");
    expect(cardOf(1).brand).toBe("Mastercard");
    expect(() => cardOf(2)).toThrow(/no international test card/);
  });
});

describe("probe", () => {
  const credentials = { site: SITE, apiKey: KEY };
  const usdId = "skipwait_early_to_mid_monthly-USD";

  function stubFetch(prices: { id: string; currency_code: string; price: number; status: string }[]) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/items?")) return new Response(JSON.stringify({ list: [{ item: { id: "skipwait_early_to_mid" } }] }), { status: 200 });
      if (String(url).includes("/item_prices?")) return new Response(JSON.stringify({ list: prices.map(price => ({ item_price: price })) }), { status: 200 });
      return new Response("{}", { status: 404 });
    }));
  }

  it("passes when the USD item price matches the frozen book", async () => {
    stubFetch([{ id: usdId, currency_code: "USD", price: 449, status: "active" }]);
    await expect(probe(credentials)).resolves.toMatchObject({ usdItemPriceId: usdId, usdAmount: 449 });
  });

  it("refuses a missing USD item price", async () => {
    stubFetch([]);
    await expect(probe(credentials)).rejects.toThrow(/no item price/);
  });

  it("refuses a price that drifted from the frozen book", async () => {
    stubFetch([{ id: usdId, currency_code: "USD", price: 999, status: "active" }]);
    await expect(probe(credentials)).rejects.toThrow(/expected USD 449/);
  });

  it("never sends the key anywhere but the TEST site", async () => {
    stubFetch([{ id: usdId, currency_code: "USD", price: 449, status: "active" }]);
    await probe(credentials);
    for (const call of vi.mocked(fetch).mock.calls) expect(String(call[0])).toContain(`https://${SITE}.chargebee.com/`);
  });
});

describe("readBack", () => {
  const credentials = { site: SITE, apiKey: KEY };

  it("proves a paid USD subscription from the provider's own record", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      hosted_page: {
        id: "hp_1", url: "https://skipwait-test.chargebee.com/pages/v4/hp_1", state: "succeeded",
        content: { subscription: { id: "sub_1", status: "active", currency_code: "USD" }, invoice: { id: "inv_1", status: "paid" } },
      },
    }), { status: 200 })));
    await expect(readBack(credentials, "hp_1")).resolves.toMatchObject({ subscriptionId: "sub_1", currencyCode: "USD", invoiceStatus: "paid", paid: true });
  });

  it("refuses a hosted page that created no subscription", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hosted_page: { id: "hp_1", url: "u", state: "not_yet_opened" } }), { status: 200 })));
    await expect(readBack(credentials, "hp_1")).rejects.toThrow(/created no subscription/);
  });
});

describe("summary", () => {
  it("states the result and never a key", () => {
    const summary = summaryOf({
      site: SITE, mode: "card", plan: PLAN, currency: CURRENCY,
      probe: { items: [], usdItemPriceId: "skipwait_early_to_mid_monthly-USD", usdAmount: 449 },
      card: { brand: "Visa", last4: "1881" },
      proof: { hostedPageId: "hp_1", checkoutUrl: "u", subscriptionId: "sub_1", subscriptionStatus: "active", currencyCode: "USD", invoiceId: "inv_1", invoiceStatus: "paid", paid: true },
      cancelled: true, ok: true, reason: "paid",
    });
    const markdown = markdownOf(summary);
    expect(markdown).toContain("PASS");
    expect(markdown).toContain("sub_1");
    expect(markdown).toContain("Visa ending 1881");
    expect(markdown).not.toContain(KEY);
  });
});

describe("the live handshake", () => {
  const PASSWORD = "demo-seeker-password-0001";

  function fakeBrowser({ signInStatus = 200, buyLabel = "Buy Early to Mid", finalUrl = "https://skipwait.chargebee.com/pages/v4/hp_1" } = {}) {
    const calls: string[] = [];
    const button = { textContent: async () => buyLabel, click: async () => { calls.push("CLICK buy"); } };
    const page = {
      context: () => ({ request: { post: async (url: string, init: { data?: unknown }) => { calls.push(`POST ${url} ${JSON.stringify(init.data)}`); return { status: () => signInStatus }; } } }),
      setViewportSize: async () => undefined,
      goto: async (url: string) => { calls.push(`GOTO ${url}`); },
      waitForLoadState: async () => undefined,
      evaluate: async () => false,
      getByRole: (role: string, options: { name?: string }) => {
        calls.push(`ROLE ${role} ${options.name ?? ""}`);
        return { getByRole: () => button };
      },
      waitForURL: async () => undefined,
      url: () => finalUrl,
      title: async () => "SkipWait checkout",
    };
    return { calls, launch: async () => ({ newPage: async () => page, close: async () => undefined }) };
  }

  const deps = (browser: ReturnType<typeof fakeBrowser>) => ({
    launch: browser.launch,
    screenshot: async () => undefined,
    log: () => undefined,
  });

  it("reads the live offer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onSale: true }), { status: 200 })));
    await expect(readLiveOffer()).resolves.toEqual({ onSale: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onSale: false }), { status: 200 })));
    await expect(readLiveOffer()).resolves.toEqual({ onSale: false });
  });

  it("refuses to handshake while the live offer is off sale", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onSale: false }), { status: 200 })));
    const browser = fakeBrowser();
    await expect(handshake(deps(browser), PASSWORD)).rejects.toThrow(/not on sale yet/);
    expect(browser.calls).toEqual([]);
  });

  it("signs in as the demo seeker and opens the hosted page without paying", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onSale: true }), { status: 200 })));
    const browser = fakeBrowser();
    const proof = await handshake(deps(browser), PASSWORD);
    expect(proof).toMatchObject({ offerOnSale: true, buyLabel: "Buy Early to Mid", hostedPageHost: "skipwait.chargebee.com", paid: false });
    expect(proof.plansCaptured).toEqual(["plans-1280.png", "plans-390.png"]);
    expect(browser.calls).toContain(`POST ${PRODUCTION_ORIGIN}/api/auth/reviewer/sign-in ${JSON.stringify({ email: DEMO_SEEKER_EMAIL, password: PASSWORD })}`);
    expect(browser.calls).toContain(`ROLE region ${HANDSHAKE_PLAN_LABEL}`);
    expect(browser.calls).toContain("CLICK buy");
    // Nothing is ever paid: no request goes to a payment endpoint.
    expect(browser.calls.filter(call => /pay|charge|purchase/i.test(call))).toEqual([]);
  });

  it("refuses a sign-in that does not answer 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onSale: true }), { status: 200 })));
    await expect(handshake(deps(fakeBrowser({ signInStatus: 401 })), PASSWORD)).rejects.toThrow(/sign-in answered 401/);
  });

  it("refuses a Buy that leaves the site for something other than Chargebee", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onSale: true }), { status: 200 })));
    await expect(handshake(deps(fakeBrowser({ finalUrl: "https://example.com/pay" })), PASSWORD)).rejects.toThrow(/not a Chargebee hosted page/);
  });

  it("pins the demo account and its secret name", () => {
    expect(DEMO_SEEKER_EMAIL).toBe("seeker@reviewer.skipwait.me");
    expect(DEMO_PASSWORD_ENV).toBe("REVIEWER_SEEKER_PASSWORD");
    expect(PRODUCTION_ORIGIN).toBe("https://skipwait.me");
  });
});

describe("the workflow", () => {
  it("never runs on push or pull_request", () => {
    expect(WORKFLOW).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(WORKFLOW).not.toMatch(/^\s*push:/m);
    expect(WORKFLOW).not.toMatch(/^\s*pull_request:/m);
  });

  it("masks the key and the demo password before use and reads them only through env", () => {
    expect(WORKFLOW).toContain("::add-mask::$QA_KEY");
    expect(WORKFLOW).toContain("::add-mask::$DEMO_PASSWORD");
    expect(WORKFLOW).toContain("QA_CHARGEBEE_TEST_API_KEY: ${{ secrets.QA_CHARGEBEE_TEST_API_KEY }}");
    expect(WORKFLOW).toContain("REVIEWER_SEEKER_PASSWORD: ${{ secrets.REVIEWER_SEEKER_PASSWORD }}");
    expect(WORKFLOW).not.toMatch(/QA_CHARGEBEE_TEST_API_KEY=\S/);
    expect(WORKFLOW).not.toMatch(/REVIEWER_SEEKER_PASSWORD=\S/);
  });

  it("offers the three modes and uploads the evidence", () => {
    expect(WORKFLOW).toContain("options: [probe, card, handshake]");
    expect(WORKFLOW).toContain("actions/upload-artifact@v4");
    expect(WORKFLOW).toContain("path: banded-qa/");
    expect(WORKFLOW).toContain('scripts/bandedTestCardQa.ts "${{ inputs.mode }}"');
  });
});
