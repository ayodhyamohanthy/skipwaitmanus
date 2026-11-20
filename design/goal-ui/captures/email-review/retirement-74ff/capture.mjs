// Synthetic local production bundles only. All APIs and external hosts are intercepted.
// The before phase loads the actual entry from the recorded main commit; every
// other module is identical. No design flag, production identity or live write.
import { chromium } from "playwright";
import { build } from "vite";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");
const baseline = "45258e7a158fd66d8063883a0a91d6f923994b8f";
const entryPath = "client/src/pages/EmailReviewAction.tsx";
const goalPath = "client/src/pages/goal/email-review/GoalEmailReviewAction.tsx";
const beforeSource = execFileSync("git", ["show", `${baseline}:${entryPath}`], { cwd: root, encoding: "utf8" });
const afterSource = await readFile(path.join(root, entryPath), "utf8");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const token = "e".repeat(48);
const reviewLink = `/api/referrer-review-links/${token}`;
const account = { id: 9, openId: "synthetic-email-review", name: "Synthetic Referrer", email: "referrer@example.test", role: "user", loginMethod: "fixture", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", lastSignedIn: "2026-10-01T00:00:00Z" };
const states = ["signed-out", "auth-loading", "review", "approved", "passed", "unavailable", "step-up", "step-up-code", "step-up-resumed", "access-error"];
const results = [];
const beforeDist = await mkdtemp(path.join(tmpdir(), "opencode/email-review-baseline-"));
await build({
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "error",
  build: { outDir: beforeDist, emptyOutDir: true },
  plugins: [{ name: "recorded-email-review-entry", enforce: "pre", load(id) {
    if (id.split("?")[0] === path.join(root, entryPath)) return beforeSource;
  } }],
});
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const phase of ["before", "after"]) {
    const publicDir = phase === "before" ? beforeDist : path.join(root, "dist/public");
    const server = createServer(async (request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const file = path.resolve(publicDir, `.${pathname}`);
      if (!file.startsWith(`${publicDir}/`)) { response.writeHead(404).end(); return; }
      try {
        response.writeHead(200, { "Content-Type": mime[path.extname(pathname)] ?? "text/html" });
        response.end(await readFile(path.extname(pathname) ? file : path.join(publicDir, "index.html")));
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No preview port");
    const base = `http://127.0.0.1:${address.port}`;
    await mkdir(path.join(here, phase), { recursive: true });
    try {
      for (const state of states) for (const width of [1280, 390]) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, serviceWorkers: "block", reducedMotion: "reduce", locale: "en-US" });
        const requests = [], unmatched = [], errors = [];
        let verified = false;
        const needsCode = state.startsWith("step-up") || state === "access-error";
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== base) return route.abort();
          if (!url.pathname.startsWith("/api/")) return route.continue();
          requests.push({ path: url.pathname, method: request.method(), body: request.postData() });
          let status = 200, body = {};
          if (url.pathname.startsWith("/api/trpc/")) {
            if (state === "auth-loading") return;
            const values = url.pathname.slice(10).split(",").map(name => ({ result: { data: { json: name === "auth.me" && state !== "signed-out" ? account : null } } }));
            body = url.searchParams.has("batch") ? values : values[0];
          } else if (url.pathname === reviewLink) {
            if (state === "unavailable") { status = 410; body = { error: "This review was already decided" }; }
            else if (needsCode && !verified) { status = 403; body = { error: "Confirm your work email with a code to continue.", code: "work_email_code_required" }; }
            else body = { review: { ready: true } };
          } else if (url.pathname === `${reviewLink}/decision`) {
            body = { status: state === "passed" ? "passed" : "approved" };
          } else if (url.pathname === "/api/company-referrals/access") {
            if (state === "access-error") { status = 503; body = { error: "Server error" }; }
            else body = { verifiedCompanyAccess: true, workEmailDomain: "example.test", companyName: "Example", companyInitials: "E", ...(verified ? {} : { codeRequired: true }) };
          } else if (url.pathname === "/api/referrer/step-up/send") {
            body = { sent: true, challengeId: "c".repeat(43), expiresAt: "2026-11-19T22:00:00Z" };
          } else if (url.pathname === "/api/referrer/step-up/verify") {
            verified = true; body = { verified: true, expiresAt: "2026-11-20T10:00:00Z" };
          } else if (url.pathname === "/api/account/preferences") body = { preferences: { timeZone: "UTC", dateFormat: "dmy" } };
          else if (url.pathname === "/api/account/signup-language") body = { ok: true };
          else if (url.pathname === "/api/dev-auth/session") body = { signedIn: state !== "signed-out", account: state === "signed-out" ? null : account };
          else { unmatched.push(url.pathname); status = 404; body = { error: "Outside capture fixture" }; }
          await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        });
        await context.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "essential"));
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.goto(`${base}/email-review/${token}`, { waitUntil: "domcontentloaded" });
          if (state === "signed-out") await page.getByRole("link", { name: "Sign in with work email" }).waitFor();
          else if (state === "auth-loading") await page.getByRole("heading", { name: "Opening private review…" }).waitFor();
          else if (state === "unavailable") await page.getByRole("alert").waitFor();
          else if (state === "access-error") await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
          else if (needsCode) {
            await page.getByLabel("Work email", { exact: true }).waitFor();
            if (state !== "step-up") {
              await page.getByLabel("Work email", { exact: true }).fill("referrer@example.test");
              await page.getByRole("button", { name: "Send code", exact: true }).click();
              await page.getByLabel("Code", { exact: true }).waitFor();
              if (state === "step-up-resumed") {
                await page.getByLabel("Code", { exact: true }).fill("123456");
                await page.getByRole("button", { name: "Confirm", exact: true }).click();
                await page.getByRole("heading", { name: "Decide on this referral.", exact: true }).waitFor();
              }
            }
          } else {
            await page.getByRole("heading", { name: "Decide on this referral.", exact: true }).waitFor();
            if (state === "approved") {
              await page.getByRole("checkbox").check();
              await page.getByRole("button", { name: "Accept & connect", exact: true }).click();
              await page.getByRole("heading", { name: "Request accepted.", exact: true }).waitFor();
            } else if (state === "passed") {
              await page.getByRole("button", { name: "Decline - not now", exact: true }).click();
              await page.getByRole("heading", { name: "Passed privately.", exact: true }).waitFor();
            }
          }
          await page.evaluate(() => document.fonts.ready);
          await page.locator("body").click({ position: { x: 1, y: 1 } });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow || errors.length || unmatched.length) throw new Error(JSON.stringify({ phase, state, width, overflow, errors, unmatched }));
          const file = `${state}-${width}.png`;
          await page.screenshot({ path: path.join(here, phase, file), fullPage: true, animations: "disabled" });
          results.push({ phase, state, width, file: `${phase}/${file}`, overflow, errors, unmatched, requests, sha256: sha256(await readFile(path.join(here, phase, file))) });
        } finally { await context.close(); }
      }
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
} finally { await browser.close(); }
const comparisons = results.filter(row => row.phase === "before").map(before => {
  const after = results.find(row => row.phase === "after" && row.state === before.state && row.width === before.width);
  return { state: before.state, width: before.width, sameImage: before.sha256 === after.sha256, sameRequests: JSON.stringify(before.requests) === JSON.stringify(after.requests) };
});
await writeFile(path.join(here, "receipt.json"), JSON.stringify({ synthetic: true, preview: "Two production bundles, identical source apart from the recorded route entry; no design override", baseline, entryPath, beforeSourceSha256: sha256(beforeSource), afterSourceSha256: sha256(afterSource), goalSourceSha256: sha256(await readFile(path.join(root, goalPath))), results, comparisons }, null, 2));
console.log(JSON.stringify({ captures: results.length, comparisons }));
console.log("Capture complete. Run compare.mjs to validate request multisets, private-flow order and decoded pixels; inspect every reported visual difference.");
