#!/usr/bin/env node
// BANDED-release (D-383 (3), D-370 (6)): reproducible international TEST-card evidence.
//
// D-383 withdrew the earlier PASS entries in docs/qa/banded-release-qa.md because they had no linked run, log or
// artifact. This runner produces that missing evidence on the Chargebee TEST site only: it opens the app's own
// banded hosted page for a USD plan and pays it with the runbook's international test card, then reads the
// subscription and invoice back from the provider. It never touches the live site, never charges real money and
// never prints the API key.
//
// Usage: pnpm exec tsx scripts/bandedTestCardQa.ts [probe|card]
//   probe (default) read-only: the banded items and USD item prices exist on the TEST site.
//   card            probe, then create a USD hosted page, pay it with the international test card and verify.
// Output: banded-qa/summary.json plus screenshots; a Markdown table in $GITHUB_STEP_SUMMARY.
// Exit 0 when the requested mode is proven, 1 otherwise.
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createBandedPlanPage } from "../server/bandedCheckoutProvider";
import { bandedPlanItemPriceId } from "../shared/bandedCatalog";
import { PLAN_FAMILY, planFeeMinor } from "../shared/planFamily";

/** The only site this runner may talk to. Deliberately not configurable: a live site would charge real money. */
export const SITE = "skipwait-test";

/** The repository secret holding the TEST-site API key. The live key is never read. */
export const KEY_ENV = "QA_CHARGEBEE_TEST_API_KEY";

/** The plan and currency this evidence covers: the first banded plan, USD presentment (D-367 (2)). */
export const PLAN = "early_to_mid" as const;
export const CURRENCY = "USD" as const;

/** docs/PAYMENTS_TEST_RUNBOOK.md section 2a: international / export presentment test cards. */
export const INTERNATIONAL_TEST_CARDS = Object.freeze([
  Object.freeze({ brand: "Visa", number: "4012888888881881" }),
  Object.freeze({ brand: "Mastercard", number: "5555555555554444" }),
]);

export const OUTPUT_DIR = "banded-qa";
const NAV_TIMEOUT_MS = 45_000;

export type Mode = "probe" | "card";

export function parseMode(value: string | undefined): Mode {
  const mode = value || "probe";
  if (mode === "probe" || mode === "card") return mode;
  throw new Error(`mode must be probe or card, not "${mode}"`);
}

/** The API key, or a plain refusal. The value is never returned in an error message. */
export function apiKeyOf(env: NodeJS.ProcessEnv): string {
  const key = env[KEY_ENV];
  if (!key || key.trim().length === 0) throw new Error(`${KEY_ENV} is not set: the TEST-site key lives in the repository secret of that name`);
  return key.trim();
}

/** Every line this runner prints passes through here, so a key can never reach a log or the step summary. */
export function redactor(secret: string): (line: string) => string {
  return line => (secret ? line.split(secret).join("[redacted]") : line);
}

/** The card the run pays with: the first runbook card, overridable only by index for a retry. */
export function cardOf(index = 0) {
  const card = INTERNATIONAL_TEST_CARDS[index];
  if (!card) throw new Error(`no international test card at index ${index}`);
  return card;
}

/** A future expiry and any 3-digit CVV, as the runbook allows for these test cards. */
export const CARD_EXPIRY = "12/30";
export const CARD_CVV = "123";

export type ProbeResult = { items: string[]; usdItemPriceId: string; usdAmount: number };

type Credentials = { site: string; apiKey: string };

async function chargebeeGet(credentials: Credentials, requestPath: string): Promise<unknown> {
  const response = await fetch(`https://${credentials.site}.chargebee.com/api/v2${requestPath}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${credentials.apiKey}:`).toString("base64")}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Chargebee GET ${requestPath} answered ${response.status}`);
  return response.json();
}

/** Read-only: the banded items exist and the USD item price matches the frozen book. */
export async function probe(credentials: Credentials): Promise<ProbeResult> {
  const items = (await chargebeeGet(credentials, "/items?limit=100")) as { list?: { item: { id: string } }[] };
  const ids = (items.list ?? []).map(entry => entry.item.id);
  const usdItemPriceId = bandedPlanItemPriceId(PLAN, CURRENCY);
  const prices = (await chargebeeGet(credentials, `/item_prices?item_id[is]=skipwait_${PLAN}&limit=100`)) as {
    list?: { item_price: { id: string; currency_code: string; price: number; status: string } }[];
  };
  const usd = (prices.list ?? []).map(entry => entry.item_price).find(price => price.id === usdItemPriceId);
  if (!usd) throw new Error(`the TEST site has no item price ${usdItemPriceId}`);
  const expected = planFeeMinor(PLAN, CURRENCY);
  if (usd.currency_code !== CURRENCY || usd.price !== expected) {
    throw new Error(`the TEST site price ${usdItemPriceId} is ${usd.currency_code} ${usd.price}, expected ${CURRENCY} ${expected}`);
  }
  return { items: ids, usdItemPriceId, usdAmount: expected };
}

export type CardProof = {
  hostedPageId: string;
  checkoutUrl: string;
  subscriptionId: string;
  subscriptionStatus: string;
  currencyCode: string;
  invoiceId: string | null;
  invoiceStatus: string | null;
  paid: boolean;
};

/** Read the provider's own record of what the hosted page created. */
export async function readBack(credentials: Credentials, hostedPageId: string): Promise<CardProof> {
  const page = (await chargebeeGet(credentials, `/hosted_pages/${encodeURIComponent(hostedPageId)}`)) as {
    hosted_page: { id: string; url: string; state?: string; content?: { subscription?: { id: string; status: string; currency_code: string }; invoice?: { id: string; status: string } } };
  };
  const subscription = page.hosted_page.content?.subscription;
  if (!subscription) throw new Error(`hosted page ${hostedPageId} created no subscription (state ${page.hosted_page.state ?? "unknown"})`);
  const invoice = page.hosted_page.content?.invoice;
  return {
    hostedPageId,
    checkoutUrl: page.hosted_page.url,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    currencyCode: subscription.currency_code,
    invoiceId: invoice?.id ?? null,
    invoiceStatus: invoice?.status ?? null,
    paid: invoice?.status === "paid" || ["active", "in_trial"].includes(subscription.status),
  };
}

/** Cancel the TEST-site subscription this run created, so the test site does not accumulate QA subscriptions. */
export async function cancelTestSubscription(credentials: Credentials, subscriptionId: string): Promise<void> {
  const response = await fetch(`https://${credentials.site}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(subscriptionId)}/cancel_for_items`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${credentials.apiKey}:`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ cancel_reason_code: "not_needed" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`cancel of ${subscriptionId} answered ${response.status}`);
}

/** Fill the Chargebee hosted card form. Selectors are tried in order because the hosted page is provider-owned. */
const FIELD_SELECTORS = {
  number: ['input[name="card[number]"]', "#card_number", 'input[autocomplete="cc-number"]', 'input[name*="number"]'],
  expiry: ['input[name="card[expiry_date]"]', "#card_expiry", 'input[autocomplete="cc-exp"]', 'input[name*="expiry"]'],
  cvv: ['input[name="card[cvv]"]', "#card_cvv", 'input[autocomplete="cc-csc"]', 'input[name*="cvv"]'],
  name: ['input[name="card[first_name]"]', "#card_first_name", 'input[name*="first_name"]'],
} as const;

async function fillFirst(page: import("playwright").Page, selectors: readonly string[], value: string): Promise<string | null> {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if (await field.count()) {
      await field.fill(value);
      return selector;
    }
  }
  return null;
}

export type CardRunDeps = {
  launch: () => Promise<{ newPage: () => Promise<import("playwright").Page>; close: () => Promise<void> }>;
  screenshot: (page: import("playwright").Page, name: string) => Promise<void>;
  log: (line: string) => void;
};

/** Pay the hosted page with the international test card and prove the provider recorded it. */
export async function payHostedPage(deps: CardRunDeps, checkoutUrl: string, card: { brand: string; number: string }): Promise<{ filled: string[]; finalUrl: string }> {
  const browser = await deps.launch();
  try {
    const page = await browser.newPage();
    await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await deps.screenshot(page, "01-hosted-page");
    const filled: string[] = [];
    for (const [field, selectors] of Object.entries(FIELD_SELECTORS)) {
      const value = field === "number" ? card.number : field === "expiry" ? CARD_EXPIRY : field === "cvv" ? CARD_CVV : "SkipWait QA";
      const used = await fillFirst(page, selectors, value);
      if (used) filled.push(`${field}=${used}`);
    }
    if (!filled.some(entry => entry.startsWith("number="))) {
      const html = await page.content();
      await writeFile(path.join(OUTPUT_DIR, "hosted-page.html"), html);
      throw new Error("the hosted page showed no card-number field; banded-qa/hosted-page.html records what it did show");
    }
    await deps.screenshot(page, "02-card-filled");
    const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Pay")').first();
    await submit.click({ timeout: NAV_TIMEOUT_MS });
    // Razorpay's mock 3DS page asks for Success; a real gateway would redirect on its own.
    const success = page.locator('button:has-text("Success"), input[value="Success"], button:has-text("SUCCESS")').first();
    if (await success.count()) {
      await deps.screenshot(page, "03-3ds");
      await success.click({ timeout: NAV_TIMEOUT_MS });
    }
    await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT_MS }).catch(() => undefined);
    await deps.screenshot(page, "04-after-payment");
    return { filled, finalUrl: page.url() };
  } finally {
    await browser.close();
  }
}

export type Summary = {
  site: string;
  mode: Mode;
  plan: string;
  currency: string;
  probe: ProbeResult | null;
  card: { brand: string; last4: string } | null;
  proof: CardProof | null;
  cancelled: boolean;
  ok: boolean;
  reason: string;
};

export function summaryOf(input: Omit<Summary, "ok" | "reason"> & { ok: boolean; reason: string }): Summary {
  return input;
}

export function markdownOf(summary: Summary): string {
  const rows = [
    `| Site | \`${summary.site}\` |`,
    `| Mode | ${summary.mode} |`,
    `| Plan / currency | ${summary.plan} / ${summary.currency} |`,
    `| USD item price | ${summary.probe ? `\`${summary.probe.usdItemPriceId}\` = ${summary.probe.usdAmount} minor units` : "not probed"} |`,
    `| Card | ${summary.card ? `${summary.card.brand} ending ${summary.card.last4}` : "not charged"} |`,
    `| Subscription | ${summary.proof ? `\`${summary.proof.subscriptionId}\` (${summary.proof.subscriptionStatus}, ${summary.proof.currencyCode})` : "none"} |`,
    `| Invoice | ${summary.proof?.invoiceId ? `\`${summary.proof.invoiceId}\` (${summary.proof.invoiceStatus})` : "none"} |`,
    `| QA subscription cancelled | ${summary.cancelled ? "yes" : "no"} |`,
    `| Result | ${summary.ok ? "PASS" : `FAIL: ${summary.reason}`} |`,
  ];
  return ["### Banded TEST-site international-card QA", "", "| Check | Value |", "|---|---|", ...rows, ""].join("\n");
}

async function main(): Promise<number> {
  const mode = parseMode(process.argv[2]);
  const key = apiKeyOf(process.env);
  const redact = redactor(key);
  const log = (line: string) => console.log(redact(line));
  const credentials: Credentials = { site: SITE, apiKey: key };
  await mkdir(OUTPUT_DIR, { recursive: true });

  const summary: Summary = { site: SITE, mode, plan: PLAN, currency: CURRENCY, probe: null, card: null, proof: null, cancelled: false, ok: false, reason: "" };
  try {
    summary.probe = await probe(credentials);
    log(`probe: ${summary.probe.usdItemPriceId} = ${summary.probe.usdAmount} minor units on ${SITE}`);
    if (mode === "probe") {
      summary.ok = true;
      summary.reason = "read-only probe passed";
    } else {
      const card = cardOf();
      const checkoutIntentId = `banded-qa-${randomUUID()}`;
      const page = await createBandedPlanPage(credentials, {
        itemPriceId: summary.probe.usdItemPriceId,
        billingCountry: "INTL",
        checkoutIntentId,
        idempotencyKey: checkoutIntentId,
        redirectUrl: "https://skipwait.me/plans",
        cancelUrl: "https://skipwait.me/plans",
        email: `banded-qa+${Date.now()}@skipwait.me`,
        firstName: "SkipWait",
        lastName: "QA",
      });
      log(`hosted page ${page.hostedPageId} created for ${summary.probe.usdItemPriceId}`);
      const { chromium } = await import("playwright");
      const run = await payHostedPage({
        launch: async () => {
          const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
          return {
            newPage: async () => {
              const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
              return context.newPage();
            },
            close: () => browser.close(),
          };
        },
        screenshot: async (page, name) => { await page.screenshot({ path: path.join(OUTPUT_DIR, `${name}.png`), fullPage: true }); },
        log,
      }, page.checkoutUrl, card);
      log(`card form filled: ${run.filled.join(", ")}; final URL ${run.finalUrl}`);
      summary.card = { brand: card.brand, last4: card.number.slice(-4) };
      summary.proof = await readBack(credentials, page.hostedPageId);
      log(`provider record: ${summary.proof.subscriptionId} ${summary.proof.subscriptionStatus} ${summary.proof.currencyCode}, invoice ${summary.proof.invoiceId ?? "none"} ${summary.proof.invoiceStatus ?? ""}`);
      if (!summary.proof.paid || summary.proof.currencyCode !== CURRENCY) {
        throw new Error(`the provider did not record a paid ${CURRENCY} subscription (status ${summary.proof.subscriptionStatus}, invoice ${summary.proof.invoiceStatus ?? "none"})`);
      }
      await cancelTestSubscription(credentials, summary.proof.subscriptionId);
      summary.cancelled = true;
      summary.ok = true;
      summary.reason = "international TEST card paid a USD banded plan and the provider recorded it";
    }
  } catch (error) {
    summary.reason = redact(error instanceof Error ? error.message : String(error));
    log(`FAIL: ${summary.reason}`);
  }

  await writeFile(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  const markdown = markdownOf(summary);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  return summary.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().then(code => process.exit(code)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
