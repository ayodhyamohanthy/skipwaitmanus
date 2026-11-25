// Journey 2 (P1-queue-attestation, Oct 22 regression): on /queue a verified
// referrer sees the official-process attestation before deciding; Accept posts
// ethicsConfirmed: true and Pass never does.
import type { Page, Request } from "playwright/test";
import { PASS_REASON_OPTIONS } from "../shared/passReasons";
import { expect, REFERRER_COMPANY, seekerSendsAcmeAsk, test } from "./fixtures";

const ATTESTATION = `By accepting, you confirm you'll refer only through ${REFERRER_COMPANY}'s official process.`;
const isDecision = (request: Request) => request.method() === "POST" && /\/api\/company-referrals\/\d+\/one-click-review$/.test(new URL(request.url()).pathname);

async function openFirstNewAsk(page: Page) {
  await page.goto("/queue");
  const row = page.getByRole("listitem").filter({ hasText: "New" }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText(ATTESTATION, { exact: true })).toBeVisible();
}

test("the attestation is shown before Accept", async ({ newContext, referrerPage }) => {
  // Two asks to the referrer's company from two seekers: one to pass, one to accept.
  await seekerSendsAcmeAsk(await newContext());
  await seekerSendsAcmeAsk(await newContext());
  const page = referrerPage;

  // Pass first: its decision never carries the attestation.
  await openFirstNewAsk(page);
  const pass = page.waitForRequest(isDecision);
  await page.getByRole("button", { name: "Pass privately" }).click();
  // Each reason is a plain button that posts at once (MyCompanyInbox.tsx, the
  // "Pass reason" list): no confirm step, so the first reason is the decision.
  const reasons = page.getByRole("radiogroup", { name: "Pass reason" });
  await expect(reasons).toBeVisible();
  await reasons.getByRole("button", { name: PASS_REASON_OPTIONS[0].label }).click();
  const passBody = JSON.parse((await pass).postData() ?? "{}") as Record<string, unknown>;
  expect(passBody.decision).toBe("declined");
  expect(passBody).not.toHaveProperty("ethicsConfirmed");

  // Accept: the attestation was on screen, and the decision records it.
  await openFirstNewAsk(page);
  const accept = page.waitForRequest(isDecision);
  await page.getByRole("button", { name: "Accept & connect" }).click();
  const acceptBody = JSON.parse((await accept).postData() ?? "{}") as Record<string, unknown>;
  expect(acceptBody).toMatchObject({ decision: "approved", ethicsConfirmed: true });
  await expect(page).toHaveURL(/\/conversation\/\d+/);
});
