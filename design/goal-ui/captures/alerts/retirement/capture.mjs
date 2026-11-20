// Local production-build parity proof. All APIs and external traffic are intercepted.
// Run from the repository root after pnpm build: node <this file> before|after.
import { chromium } from "playwright";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const publicDir = path.resolve(root, process.argv[3] ?? "dist/public");
const entryPath = "client/src/pages/Alerts.tsx";
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const baselineRef = "1b92515fa5b9bf9793730bf13ab4729759c526e9";
const entrySource = phase === "before" ? git(["show", `${baselineRef}:${entryPath}`]) + "\n" : await readFile(path.join(root, entryPath), "utf8");
const entrySha256 = createHash("sha256").update(entrySource).digest("hex");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const file = path.resolve(publicDir, `.${pathname}`);
  if (!file.startsWith(`${publicDir}/`)) { response.writeHead(404).end(); return; }
  try {
    response.writeHead(200, { "Content-Type": mime[path.extname(pathname)] ?? "text/html" }).end(await readFile(path.extname(pathname) ? file : path.join(publicDir, "index.html")));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const account = { id: 9, openId: "synthetic-alerts", name: "Synthetic Seeker", email: "seeker@example.test", role: "user", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const notifications = [
  { id: 2, category: "message", title: "A referrer replied", body: "Your referral request has a new reply.", readAt: null, createdAt: "2026-11-19T11:48:00Z" },
  { id: 1, category: "referral", title: "Referral request accepted", body: "A verified employee accepted your request.", readAt: null, createdAt: "2026-11-19T11:00:00Z" },
  { id: 3, category: "system", title: "Preferences saved", body: "Your notification preferences are up to date.", readAt: "2026-11-17T12:00:00Z", createdAt: "2026-11-17T12:00:00Z" },
];
const states = ["signed-out", "auth-loading", "loading", "empty", "unread", "filtered", "marked-read", "partial-read", "load-error", "saved-empty", "saved", "step-up"];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  await mkdir(path.join(here, phase), { recursive: true });
  for (const state of states) for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, serviceWorkers: "block", reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC" });
    const calls = [];
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      calls.push({ method: route.request().method(), path: url.pathname });
      let body = {}, status = 200;
      if (url.pathname.startsWith("/api/trpc/")) {
        if (state === "auth-loading") return;
        const values = url.pathname.slice(10).split(",").map(name => ({ result: { data: { json: name === "auth.me" && state !== "signed-out" ? account : null } } }));
        body = url.searchParams.has("batch") ? values : values[0];
      } else if (url.pathname === "/api/notifications") {
        if (state === "loading") return;
        if (state === "load-error") { status = 503; body = { error: "Your alerts could not be loaded. Try again." }; }
        else body = { notifications: ["empty", "saved-empty", "saved", "step-up"].includes(state) ? [] : notifications, unreadCount: state === "empty" ? 0 : 2 };
      } else if (/^\/api\/notifications\/\d+\/read$/.test(url.pathname)) {
        if (state === "partial-read" && url.pathname.endsWith("/1/read")) { status = 503; body = { error: "Synthetic read failure" }; }
        else body = { success: true };
      } else if (url.pathname === "/api/company-referrals/access") {
        body = { verifiedCompanyAccess: state === "step-up", workEmailDomain: state === "step-up" ? "acme.example" : null, companyName: state === "step-up" ? "Acme" : null, companyInitials: state === "step-up" ? "A" : null, codeRequired: state === "step-up" };
      } else if (url.pathname === "/api/seeker-alerts") {
        body = { alerts: state === "saved" ? [{ id: 1, companyDomain: "acme.example", paused: false, notifiedAt: null, createdAt: "2026-11-18T00:00:00Z" }] : [] };
      } else if (url.pathname === "/api/companies") body = { companies: [], openCount: 0 };
      else if (url.pathname === "/api/account/preferences") body = { preferences: { timeZone: "UTC", dateFormat: "dmy" } };
      else if (url.pathname === "/api/account/signup-language") body = { ok: true };
      else if (url.pathname === "/api/dev-auth/session") body = { signedIn: state !== "signed-out", account: state === "signed-out" ? null : account };
      else if (url.pathname === "/api/credits/summary") body = { summary: { totalAvailable: 3 } };
      else { status = 404; body = { error: "Outside capture fixture" }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await context.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "essential"));
    const page = await context.newPage(), pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-11-19T12:00:00Z"));
    await page.goto(`${origin}/alerts`, { waitUntil: "domcontentloaded" });
    const main = page.locator('main[data-skipwait-screen^="alerts"]');
    if (state === "auth-loading") await main.getByText("Loading your alerts…", { exact: true }).waitFor();
    else {
      await main.getByRole("heading", { level: 1, name: "See what needs you." }).waitFor();
      if (state === "signed-out") await main.getByTestId("goal-button").waitFor();
      else if (state === "loading") await main.getByText(/Loading your alerts…/).waitFor();
      else if (state === "load-error") await main.getByRole("button", { name: "Try again" }).waitFor();
      else if (state === "step-up") await main.getByRole("button", { name: "Send code", exact: true }).waitFor();
      else if (state.startsWith("saved")) {
        await main.getByRole("button", { name: "Saved alerts", exact: true }).click();
        await main.getByRole("button", { name: "New alert", exact: true }).waitFor();
        if (state === "saved") await main.getByText("acme.example", { exact: true }).waitFor();
      } else if (state === "empty") await main.getByRole("heading", { name: "No notifications yet." }).waitFor();
      else {
        await main.getByRole("button", { name: "A referrer replied, unread", exact: true }).waitFor();
        if (state === "filtered") await main.getByRole("button", { name: /^Unread/ }).click();
        if (["marked-read", "partial-read"].includes(state)) {
          await main.getByRole("button", { name: "Mark all read", exact: true }).click();
          if (state === "marked-read") await main.getByRole("heading", { name: "You are all caught up." }).waitFor();
          else await main.getByText("Some alerts could not be marked read. Try again.", { exact: true }).waitFor();
        }
      }
    }
    if (!["signed-out", "auth-loading"].includes(state)) await page.getByRole("link", { name: "3 referrals left. Open plan details", exact: true }).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow || pageErrors.length) throw new Error(JSON.stringify({ state, width, overflow, pageErrors }));
    if (state === "signed-out" && calls.some(call => ["/api/notifications", "/api/company-referrals/access", "/api/seeker-alerts"].includes(call.path))) throw new Error("Signed-out page made a private API read");
    const file = `${state}-${width}.png`;
    await page.screenshot({ path: path.join(here, phase, file), fullPage: true, animations: "disabled" });
    results.push({ state, width, file, overflow, pageErrors, calls, sha256: createHash("sha256").update(await readFile(path.join(here, phase, file))).digest("hex") });
    await context.close();
  }
  await writeFile(path.join(here, `${phase}.json`), JSON.stringify({ synthetic: true, sourceHead: git(["rev-parse", "HEAD"]), baselineRef: phase === "before" ? baselineRef : null, entryPath, entrySha256, results }, null, 2) + "\n");
  if (phase === "after") {
    const before = JSON.parse(await readFile(path.join(here, "before.json"), "utf8"));
    const comparisons = [];
    for (const result of results) {
      const pair = before.results.find(item => item.file === result.file);
      if (!pair) throw new Error(`Missing baseline ${result.file}`);
      const [a, b] = await Promise.all(["before", "after"].map(folder => sharp(path.join(here, folder, result.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error(`Dimensions changed: ${result.file}`);
      let differentPixels = 0;
      for (let i = 0; i < a.data.length; i += 4) if (!a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) differentPixels++;
      const readPaths = calls => [...new Set(calls.filter(call => call.method === "GET").map(call => call.path))].sort();
      const mutations = calls => calls.filter(call => call.method !== "GET").map(call => `${call.method} ${call.path}`).sort();
      comparisons.push({ file: result.file, differentPixels, beforeSha256: pair.sha256, afterSha256: result.sha256, sameApiCalls: JSON.stringify(pair.calls) === JSON.stringify(result.calls), sameReadPaths: JSON.stringify(readPaths(pair.calls)) === JSON.stringify(readPaths(result.calls)), sameMutations: JSON.stringify(mutations(pair.calls)) === JSON.stringify(mutations(result.calls)) });
    }
    await writeFile(path.join(here, "comparison.json"), JSON.stringify({ synthetic: true, beforeEntrySha256: before.entrySha256, afterEntrySha256: entrySha256, comparisons }, null, 2) + "\n");
    console.log(JSON.stringify({ phase, captures: results.length, differentPixels: comparisons.reduce((sum, result) => sum + result.differentPixels, 0), apiCallDifferences: comparisons.filter(result => !result.sameApiCalls).length }));
  } else console.log(JSON.stringify({ phase, captures: results.length, entrySha256 }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
