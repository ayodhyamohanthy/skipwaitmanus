// Synthetic local preview only: all API and external requests are intercepted.
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const checkoutBase = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const entryPath = "client/src/pages/Verify.tsx";
const sourceSha256 = createHash("sha256").update(await readFile(path.join(root, entryPath))).digest("hex");
const publicDir = path.join(root, "dist/public");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = path.resolve(publicDir, `.${pathname}`);
  if (!file.startsWith(`${publicDir}/`)) { res.writeHead(404).end(); return; }
  try { res.writeHead(200, { "Content-Type": mime[path.extname(pathname)] ?? "text/html" }).end(await readFile(path.extname(pathname) ? file : path.join(publicDir, "index.html"))); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const account = { id: 9, openId: "synthetic-verify", name: "Test Referrer", email: "referrer@example.test", role: "user", loginMethod: "fixture", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", lastSignedIn: "2026-10-01T00:00:00Z" };
const company = { slug: "acme", name: "Acme", initials: "A", industry: "Technology", location: "Worldwide", functions: ["Design"], blurb: "Synthetic verification fixture.", domains: ["acme.example"], openToReferrals: false };
const states = ["signed-out", "auth-loading", "directory-loading", "directory-error", "empty", "company", "email", "invalid-email", "code", "locked", "enrollment-error", "verified"];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  await mkdir(path.join(here, phase), { recursive: true });
  for (const state of states) for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, serviceWorkers: "block", reducedMotion: "reduce", locale: "en-US" });
    const calls = [];
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let status = 200, body = {};
      if (url.pathname.startsWith("/api/trpc/")) {
        if (state === "auth-loading") return;
        const values = url.pathname.slice(10).split(",").map(name => ({ result: { data: { json: name === "auth.me" && state !== "signed-out" ? account : null } } }));
        body = url.searchParams.has("batch") ? values : values[0];
      } else if (url.pathname === "/api/companies") {
        if (state === "directory-loading") return;
        if (state === "directory-error") { status = 503; body = { error: "The company directory is unavailable right now" }; }
        else body = { companies: state === "empty" ? [] : [company], openCount: 0 };
      } else if (url.pathname === "/api/work-email/otp/send") { calls.push("send"); body = { sent: true }; }
      else if (url.pathname === "/api/work-email/otp/verify") {
        calls.push("verify");
        if (state === "locked") { status = 429; body = { error: "Too many tries. Wait 15 minutes.", retryAfterSeconds: 900 }; }
        else body = { verified: true, receipt: "synthetic-one-use-receipt" };
      } else if (url.pathname === "/api/company-referrals/verify-work-email") {
        calls.push("enroll");
        if (state === "enrollment-error") { status = 503; body = { error: "We could not verify your work email" }; }
        else body = { verified: true, workEmailDomain: "acme.example" };
      } else if (url.pathname === "/api/referrer-preferences") body = { preferences: { preferAreas: ["Design"], referralCapacity: 3 } };
      else if (url.pathname === "/api/profile/me") body = { profile: { handle: null } };
      else if (url.pathname === "/api/company-referrals/access") body = { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null };
      else if (url.pathname === "/api/account/preferences") body = { preferences: { timeZone: "UTC", dateFormat: "dmy" } };
      else if (url.pathname === "/api/dev-auth/session") body = { signedIn: state !== "signed-out", account: state === "signed-out" ? null : account };
      else if (url.pathname === "/api/notifications") body = { notifications: [], unreadCount: 0 };
      else if (url.pathname === "/api/account/signup-language") body = { ok: true };
      else { status = 404; body = { error: "Outside capture fixture" }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await context.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "essential"));
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/verify`, { waitUntil: "domcontentloaded" });
    if (state === "auth-loading") await page.getByText("Checking your sign-in…", { exact: true }).waitFor();
    else {
      await page.locator('[data-goal-page="verify"]').waitFor();
      if (state === "signed-out") await page.getByRole("link", { name: "Sign in with work email" }).waitFor();
      else if (state === "directory-loading") await page.getByTestId("goal-skeleton-rows").waitFor();
      else if (state === "directory-error") await page.getByRole("alert").waitFor();
      else if (state === "empty") await page.getByText("No companies are open for verification yet.").waitFor();
      else {
        await page.getByRole("radio", { name: /Acme/ }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (state !== "company") {
          await page.getByRole("button", { name: "Continue", exact: true }).click();
          await page.getByLabel("Work email", { exact: true }).fill(state === "invalid-email" ? "referrer@gmail.com" : "referrer@acme.example");
          if (state !== "email") {
            await page.getByRole("button", { name: "Send code", exact: true }).click();
            if (state === "invalid-email") await page.getByRole("alert").waitFor();
            else {
              await page.getByRole("heading", { name: "Enter the code", exact: true }).waitFor();
              if (state !== "code") {
                // One input event uses the page's existing multi-digit distribution,
                // avoiding a race with its delayed first-box focus.
                await page.getByLabel("Digit 1", { exact: true }).fill("123456");
                await page.getByRole("button", { name: "Verify", exact: true }).click();
                if (state === "verified") await page.getByText("Verified via work email · Design", { exact: true }).waitFor();
                else await page.getByRole("alert").waitFor();
              }
            }
          }
        }
      }
    }
    if (state === "code") await page.getByLabel("Digit 1", { exact: true }).focus();
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow || errors.length) throw new Error(JSON.stringify({ state, width, overflow, errors }));
    const file = `${state}-${width}.png`;
    await page.screenshot({ path: path.join(here, phase, file), fullPage: true, animations: "disabled" });
    results.push({ state, width, file, overflow, errors, calls, sha256: createHash("sha256").update(await readFile(path.join(here, phase, file))).digest("hex") });
    await context.close();
  }
  await writeFile(path.join(here, `${phase}.json`), JSON.stringify({ synthetic: true, checkoutBase, entryPath, sourceSha256, results }, null, 2));
  console.log(JSON.stringify({ phase, captures: results.length, errors: 0, overflow: 0, sourceSha256 }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
