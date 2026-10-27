// Viewport-true captures of goal /share (before = main :3200, after = fix :3100).
// Mocks the API at the network layer like scripts/kit-screens/capture.mjs; fictional data only.
// Also records the share hub status line at its first DOM frame (MutationObserver in-page).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdir, writeFile } from "node:fs/promises";

const OUT = process.argv[2];
const TARGETS = { before: "http://localhost:3200", after: "http://localhost:3100" };
const VIEWPORTS = {
  "390": { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "1280": { width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const ACCOUNT = { openId: "fixture", loginMethod: "fixture", role: "user", id: 41, name: "Asha Rao", email: "asha@example.invalid", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastSignedIn: "2026-10-08T00:00:00.000Z" };

async function mock(page, { holdInvite }) {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/dev-auth/session") return json(200, { signedIn: true, account: ACCOUNT });
    if (url.pathname.startsWith("/api/trpc/")) {
      const procs = url.pathname.slice("/api/trpc/".length).split(",");
      const body = procs.map(name => name === "auth.me" ? { result: { data: { json: ACCOUNT } } } : { result: { data: { json: null } } });
      return json(200, url.searchParams.get("batch") ? body : body[0]);
    }
    if (url.pathname === "/api/personal-invites/me") {
      if (holdInvite) await held;
      return json(200, { invite: { inviteCode: "FICTION-7Q" } });
    }
    if (url.pathname.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 3 } });
    if (url.pathname === "/api/company-referrals/access") return json(200, { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
    return json(404, { error: "not mocked" });
  });
  return () => release();
}

const firstFrameScript = () => {
  const seen = [];
  window.__shareStatus = seen;
  const record = () => {
    const hub = document.querySelector("[data-testid=goal-share-hub] header p span:last-child");
    if (hub && seen[seen.length - 1] !== hub.textContent) seen.push(hub.textContent);
  };
  new MutationObserver(record).observe(document, { childList: true, subtree: true, characterData: true });
};

const browser = await chromium.launch();
const report = {};
await mkdir(OUT, { recursive: true });
try {
  for (const [label, base] of Object.entries(TARGETS)) {
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      for (const state of ["loading", "ready"]) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch, reducedMotion: "reduce", colorScheme: "light", locale: "en-US" });
        await context.addInitScript(firstFrameScript);
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", err => errors.push(String(err).slice(0, 200)));
        const release = await mock(page, { holdInvite: state === "loading" });
        await page.goto(`${base}/share`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.locator("[data-testid=goal-share-hub]").waitFor({ timeout: 60000 });
        if (state === "ready") await page.getByText("/start?invite=FICTION-7Q").waitFor({ timeout: 20000 });
        else await page.waitForTimeout(500);
        await page.evaluate(() => document.fonts && document.fonts.ready);
        const file = `${OUT}/share-${state}-${label}-${vpName}.png`;
        await page.screenshot({ path: file, fullPage: false });
        const statusTrace = await page.evaluate(() => window.__shareStatus);
        const copyDisabled = await page.getByRole("button", { name: "Copy link" }).getAttribute("aria-disabled");
        report[`${label}/${vpName}/${state}`] = { file, statusTrace, copyAriaDisabled: copyDisabled, pageErrors: errors };
        release();
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
