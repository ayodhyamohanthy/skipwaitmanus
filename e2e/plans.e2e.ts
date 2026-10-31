// Journey 6: /plans shows the FROZEN banded family (D-219) in the price book
// /api/plans/catalog answers with, and only those prices: a catalog that answers
// INR shows India's frozen prices, not the global ones. Legacy credit packs are
// paused (D-219 (6)), so no pack card and no purchase CTA renders on the page.
//
// An isolated client bundle built with VITE_PLAN_FAMILY_V2=false retains the
// legacy server-catalog price-mutation positive control (docs/plans/PRICING-banded-oct25.md).
import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright/test";
import { expect, test } from "./fixtures";
import { LEGACY_PLANS_OUT_DIR } from "./legacy-plans.vite.config";

type Pack = { id: string; credits: number; amount: number };
type Catalog = { currency: string; packs: Pack[] };

const money = (amount: number) => `$${(amount / 100).toFixed(amount % 100 === 0 ? 0 : 2)}`;

// D-219 (1): the frozen founding prices. Pinned here on purpose - a price move
// must be a deliberate, reviewed edit to this journey as well as to planFamily.
const CARDS = [
  { label: "Early to Mid", usd: "$4.49", inr: "₹229" },
  { label: "Mid to Senior", usd: "$17.99", inr: "₹899" },
  { label: "Senior to Executive", usd: "$25.99", inr: "₹1,299" },
] as const;

const card = (page: Page, label: string) => page.getByRole("region", { name: label, exact: true });

async function packCard(page: Page, credits: number) {
  return page.getByText(new RegExp(`^${credits} (credits|referrals)$`)).first().locator("xpath=..");
}

test("plans read the frozen banded family in the server's currency", async ({ page }) => {
  const live = page.waitForResponse(response => new URL(response.url()).pathname === "/api/plans/catalog");
  await page.goto("/plans");
  const catalog = await (await live).json() as Catalog;
  expect(catalog.currency).toBe("USD");

  for (const entry of CARDS) {
    await expect(card(page, entry.label)).toContainText(entry.usd);
  }

  // D-219 (6): old pack sales are paused - the page offers no pack and no purchase.
  await expect(page.getByText(/^\d+ (credits|referrals)$/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /buy pack|start with this pack/i })).toHaveCount(0);
  await expect(page.getByText("Checkout not switched on yet", { exact: true })).toHaveCount(CARDS.length);

  // The server's answer picks the price book: an INR catalog shows India's frozen prices.
  await page.route(/\/api\/plans\/catalog$/, route => route.fulfill({ json: { ...catalog, currency: "INR" } }));
  await page.reload();
  for (const entry of CARDS) {
    await expect(card(page, entry.label)).toContainText(entry.inr);
    await expect(card(page, entry.label)).not.toContainText(entry.usd);
  }
});

test("legacy plans page retains server-catalog price-mutation control in isolated bundle", async ({ page }) => {
  // Build the isolated legacy bundle if not already built
  const legacyIndexHtmlPath = path.join(LEGACY_PLANS_OUT_DIR, "index.html");
  if (!fs.existsSync(legacyIndexHtmlPath)) {
    const { build } = await import("vite");
    const { default: config } = await import("./legacy-plans.vite.config");
    await build(config);
  }

  // Verify the default output is unchanged
  const defaultIndexPath = path.resolve(import.meta.dirname, "../dist/public/index.html");
  expect(fs.existsSync(defaultIndexPath)).toBe(true);

  // Route requests to the isolated legacy client bundle
  const legacyHtml = fs.readFileSync(legacyIndexHtmlPath, "utf8");
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      return route.continue();
    }
    if (url.pathname.startsWith("/assets/")) {
      const assetFile = path.join(LEGACY_PLANS_OUT_DIR, "assets", path.basename(url.pathname));
      if (fs.existsSync(assetFile)) {
        return route.fulfill({
          status: 200,
          contentType: assetFile.endsWith(".js") ? "application/javascript" : assetFile.endsWith(".css") ? "text/css" : undefined,
          body: fs.readFileSync(assetFile),
        });
      }
    }
    if (url.pathname === "/plans" || url.pathname === "/" || !url.pathname.includes(".")) {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: legacyHtml,
      });
    }
    return route.continue();
  });

  const live = page.waitForResponse(response => new URL(response.url()).pathname === "/api/plans/catalog");
  await page.goto("/plans");
  const catalog = await (await live).json() as Catalog;
  expect(catalog.currency).toBe("USD");
  expect(catalog.packs.length).toBeGreaterThan(0);
  for (const pack of catalog.packs) {
    await expect(await packCard(page, pack.credits)).toContainText(money(pack.amount));
  }

  // Change one catalog price: the page follows the server, not copy in the client.
  const changed = { ...catalog, packs: catalog.packs.map((pack, index) => index === 0 ? { ...pack, amount: pack.amount + 100 } : pack) };
  await page.route(/\/api\/plans\/catalog$/, route => route.fulfill({ json: changed }));
  await page.reload();
  const first = changed.packs[0];
  await expect(await packCard(page, first.credits)).toContainText(money(first.amount));
  await expect(await packCard(page, first.credits)).not.toContainText(money(catalog.packs[0].amount));
});
