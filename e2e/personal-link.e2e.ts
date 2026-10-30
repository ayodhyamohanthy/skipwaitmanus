// Journey 1 (P0-ask-link-signin, Oct 22 regression): a referrer's personal link
// survives sign-in. A signed-out seeker opens the link, writes the request on
// the composer it leads to, presses Send, signs in, and the request that is
// finally sent still names the referrer's link (fastTrackCode).
import { attachResume, expect, isAskPost, REASONS, REFERRER_COMPANY, routeSignInThroughDevPlane, sendAsk, test, writeAsk } from "./fixtures";

test("a personal link survives sign-in", async ({ referrerPage, context, page }) => {
  // The referrer's own personal link, as their link screen hands it out.
  const linkResponse = await referrerPage.request.get("/api/referrer-fast-track/me");
  expect(linkResponse.ok()).toBeTruthy();
  const { link } = await linkResponse.json() as { link: { linkCode: string; companyDomain: string; url: string } };
  expect(link.companyDomain).toBe(REFERRER_COMPANY);
  const linkPath = new URL(link.url).pathname;

  // Signed out, the link opens on the referrer's company.
  await page.goto(linkPath);
  await expect(page.getByRole("heading", { name: `Request a referral at ${REFERRER_COMPANY}.` })).toBeVisible();

  // The composer for that link, still signed out: write the request and press Send.
  const asks: string[] = [];
  page.on("request", request => { if (isAskPost(request)) asks.push(request.postData() ?? ""); });
  const signIn = await routeSignInThroughDevPlane(context);
  const composer = `/ask?fast=${encodeURIComponent(link.linkCode)}`;
  await page.goto(composer);
  const jobLink = await writeAsk(page);
  await page.getByRole("button", { name: "Sign in and send" }).click();

  // Sign-in on the dev plane brings the seeker back to the same composer.
  await expect.poll(() => signIn.returnTo()).toBe(composer);
  await expect(page).toHaveURL(composer);
  expect(asks, "nothing is sent before sign-in").toHaveLength(0);
  await expect(page.getByLabel("Job link")).toHaveValue(jobLink);
  await expect(page.getByPlaceholder(/One result/)).toHaveValue(REASONS[0]);

  await attachResume(page);
  const { body, status } = await sendAsk(page);
  expect(body.fastTrackCode, "the request still names the referrer's personal link").toBe(link.linkCode);
  expect(body.targetRoleUrl).toBe(jobLink);
  expect(status).toBe(200);
  await expect(page.getByText(`Ask sent to ${REFERRER_COMPANY}.`)).toBeVisible();
});
