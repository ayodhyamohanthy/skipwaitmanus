// Journey: Report from seeker conversation (D-278, CONV-report-entry).
// A seeker on an accepted conversation clicks "Report or block" carrying ?request=<id>.
// Admin read verifies the safety report and evidence messages.
// Block toggle placed LAST.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Request } from "playwright/test";
import {
  attachResume,
  devSignIn,
  expect,
  expectCreated,
  REFERRER_COMPANY,
  sendAsk,
  test,
  writeAsk,
} from "./fixtures";

const ATTESTATION = `By accepting, you confirm you'll refer only through ${REFERRER_COMPANY}'s official process.`;
const isDecision = (request: Request) =>
  request.method() === "POST" &&
  /\/api\/company-referrals\/\d+\/one-click-review$/.test(new URL(request.url()).pathname);

test("seeker on accepted conversation reports with ask id, admin reads evidence, block is last", async ({ newContext, referrerPage, baseURL, playwright }) => {
  const seekerContext = await newContext();
  await devSignIn(seekerContext);
  const seekerPage = await seekerContext.newPage();

  // 1. Fresh seeker sends an ask
  await seekerPage.goto("/ask");
  await writeAsk(seekerPage);
  await attachResume(seekerPage);
  const { status } = await sendAsk(seekerPage);
  expectCreated(status);
  await expect(seekerPage.getByText(`Ask sent to ${REFERRER_COMPANY}.`)).toBeVisible();

  // Seeker navigates My asks -> View ask -> /conversation/<id>
  await seekerPage.getByRole("link", { name: "See my asks" }).click();
  await seekerPage.getByRole("link", { name: "View ask" }).first().click();
  await expect(seekerPage).toHaveURL(/\/conversation\/\d+/);
  const askUrl = seekerPage.url();
  const match = askUrl.match(/\/conversation\/(\d+)/);
  expect(match).not.toBeNull();
  const requestId = Number(match![1]);

  // Before acceptance: verify link is bare /report
  const bareReportLink = seekerPage.getByRole("link", { name: "Report or block" });
  await expect(bareReportLink).toHaveAttribute("href", "/report");

  // Referrer accepts on /queue with the attestation
  await referrerPage.goto("/queue");
  const row = referrerPage.getByRole("listitem").filter({ hasText: "New" }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(referrerPage.getByText(ATTESTATION, { exact: true })).toBeVisible();

  const accept = referrerPage.waitForRequest(isDecision);
  await referrerPage.getByRole("button", { name: "Accept & connect" }).click();
  await accept;
  await expect(referrerPage).toHaveURL(new RegExp(`/conversation/${requestId}`));

  // Setup messages: one each way
  await referrerPage.getByLabel("Message").fill("Hello from referrer");
  await referrerPage.getByRole("button", { name: "Send" }).click();
  await expect(referrerPage.getByText("Hello from referrer")).toBeVisible();

  await seekerPage.reload();
  await expect(seekerPage.getByText("Hello from referrer")).toBeVisible();
  await seekerPage.getByLabel("Message").fill("Hello from seeker");
  await seekerPage.getByRole("button", { name: "Send" }).click();
  await expect(seekerPage.getByText("Hello from seeker")).toBeVisible();

  // 2. Seeker clicks "Report or block": URL is /report?request=<id> and "Also block this person" is visible
  const acceptedReportLink = seekerPage.getByRole("link", { name: "Report or block" });
  await expect(acceptedReportLink).toHaveAttribute("href", `/report?request=${requestId}`);
  await acceptedReportLink.click();
  await expect(seekerPage).toHaveURL(new RegExp(`/report\\?request=${requestId}$`));

  await seekerPage.getByRole("button", { name: /continue/i }).click();
  const blockToggle = seekerPage.getByRole("button", { name: /also block this person/i });
  await expect(blockToggle).toBeVisible();

  // 3. Admin read (§5.3), before any block: seeker files report with toggle off; expect 201
  const reportPost = seekerPage.waitForResponse(
    r => r.request().method() === "POST" && r.url().includes("/api/safety-reports")
  );
  await seekerPage.getByRole("button", { name: "Submit report" }).click();
  const reportRes = await reportPost;
  expect(reportRes.status()).toBe(201);
  await expect(seekerPage.getByText("Thanks. We're on it.")).toBeVisible();

  // Admin read: read e2e/.auth/seed.json directly
  const seedPath = join(dirname(fileURLToPath(import.meta.url)), ".auth", "seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as { accounts: Record<string, string> };
  const adminCookie = seed.accounts["qa.admin@example.com"];
  expect(adminCookie).toBeDefined();

  // Non-admin assertion: non-admin is refused (403)
  const nonAdminRes = await seekerPage.request.get("/api/admin/safety-reports");
  expect(nonAdminRes.status()).toBe(403);

  // Admin assertion: admin cookie is allowed (200)
  const adminReq = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { Cookie: `app_session_id=${adminCookie}` },
  });
  const adminRes = await adminReq.get("/api/admin/safety-reports");
  expect(adminRes.status()).toBe(200);
  const adminData = (await adminRes.json()) as {
    reports: Array<{
      referralRequestId: number | null;
      evidence?: Array<{ sender: string; body: string }>;
    }>;
  };
  const matchingReport = adminData.reports.find(r => r.referralRequestId === requestId);
  expect(matchingReport).toBeDefined();
  expect(matchingReport?.evidence).toBeDefined();
  const evidenceMessages = matchingReport!.evidence!.map(e => ({ sender: e.sender, body: e.body }));
  expect(evidenceMessages).toEqual(
    expect.arrayContaining([
      { sender: "reporter", body: "Hello from seeker" },
      { sender: "other", body: "Hello from referrer" },
    ])
  );

  // 4. LAST: back on /report?request=<id>, seeker files again with "Also block this person" ON
  await seekerPage.goto(`/report?request=${requestId}`);
  await seekerPage.getByRole("button", { name: /continue/i }).click();
  const blockToggleOn = seekerPage.getByRole("button", { name: /also block this person/i });
  await blockToggleOn.click();
  await expect(blockToggleOn).toHaveAttribute("aria-pressed", "true");

  const reportPost2 = seekerPage.waitForResponse(
    r => r.request().method() === "POST" && r.url().includes("/api/safety-reports")
  );
  const blockPost = seekerPage.waitForResponse(
    r => r.request().method() === "POST" && r.url().includes("/api/blocks")
  );
  await seekerPage.getByRole("button", { name: "Submit report" }).click();
  const reportRes2 = await reportPost2;
  const blockRes = await blockPost;
  expect(reportRes2.status()).toBe(201);
  expect([200, 201]).toContain(blockRes.status());
});
