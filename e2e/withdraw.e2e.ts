// Journey 4: withdrawing before pickup returns the referral. The balance, read
// as the screen labels it (D-180), goes back up by the cost the compose screen
// quoted.
import { attachResume, expectCreated, devSignIn, expect, quotedCost, readBalance, REFERRER_COMPANY, sendAsk, test, writeAsk } from "./fixtures";

test("withdraw returns the referral", async ({ context, page }) => {
  await devSignIn(context);
  await page.goto("/ask");
  const before = await readBalance(page);
  await writeAsk(page);
  const cost = await quotedCost(page);
  await attachResume(page);
  const { status } = await sendAsk(page);
  expectCreated(status);
  await expect(page.getByText(`Ask sent to ${REFERRER_COMPANY}.`)).toBeVisible();
  await expect.poll(() => readBalance(page)).toBe(before - cost);

  await page.getByRole("link", { name: "See my asks" }).click();
  await page.getByRole("link", { name: "View ask" }).click();
  await expect(page).toHaveURL(/\/conversation\/\d+/);
  await page.getByRole("button", { name: "Withdraw ask" }).click();
  // The confirmation is an inline group, not a dialog (SeekerConversation.tsx).
  await page.getByRole("group", { name: "Withdraw this ask" }).getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(page.getByText("Withdrawn", { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect.poll(() => readBalance(page)).toBe(before);
});
