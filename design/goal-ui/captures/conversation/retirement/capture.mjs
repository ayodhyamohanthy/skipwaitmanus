// Synthetic local preview only. Every API request and external origin is intercepted.
import { chromium, expect } from "playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");
const phase = process.argv[2];
if (phase !== "before" && phase !== "after") throw new Error("Pass before or after");
const entryPath = "client/src/pages/ReferralConversation.tsx";
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceSha256 = createHash("sha256").update(await readFile(path.join(root, entryPath))).digest("hex");
const publicDir = path.join(root, "dist/public");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const asset = path.resolve(publicDir, `.${pathname}`);
  if (!asset.startsWith(`${publicDir}/`)) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(path.extname(pathname) ? asset : path.join(publicDir, "index.html"));
    res.writeHead(200, { "Content-Type": mime[path.extname(pathname)] ?? "text/html" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const states = ["signed-out", "loading", "error", "pending", "accept", "pass", "accepted", "referred", "colleague", "seeker-pending", "seeker-accepted"];
const account = { id: 9, openId: "capture-conversation", name: "Test Referrer", email: "referrer@example.test", role: "user", loginMethod: "fixture", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", lastSignedIn: "2026-10-01T00:00:00Z" };
const row = { id: 601, title: "Product Designer", pitch: "Led two end-to-end redesigns.", candidateMessage: "Led two end-to-end redesigns.", targetRoleUrl: "https://careers.acme.example/jobs/design", companyDomain: "acme.example", companyName: "Acme", companyInitials: "A", jobFunction: "Design", status: "pending", referrerId: null, attachmentCount: 1, attachments: [], createdAt: "2026-11-18T08:00:00Z" };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  await mkdir(path.join(here, phase), { recursive: true });
  for (const state of states) for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block" });
    const seeker = state.startsWith("seeker-");
    const accepted = state === "accepted" || state === "referred" || state === "seeker-accepted";
    const request = { ...row, status: state === "referred" ? "intro_made" : accepted ? "approved" : "pending", referrerId: state === "colleague" ? 44 : accepted ? 9 : null, candidateName: accepted ? "Test Seeker" : null, attachments: accepted ? [{ id: 31, fileName: "Resume.pdf", url: "/api/documents/31" }] : [] };
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let body = {};
      let status = 200;
      if (url.pathname.startsWith("/api/trpc/")) {
        const names = url.pathname.slice("/api/trpc/".length).split(",");
        const values = names.map(name => ({ result: { data: { json: name === "auth.me" && state !== "signed-out" ? account : null } } }));
        body = url.searchParams.has("batch") ? values : values[0];
      } else if (url.pathname === "/api/company-referrals/access") body = { verifiedCompanyAccess: !seeker, workEmailDomain: seeker ? null : "acme.example", companyName: "Acme", companyInitials: "A", codeRequired: false };
      else if (url.pathname === "/api/company-referrals/mine") {
        if (state === "loading") return;
        if (state === "error") { status = 503; body = { error: "We could not open this private thread. Try again." }; }
        else body = { requests: seeker ? [request] : [] };
      } else if (url.pathname === "/api/company-referrals/601/preview") {
        if (accepted || state === "colleague") { status = 404; body = { error: "Not available" }; }
        else body = { request };
      } else if (url.pathname === "/api/company-referrals/601") body = { request };
      else if (url.pathname === "/api/company-referrals/601/conversation") body = { messages: [{ id: 1, body: "Thanks for connecting.", createdAt: "2026-11-18T09:00:00Z", isMine: false }], referenceId: state === "referred" ? "QA-4410" : null };
      else if (url.pathname === "/api/account/preferences") body = { preferences: { timeZone: "UTC", dateFormat: "dmy" } };
      else if (url.pathname === "/api/account/signup-language") body = { ok: true };
      else if (url.pathname === "/api/notifications") body = { notifications: [], unreadCount: 0 };
      else if (url.pathname === "/api/dev-auth/session") body = { signedIn: state !== "signed-out", account: state === "signed-out" ? null : account };
      else if (url.pathname === "/api/credits/summary") body = { plan: "free", monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0 };
      else { status = 404; body = { error: "Not in capture fixture" }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await context.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "essential"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/conversation/601`, { waitUntil: "domcontentloaded" });
    const heading = state === "signed-out" ? "Sign in to see this conversation." : state === "error" ? "This thread isn’t available." : state === "colleague" ? "A colleague has this request." : seeker ? "Get referred at Acme." : accepted ? state === "referred" ? "You referred this person." : "Submit through your company." : "Would you refer this person?";
    if (state === "loading") await page.getByText("Opening this private thread…").waitFor();
    else if (state === "error") await page.getByText(heading, { exact: true }).waitFor();
    else await page.getByRole("heading", { level: 1, name: heading, exact: true }).waitFor();
    if (state === "accept") {
      await page.getByRole("button", { name: "Accept & connect" }).click();
      await page.getByRole("group", { name: "Accept this request" }).waitFor();
    }
    if (state === "pass") {
      await page.getByRole("button", { name: "Pass privately", exact: true }).click();
      await page.getByRole("radio").first().waitFor();
      await expect(page.getByRole("radio")).toHaveCount(7);
    }
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".g-scope").first()).toBeVisible();
    const geometry = await page.evaluate(() => ({ horizontalOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth, finalPath: location.pathname }));
    if (geometry.horizontalOverflowPx || errors.length) throw new Error(JSON.stringify({ state, width, geometry, errors }));
    if (["pending", "accept", "pass", "colleague"].includes(state)) {
      await expect(page.getByText("Test Seeker", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Message", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Resume.pdf" })).toHaveCount(0);
    }
    const file = `${state}-${width}.png`;
    await page.screenshot({ path: path.join(here, phase, file), fullPage: true, animations: "disabled" });
    const sha256 = createHash("sha256").update(await readFile(path.join(here, phase, file))).digest("hex");
    results.push({ state, width, file, ...geometry, errors, sha256 });
    await context.close();
  }
  await writeFile(path.join(here, `${phase}.json`), JSON.stringify({ synthetic: true, sourceCommit, sourceSha256, entryPath, results }, null, 2));
  console.log(JSON.stringify({ phase, captures: results.length, sourceCommit, sourceSha256, errors: 0, overflow: 0 }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
