// D-094-ai-in-ui release QA (packet §6.4): the real built app with both switches on, served by
// `node scripts/e2e-server.mjs start` (local MySQL 8.0, seeded accounts, dev sign-in plane), at 1280x900 and 390x844@2.
// Only POST /api/job-link/preview is answered synthetically (the QA machine reaches no job site); every other
// request, including the two real asks My asks shows, goes to the real server. Run from the repo root after
// `pnpm build`, `node scripts/e2e-server.mjs prepare` and `start`:
//   node design/goal-ui/captures/d094-release/capture.cjs design/goal-ui/captures/d094-release
const { createRequire } = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const req = createRequire(path.join(__dirname, "..", "..", "..", "..", "package.json"));
const { chromium } = req("playwright");
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2];
const VIEWPORTS = [{ width: 1280, height: 900, deviceScaleFactor: 1 }, { width: 390, height: 844, deviceScaleFactor: 2 }];
const PREVIEWS = {
  "careers.wipro.com": { employerConfidence: "direct-domain", companyDomain: "wipro.com", companyName: "Wipro", roleTitle: "Senior Product Designer" },
  "careers.neutrinos.com": { employerConfidence: "direct-domain", companyDomain: "neutrinos.com", companyName: "Neutrinos", roleTitle: "Frontend Engineer" },
  "boards.greenhouse.io": { employerConfidence: "verified", companyDomain: "wipro.com", companyName: "Wipro", roleTitle: "Data Engineer" },
  "careers.acme.example": { employerConfidence: "direct-domain", companyDomain: "acme.example", companyName: "Acme", roleTitle: "Product Designer" },
};
let seq = 0;
const log = [];
async function session(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor, baseURL: BASE });
  seq += 1;
  const login = await context.request.post("/api/dev-auth/login", { data: { name: "QA Seeker", email: `qa.seeker.d094.${Date.now().toString(36)}${seq}@example.com` } });
  if (!login.ok()) throw new Error(`dev sign-in answered ${login.status()}`);
  await context.route(url => url.pathname === "/api/job-link/preview", async route => {
    const body = JSON.parse(route.request().postData() || "{}");
    const u = new URL(body.url);
    const host = u.hostname;
    const p = host === "boards.greenhouse.io" && u.pathname.startsWith("/neutrinos/") ? { employerConfidence: "verified", companyDomain: "neutrinos.com", companyName: "Neutrinos", roleTitle: "Frontend Engineer" } : PREVIEWS[host];
    log.push(`preview ${host} -> ${p ? p.companyDomain : "none"}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(p ? { canonicalUrl: body.url, status: "fresh", fetched: true, ...p } : { canonicalUrl: body.url, status: "unreachable", employerConfidence: "unreachable", fetched: true, reason: "We could not reach this job link." }) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  return { context, page, errors };
}
async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}
async function drawerShot(browser, viewport, url, name, expectText) {
  const { context, page, errors } = await session(browser, viewport);
  await page.goto("/explore/wipro?open");
  await settle(page);
  const drawer = page.getByTestId("goal-drawer");
  await drawer.waitFor({ timeout: 15000 });
  const input = drawer.getByLabel("Job link");
  await input.fill(url);
  await input.blur();
  const line = drawer.getByTestId("job-link-from-posting");
  await line.waitFor({ timeout: 10000 });
  const text = (await line.innerText()).trim();
  await line.scrollIntoViewIfNeeded();
  const send = drawer.getByRole("button", { name: "Send referral request" });
  const sendState = await send.getAttribute("aria-disabled").catch(() => "n/a");
  await page.screenshot({ path: path.join(OUT, `${name}@${viewport.width}.png`) });
  log.push(`${name}@${viewport.width}: line="${text}" sendAriaDisabled=${sendState} pageErrors=${errors.length}`);
  if (!text.includes(expectText)) throw new Error(`${name}: expected "${expectText}", got "${text}"`);
  await context.close();
}
async function askShot(browser, viewport) {
  const { context, page, errors } = await session(browser, viewport);
  await page.goto("/ask");
  await settle(page);
  const input = page.getByLabel("Job link");
  await input.fill("https://boards.greenhouse.io/wipro/jobs/42");
  await input.blur();
  const line = page.getByTestId("job-link-from-posting");
  await line.waitFor({ timeout: 10000 });
  const text = (await line.innerText()).trim();
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `ask-hosted-link@${viewport.width}.png`), fullPage: true });
  log.push(`ask-hosted-link@${viewport.width}: line="${text}" pageErrors=${errors.length}`);
  if (!text.includes("From the posting: Data Engineer at Wipro")) throw new Error(`ask: got "${text}"`);
  await context.close();
}
async function sendRealAsk(page, link) {
  await page.goto("/ask");
  await settle(page);
  const input = page.getByLabel("Job link");
  await input.fill(link);
  await input.blur();
  await page.getByPlaceholder(/One result/).fill("Led a checkout redesign that cut drop-off 18%.");
  await page.getByPlaceholder(/Another result/).fill("Shipped a design system used by 40 teams.");
  await page.getByPlaceholder(/A third reason/).fill("Built the onboarding flow end to end.");
  await page.locator("[data-skipwait-screen='ask'] input[type=file]").first().setInputFiles({ name: "qa-resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% skipwait qa resume\n%%EOF\n") });
  await page.waitForTimeout(700);
  const answered = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/company-referrals");
  await page.getByRole("button", { name: "Send referral request" }).click();
  const response = await answered;
  const body = await response.json().catch(() => ({}));
  log.push(`send ${new URL(link).hostname}: ${response.status()} queueStatus=${body?.request?.queueStatus ?? body?.queueStatus ?? "?"}`);
  if (response.status() >= 300) throw new Error(`send ${link} answered ${response.status()}: ${JSON.stringify(body).slice(0, 200)}`);
}
async function myAsksShot(browser, viewport) {
  const { context, page, errors } = await session(browser, viewport);
  await sendRealAsk(page, `https://careers.acme.example/jobs/${Date.now().toString(36)}-product-designer`);
  await sendRealAsk(page, `https://careers.wipro.com/job/${Date.now().toString(36)}-backend-engineer`);
  await page.goto("/requests");
  await settle(page);
  const buttons = page.getByRole("button", { name: "What this means" });
  await buttons.first().waitFor({ timeout: 15000 });
  const count = await buttons.count();
  let opened = -1;
  for (let i = 0; i < count && opened < 0; i += 1) {
    await buttons.nth(i).click();
    const panelId = await buttons.nth(i).getAttribute("aria-controls");
    const text = await page.locator(`#${panelId}`).innerText().catch(() => "");
    if (text.includes("within 90 days")) opened = i; else await buttons.nth(i).click();
  }
  if (opened < 0) throw new Error("no waiting-for-coverage disclosure found");
  const expanded = await buttons.nth(opened).getAttribute("aria-expanded");
  await page.screenshot({ path: path.join(OUT, `my-asks-help-open@${viewport.width}.png`), fullPage: true });
  log.push(`my-asks-help-open@${viewport.width}: disclosures=${count} opened=#${opened} aria-expanded=${expanded} pageErrors=${errors.length}`);
  await context.close();
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  try {
    for (const vp of VIEWPORTS) {
      await drawerShot(browser, vp, "https://careers.wipro.com/job/123-senior-product-designer", "drawer-role-line", "From the posting: Senior Product Designer at Wipro");
      await drawerShot(browser, vp, "https://careers.neutrinos.com/job/77-frontend-engineer", "drawer-mismatch-line", "This posting looks like Neutrinos’, not Wipro’s.");
      await drawerShot(browser, vp, "https://boards.greenhouse.io/neutrinos/jobs/9", "drawer-hosted-mismatch-line", "This posting looks like Neutrinos’, not Wipro’s.");
      await askShot(browser, vp);
      await myAsksShot(browser, vp);
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, "qa-log.txt"), log.join("\n") + "\n");
    console.log(log.join("\n"));
  }
})().catch(e => { console.error("QA FAILED:", e.message); process.exit(1); });
