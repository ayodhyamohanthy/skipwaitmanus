// Journey 6: /plans shows the FROZEN banded family (D-219) in the price book
// /api/plans/catalog answers with, and only those prices: a catalog that answers
// INR shows India's frozen prices, not the global ones. Legacy credit packs are
// paused (D-219 (6)), so no pack card and no purchase CTA renders on the page.
import type { Page } from "playwright/test";
import { expect, test } from "./fixtures";

type Catalog = { currency: string; packs: unknown[] };

// D-219 (1): the frozen founding prices. Pinned here on purpose - a price move
// must be a deliberate, reviewed edit to this journey as well as to planFamily.
const CARDS = [
  { label: "Early to Mid", usd: "$4.49", inr: "₹229" },
  { label: "Mid to Senior", usd: "$17.99", inr: "₹899" },
  { label: "Senior to Executive", usd: "$25.99", inr: "₹1,299" },
] as const;

const card = (page: Page, label: string) => page.getByRole("region", { name: label, exact: true });

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
