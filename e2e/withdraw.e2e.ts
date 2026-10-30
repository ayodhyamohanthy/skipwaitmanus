// Journey 4: withdrawing before pickup returns the referral. The balance, read
// as the screen labels it (D-180), goes back up by the cost the compose screen
// quoted.
import { attachResume, devSignIn, expect, quotedCost, readBalance, REFERRER_COMPANY, sendAsk, test, writeAsk } from "./fixtures";

test("withdraw returns the referral", async ({ context, page }) => {
  await devSignIn(context);
  await page.goto("/ask");
  const before = await readBalance(page);
  await writeAsk(page);
  const cost = await quotedCost(page);
  await attachResume(page);
  const { status } = await sendAsk(page);
  expect(status).toBe(200);
  await expect(page.getByText(`Ask sent to ${REFERRER_COMPANY}.`)).toBeVisible();
  await expect.poll(() => readBalance(page)).toBe(before - cost);

  await page.getByRole("link", { name: "See my asks" }).click();
  await page.getByRole("link", { name: "View ask" }).click();
  await expect(page).toHaveURL(/\/conversation\/\d+/);
  await page.getByRole("button", { name: "Withdraw ask" }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: /withdraw/i });
  if (await confirm.count()) await confirm.last().click();
  await expect(page.getByText(/withdrawn/i).first()).toBeVisible();

  await page.reload();
  await expect.poll(() => readBalance(page)).toBe(before);
});
