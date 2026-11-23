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
import { applyCatalogSync, buildCatalogSyncDryRun } from "../server/catalogSyncApply";
import { createChargebeeCatalogApi } from "../server/chargebeeCatalogApi";
import { bandedPlanItemPriceId } from "../shared/bandedCatalog";
import { PLAN_FAMILY, planFeeMinor } from "../shared/planFamily";

/** The only site this runner may talk to. Deliberately not configurable: a live site would charge real money. */
export const SITE = "skipwait-test";

/** The repository secret holding the TEST-site API key. The live key is never read. */
export const KEY_ENV = "QA_CHARGEBEE_TEST_API_KEY";

/**
 * The TEST site was provisioned from an older catalog generation, so the app's current item price ids do not exist
 * there and the reviewed apply refuses it (its SkipWait objects span three product families). This is the TEST
 * site's own Early to Mid USD plan price: the same plan, currency, amount and monthly shape under the older id.
 * Setting it proves the provider leg; it does not prove the app's current id, which the live handshake covers.
 */
export const TEST_SITE_ITEM_PRICE_ID_ENV = "QA_TEST_ITEM_PRICE_ID";

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

/** The live origin the handshake runs against. Deliberately not configurable, as in scripts/live-qa-signed-in.mjs. */
export const PRODUCTION_ORIGIN = "https://skipwait.me";

/** The public demo seeker (server/_core/reviewerLogin.ts) and the repository secret holding its password. */
export const DEMO_SEEKER_EMAIL = "seeker@reviewer.skipwait.me";
export const DEMO_PASSWORD_ENV = "REVIEWER_SEEKER_PASSWORD";

/** The plan the handshake buys up to the hosted page. */
export const HANDSHAKE_PLAN_LABEL = "Early to Mid";

export type Mode = "probe" | "provision" | "card" | "handshake";

export function parseMode(value: string | undefined): Mode {
  const mode = value || "probe";
  if (mode === "probe" || mode === "provision" || mode === "card" || mode === "handshake") return mode;
  throw new Error(`mode must be probe, provision, card or handshake, not "${mode}"`);
}

/** The API key, or a plain refusal. The value is never returned in an error message. */
export function apiKeyOf(env: NodeJS.ProcessEnv): string {
  const key = env[KEY_ENV];
  if (!key || key.trim().length === 0) throw new Error(`${KEY_ENV} is not set: the TEST-site key lives in the repository secret of that name`);
  return key.trim();
}

/** Every line this runner prints passes through here, so a key or password can never reach a log or the step summary. */
export function redactor(...secrets: string[]): (line: string) => string {
  const present = secrets.filter(secret => secret.length > 0);
  return line => present.reduce((text, secret) => text.split(secret).join("[redacted]"), line);
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
export async function probe(credentials: Credentials, expectedId = bandedPlanItemPriceId(PLAN, CURRENCY)): Promise<ProbeResult> {
  const items = (await chargebeeGet(credentials, "/items?limit=100")) as { list?: { item: { id: string } }[] };
  const ids = (items.list ?? []).map(entry => entry.item.id);
  const usdItemPriceId = expectedId;
  // List every price and match by id: a filtered query hides what the site actually has when the item is missing.
  const prices = (await chargebeeGet(credentials, "/item_prices?limit=100")) as {
    list?: { item_price: { id: string; item_id: string; currency_code: string; price: number; status: string } }[];
  };
  const all = (prices.list ?? []).map(entry => entry.item_price);
  const usd = all.find(price => price.id === usdItemPriceId);
  if (!usd) {
    const banded = all.filter(price => price.item_id.startsWith("skipwait_")).map(price => `${price.id} (${price.currency_code} ${price.price})`);
    throw new Error(`the TEST site has no item price ${usdItemPriceId}; skipwait prices on it: ${banded.length ? banded.join(", ") : "none"}; items: ${ids.filter(id => id.startsWith("skipwait_")).join(", ") || "none"}`);
  }
  const expected = planFeeMinor(PLAN, CURRENCY);
  if (usd.currency_code !== CURRENCY || usd.price !== expected) {
    throw new Error(`the TEST site price ${usdItemPriceId} is ${usd.currency_code} ${usd.price}, expected ${CURRENCY} ${expected}`);
  }
  return { items: ids, usdItemPriceId, usdAmount: expected };
}

export type ProvisionResult = { planned: number; outcome: string; blocked: number };

/**
 * Create-only: bring the TEST site's banded catalog in line with the frozen source, using the same reviewed
 * dry-run/apply the admin sync uses. It never updates, archives or deletes, and it never touches a subscription,
 * customer, invoice or payment. The TEST site was provisioned from an older catalog generation, so the app's
 * current item price ids did not exist there and the card run could not exercise the real checkout.
 */
export async function provisionTestCatalog(credentials: Credentials): Promise<ProvisionResult> {
  const api = createChargebeeCatalogApi(credentials);
  const site = { site: SITE, environment: "test" as const };
  const dry = await buildCatalogSyncDryRun({ api, site });
  if (dry.blocked.length) {
    throw new Error(`${dry.blocked.length} banded prices are blocked on the TEST site: ${dry.blocked.map(entry => `${entry.itemPriceId}: ${entry.reason}`).join("; ")}`);
  }
  const result = await applyCatalogSync({ planHash: dry.planHash, confirmSite: SITE }, {
    api, site, actorUserId: 0, record: async () => undefined, reportError: () => undefined,
  });
  if (result.status !== "done") throw new Error(`the TEST-site catalog apply was refused: ${result.code} ${result.message}`);
  return { planned: dry.counts.toCreate, outcome: result.report.outcome, blocked: dry.blocked.length };
}

export type CardProof = {  hostedPageId: string;
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
  number: ['input[name="card[number]"]', "#card_number", "#card-number", 'input[autocomplete="cc-number"]', 'input[name*="number"]'],
  expiry: ['input[name="card[expiry_date]"]', "#card_expiry", "#card-expiry", 'input[autocomplete="cc-exp"]', 'input[name*="expiry"]'],
  cvv: ['input[name="card[cvv]"]', "#card_cvv", "#card-cvc", 'input[autocomplete="cc-csc"]', 'input[name*="cvv"]'],
  name: ['input[name="card[first_name]"]', "#card_first_name", 'input[name*="first_name"]'],
} as const;

const ALL_FIELD_SELECTORS = Object.values(FIELD_SELECTORS).flat().join(", ");

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
    try {
      await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      // The hosted page is a client-rendered app: wait for its form before looking for fields.
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
      await deps.screenshot(page, "01-hosted-page");
      // A subscription page opens on its cart first; the card form is one step further.
      const proceed = page.locator('button:has-text("Proceed To Checkout"), button:has-text("Proceed to Checkout"), button:has-text("Proceed")').first();
      if (await proceed.count()) {
        await proceed.click({ timeout: NAV_TIMEOUT_MS });
        await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
        await deps.screenshot(page, "02-checkout-step");
      }
      await page.locator(ALL_FIELD_SELECTORS).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
      const filled: string[] = [];
      for (const [field, selectors] of Object.entries(FIELD_SELECTORS)) {
        const value = field === "number" ? card.number : field === "expiry" ? CARD_EXPIRY : field === "cvv" ? CARD_CVV : "SkipWait QA";
        const used = await fillFirst(page, selectors, value);
        if (used) filled.push(`${field}=${used}`);
      }
      if (!filled.some(entry => entry.startsWith("number="))) {
        const inputs = await page.locator("input").count();
        throw new Error(`the hosted page showed no card-number field (title "${await page.title()}", ${inputs} inputs); banded-qa/hosted-page.html records what it did show`);
      }
      await deps.screenshot(page, "03-card-filled");
      const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Pay")').first();
      await submit.click({ timeout: NAV_TIMEOUT_MS });
      // Razorpay's mock 3DS page asks for Success; a real gateway would redirect on its own.
      const success = page.locator('button:has-text("Success"), input[value="Success"], button:has-text("SUCCESS")').first();
      if (await success.count()) {
        await deps.screenshot(page, "04-3ds");
        await success.click({ timeout: NAV_TIMEOUT_MS });
      }
      await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT_MS }).catch(() => undefined);
      await deps.screenshot(page, "05-after-payment");
      return { filled, finalUrl: page.url() };
    } catch (error) {
      // The hosted page is provider-owned: keep what it actually showed so a failure is diagnosable from the artifact.
      await writeFile(path.join(OUTPUT_DIR, "hosted-page.html"), await page.content().catch(() => "")).catch(() => undefined);
      await deps.screenshot(page, "99-failure").catch(() => undefined);
      throw error;
    }
  } finally {
    await browser.close();
  }
}

export type HandshakeProof = {
  offerOnSale: boolean;
  plansCaptured: string[];
  sidewaysAt390: boolean;
  buyLabel: string;
  checkoutUrl: string;
  hostedPageHost: string;
  hostedPageTitle: string;
  paid: false;
};

/** The live offer must be on sale before the handshake means anything. */
export async function readLiveOffer(): Promise<{ onSale: boolean }> {
  const response = await fetch(`${PRODUCTION_ORIGIN}/api/chargebee/banded/offer`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`the live offer answered ${response.status}`);
  const body = (await response.json()) as { onSale?: unknown };
  return { onSale: body.onSale === true };
}

/**
 * Sign in as the demo seeker on the live site, capture /plans at 1280 and 390, then click Buy and stop on the
 * provider's hosted page. Nothing is paid: the checkout intent and its founding reservation expire unpaid.
 */
export async function handshake(deps: CardRunDeps, password: string): Promise<HandshakeProof> {
  const offer = await readLiveOffer();
  if (!offer.onSale) throw new Error("the live offer is not on sale yet: activate BANDED_SALES_ENABLED first");
  const browser = await deps.launch();
  try {
    const page = await browser.newPage();
    const signedIn = await page.context().request.post(`${PRODUCTION_ORIGIN}/api/auth/reviewer/sign-in`, {
      data: { email: DEMO_SEEKER_EMAIL, password }, failOnStatusCode: false, maxRedirects: 0,
    });
    if (signedIn.status() !== 200) throw new Error(`the demo seeker sign-in answered ${signedIn.status()}`);
    const plansCaptured: string[] = [];
    let sidewaysAt390 = false;
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${PRODUCTION_ORIGIN}/plans`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      const name = `plans-${viewport.width}`;
      await deps.screenshot(page, name);
      plansCaptured.push(`${name}.png`);
      if (viewport.width === 390) sidewaysAt390 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${PRODUCTION_ORIGIN}/plans`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    const card = page.getByRole("region", { name: HANDSHAKE_PLAN_LABEL });
    const buy = card.getByRole("button", { name: /^Buy / });
    const buyLabel = (await buy.textContent())?.trim() ?? "";
    if (!buyLabel) throw new Error(`no Buy button inside the ${HANDSHAKE_PLAN_LABEL} card`);
    await buy.click({ timeout: NAV_TIMEOUT_MS });
    await page.waitForURL(url => !url.toString().startsWith(PRODUCTION_ORIGIN), { timeout: NAV_TIMEOUT_MS });
    await deps.screenshot(page, "hosted-page-handshake");
    const checkoutUrl = page.url();
    const hostedPageHost = new URL(checkoutUrl).hostname;
    if (!/\.chargebee\.com$/.test(hostedPageHost)) throw new Error(`Buy opened ${hostedPageHost}, not a Chargebee hosted page`);
    return {
      offerOnSale: true, plansCaptured, sidewaysAt390, buyLabel, checkoutUrl, hostedPageHost,
      hostedPageTitle: await page.title(), paid: false,
    };
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
  provision: ProvisionResult | null;
  card: { brand: string; last4: string } | null;
  proof: CardProof | null;
  handshake: HandshakeProof | null;
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
    `| TEST catalog provision | ${summary.provision ? `${summary.provision.outcome}, ${summary.provision.planned} to create, ${summary.provision.blocked} blocked` : "not run"} |`,
    `| Card | ${summary.card ? `${summary.card.brand} ending ${summary.card.last4}` : "not charged"} |`,
    `| Subscription | ${summary.proof ? `\`${summary.proof.subscriptionId}\` (${summary.proof.subscriptionStatus}, ${summary.proof.currencyCode})` : "none"} |`,
    `| Invoice | ${summary.proof?.invoiceId ? `\`${summary.proof.invoiceId}\` (${summary.proof.invoiceStatus})` : "none"} |`,
    `| QA subscription cancelled | ${summary.cancelled ? "yes" : "no"} |`,
    ...(summary.handshake ? [
      `| Live offer | onSale: ${summary.handshake.offerOnSale} |`,
      `| /plans captures | ${summary.handshake.plansCaptured.join(", ")} |`,
      `| Sideways scroll at 390 | ${summary.handshake.sidewaysAt390 ? "yes" : "no"} |`,
      `| Buy button | ${summary.handshake.buyLabel} |`,
      `| Hosted page | ${summary.handshake.hostedPageHost} (${summary.handshake.hostedPageTitle}) |`,
      `| Paid | ${summary.handshake.paid ? "yes" : "no (closed before payment)"} |`,
    ] : []),
    `| Result | ${summary.ok ? "PASS" : `FAIL: ${summary.reason}`} |`,
  ];
  return ["### Banded TEST-site international-card QA", "", "| Check | Value |", "|---|---|", ...rows, ""].join("\n");
}

async function main(): Promise<number> {
  const mode = parseMode(process.argv[2]);
  const password = mode === "handshake" ? (process.env[DEMO_PASSWORD_ENV] ?? "") : "";
  const key = mode === "handshake" ? "" : apiKeyOf(process.env);
  const redact = redactor(key, password);
  const log = (line: string) => console.log(redact(line));
  const credentials: Credentials = { site: SITE, apiKey: key };
  await mkdir(OUTPUT_DIR, { recursive: true });

  const summary: Summary = { site: SITE, mode, plan: PLAN, currency: CURRENCY, probe: null, provision: null, card: null, proof: null, handshake: null, cancelled: false, ok: false, reason: "" };
  try {
    if (mode === "handshake") {
      if (!password) throw new Error(`${DEMO_PASSWORD_ENV} is not set: the demo seeker password lives in the repository secret of that name`);
      summary.handshake = await handshake({
        launch: async () => {
          const { chromium } = await import("playwright");
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
      }, password);
      log(`handshake: ${summary.handshake.buyLabel} opened ${summary.handshake.hostedPageHost} without paying`);
      summary.ok = true;
      summary.reason = "live offer on sale, /plans captured at 1280 and 390, Buy opened the hosted page without paying";
      await writeFile(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
      const handshakeMarkdown = markdownOf(summary);
      console.log(handshakeMarkdown);
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${handshakeMarkdown}\n`);
      return 0;
    }
    if (mode === "provision") {
      // Provision first: the probe below is the confirmation that the site now matches the frozen source.
      summary.provision = await provisionTestCatalog(credentials);
      log(`provision: ${summary.provision.outcome}, ${summary.provision.planned} to create`);
      summary.probe = await probe(credentials);
      log(`probe: ${summary.probe.usdItemPriceId} = ${summary.probe.usdAmount} minor units on ${SITE}`);
      summary.ok = true;
      summary.reason = "the TEST site's banded catalog now matches the frozen source";
    } else {
      const override = mode === "card" ? (process.env[TEST_SITE_ITEM_PRICE_ID_ENV] ?? "").trim() : "";
      if (override) log(`card mode uses the TEST site's own item price ${override} (the app's current id is absent there)`);
      summary.probe = await probe(credentials, override || undefined);
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
