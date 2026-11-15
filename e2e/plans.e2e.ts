// Journey 6: /plans shows the prices /api/plans/catalog returns, and only
// those: a changed catalog price shows up on the page.
import type { Page } from "playwright/test";
import { expect, test } from "./fixtures";

type Pack = { id: string; credits: number; amount: number };
type Catalog = { currency: string; packs: Pack[] };

const money = (amount: number) => `$${(amount / 100).toFixed(amount % 100 === 0 ? 0 : 2)}`;

async function packCard(page: Page, credits: number) {
  return page.getByText(new RegExp(`^${credits} (credits|referrals)$`)).first().locator("xpath=..");
}

test("plans read the server catalog", async ({ page }) => {
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
