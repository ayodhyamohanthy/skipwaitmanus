// Viewport-true, full-page captures of goal /share at the fix head, four states:
// loading, ready, locked-null (200 { invite: null, locked: true }, D-155) and
// sign-in on the same mount (auth.me held, then released; the hub is not remounted).
// API mocked at the network layer; fictional data only. Usage: node share-capture-states.mjs <outDir> <baseUrl>
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = createRequire(process.cwd() + "/package.json")("playwright");

const [OUT, BASE] = [process.argv[2], process.argv[3] ?? "http://127.0.0.1:3110"];
const VIEWPORTS = {
  "390": { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "1280": { width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const ACCOUNT = { openId: "fixture", loginMethod: "fixture", role: "user", id: 41, name: "Asha Rao", email: "asha@example.invalid", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastSignedIn: "2026-10-08T00:00:00.000Z" };

function gate() { let release; const held = new Promise(r => { release = r; }); return { held, release: () => release() }; }

async function mock(page, { invite, holdInvite, holdMe }) {
  const inviteGate = gate(), meGate = gate();
  if (!holdInvite) inviteGate.release();
  if (!holdMe) meGate.release();
  await page.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/dev-auth/session") return json(200, { signedIn: true, account: ACCOUNT });
    if (url.pathname.startsWith("/api/trpc/")) {
      const procs = url.pathname.slice("/api/trpc/".length).split(",");
      if (procs.includes("auth.me")) await meGate.held;
      const body = procs.map(name => name === "auth.me" ? { result: { data: { json: ACCOUNT } } } : { result: { data: { json: null } } });
      return json(200, url.searchParams.get("batch") ? body : body[0]);
    }
    if (url.pathname === "/api/personal-invites/me") { await inviteGate.held; return json(200, invite); }
    if (url.pathname.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 3 } });
    if (url.pathname === "/api/company-referrals/access") return json(200, { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
    return json(404, { error: "not mocked" });
  }).catch(() => undefined);
  return { releaseInvite: inviteGate.release, releaseMe: meGate.release };
}

// Every distinct status line the hub shows, from the first DOM frame, plus whether
// a frame ever said "ready" while no /start?invite= link was on the page.
const traceScript = () => {
  const seen = []; const bad = [];
  window.__shareStatus = seen; window.__readyWithoutLink = bad;
  const record = () => {
    const hub = document.querySelector("[data-testid=goal-share-hub] header p span:last-child") ?? document.querySelector("[data-testid=goal-share-hub] header p");
    const text = hub ? hub.textContent : null;
    if (text && seen[seen.length - 1] !== text) seen.push(text);
    if (text && text.includes("Your link is ready.") && !document.body.textContent.includes("/start?invite=")) bad.push(text);
  };
  new MutationObserver(record).observe(document, { childList: true, subtree: true, characterData: true });
};

const LOCKED_POLICY = "Referrals unlock after your first paid invoice. Once you've made a payment, come back here to get your referral link.";
const SCENARIOS = {
  loading: { invite: { invite: { inviteCode: "FICTION-7Q" }, locked: false }, holdInvite: true },
  ready: { invite: { invite: { inviteCode: "FICTION-7Q" }, locked: false } },
  "locked-null": { invite: { invite: null, locked: true } },
  signin: { invite: { invite: { inviteCode: "FICTION-7Q" }, locked: false }, holdInvite: true, holdMe: true },
};

const browser = await chromium.launch();
const report = { base: BASE, scenarios: {} };
await mkdir(OUT, { recursive: true });
const shot = async (page, name) => { const file = `${OUT}/${name}.png`; await page.evaluate(() => document.fonts && document.fonts.ready); await page.screenshot({ path: file, fullPage: true }); return file.split("/").pop(); };
try {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const [state, sc] of Object.entries(SCENARIOS)) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch, reducedMotion: "reduce", colorScheme: "light", locale: "en-US" });
      await context.addInitScript(traceScript);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", err => errors.push(String(err).slice(0, 200)));
      const ctl = await mock(page, sc);
      await page.goto(`${BASE}/share`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.locator("[data-testid=goal-share-hub]").waitFor({ timeout: 90000 });
      const entry = { files: [] };
      if (state === "loading") { await page.getByText("Creating your link…").first().waitFor(); await page.waitForTimeout(500); entry.files.push(await shot(page, `share-loading-${vpName}`)); }
      if (state === "ready") { await page.getByText("/start?invite=FICTION-7Q").waitFor({ timeout: 20000 }); entry.files.push(await shot(page, `share-ready-${vpName}`)); }
      if (state === "locked-null") { await page.getByText(LOCKED_POLICY).waitFor({ timeout: 20000 }); await page.waitForTimeout(300); entry.files.push(await shot(page, `share-locked-null-${vpName}`)); }
      if (state === "signin") {
        await page.getByRole("button", { name: "Sign in to continue" }).waitFor({ timeout: 20000 });
        await page.evaluate(() => { window.__hubNode = document.querySelector("[data-testid=goal-share-hub]"); });
        entry.files.push(await shot(page, `share-signin-before-${vpName}`));
        ctl.releaseMe();
        await page.getByText("Creating your link…").first().waitFor({ timeout: 20000 });
        await page.waitForTimeout(300);
        entry.files.push(await shot(page, `share-signin-same-mount-creating-${vpName}`));
        ctl.releaseInvite();
        await page.getByText("/start?invite=FICTION-7Q").waitFor({ timeout: 20000 });
        entry.files.push(await shot(page, `share-signin-same-mount-ready-${vpName}`));
        entry.sameMountNode = await page.evaluate(() => window.__hubNode === document.querySelector("[data-testid=goal-share-hub]") && window.__hubNode.isConnected);
      }
      ctl.releaseInvite(); ctl.releaseMe();
      entry.statusTrace = await page.evaluate(() => window.__shareStatus);
      entry.readyWithoutLinkFrames = await page.evaluate(() => window.__readyWithoutLink);
      entry.copyButton = await page.getByRole("button", { name: "Copy link" }).count() ? await page.getByRole("button", { name: "Copy link" }).getAttribute("aria-disabled") : "absent";
      entry.pageErrors = errors;
      report.scenarios[`${vpName}/${state}`] = entry;
      await context.close();
    }
  }
} finally { await browser.close(); }
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
