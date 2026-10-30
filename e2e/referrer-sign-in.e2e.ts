// Journey 5: referrers sign in with a work email only (the login rule, D-030).
// "Give a referral" offers the work-email code and no social or personal-email
// option.
import { expect, test } from "./fixtures";

test("referrers sign in with a work email only", async ({ page }) => {
  await page.goto("/sign-in");
  const giveReferral = page.getByRole("button", { name: /Give a referral/ });
  await giveReferral.click();
  await expect(giveReferral).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Company email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send sign-in code" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Continue with/ })).toHaveCount(0);
  await expect(page.getByLabel(/password/i)).toHaveCount(0);
});
