// Local synthetic reproduction only. No production account, provider or money.
// Run from the repository root: node client/src/pages/goal/admin-money/retirement/capture.mjs
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = process.cwd();
const out = path.join(root, "client/src/pages/goal/admin-money/retirement");
const fixture = JSON.parse(await readFile(path.join(out, "catalogFixture.json"), "utf8"));
const base = "http://127.0.0.1:4387";
const sources = ["client/src/pages/AdminCatalogSync.tsx", "client/src/pages/goal/admin-money/GoalAdminCatalogSync.tsx", "client/src/pages/goal/admin-money/GoalCatalogPlanDetails.tsx"];
const main = `import React from 'react'; import {createRoot} from 'react-dom/client';
import Catalog from '@/pages/AdminCatalogSync'; import '@/index.css';
createRoot(document.getElementById('root')).render(<Catalog/>);`;
const auth = `import React from 'react';
export const useAuth=()=>({isLoaded:true,isSignedIn:true,getToken:async()=>null,openSignIn:()=>{}});
export const SignInButton=({children})=><>{children}</>;`;
const server = await createServer({
  configFile: path.join(root, "vite.config.ts"), mode: "retirement-reproduction", logLevel: "error",
  plugins: [{ name: "catalog-retirement-reproduction", enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (file === path.join(root, "client/src/main.tsx")) return { code: main, map: null };
      if (file === path.join(root, "client/src/_core/auth.tsx")) return { code: auth, map: null };
      if (file === path.join(root, "client/src/lib/goalSurfaces.ts")) return { code: "export const goalSurfaceOn=()=>window.__catalogDesign==='goal';", map: null };
    },
  }],
  server: { host: "127.0.0.1", port: 4387, strictPort: true, hmr: false },
});
await server.listen();
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true });
  await mkdir(path.join(out, "captures"), { recursive: true });
  for (const design of ["legacy", "goal"]) for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block" });
    await context.addInitScript(design => { window.__catalogDesign = design; localStorage.setItem("skipwait:cookie-consent", "essential"); }, design);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    const calls = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const method = route.request().method();
      calls.push({ path: url.pathname, method, body: route.request().postData() });
      if (url.pathname === "/api/admin/billing/catalog-sync") return route.fulfill({ json: fixture.dryRun });
      if (url.pathname === "/api/admin/billing/catalog-sync/apply" && method === "POST") return route.fulfill({ json: fixture.report });
      throw new Error(`Unexpected synthetic API request: ${method} ${url.pathname}`);
    });
    try {
      await page.goto(`${base}/admin/catalog-sync`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "To create (1)", exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(out, "captures", `${design}-plan-${width}.png`), fullPage: true });
      const before = await page.locator("body").innerText();
      await page.getByRole("textbox", { name: /Type the site.*confirm/ }).fill("fixture-test");
      await page.getByRole("button", { name: /^Apply/ }).click();
      const report = page.locator('[data-testid="catalog-report"], section[role="status"]');
      await report.waitFor();
      const reportText = await report.innerText();
      await report.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, "captures", `${design}-partial-${width}.png`), fullPage: true });
      results.push({ design, width, synthetic: true, visible: {
        extra: before.includes("fixture-extra-INR"), excluded: before.includes("fixture-excluded-INR"),
        failure: reportText.includes("fixture-failed-INR"), reason: reportText.includes(fixture.report.failed.message),
        unattempted: reportText.includes("fixture-unattempted-INR"), rerun: await report.getByRole("button", { name: "Run the dry run again" }).count(),
      }, reportText, calls, errors, overflow: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)) });
    } finally { await context.close(); }
  }
} finally {
  if (browser) await browser.close();
  await server.close();
}
const sourceHashes = {};
for (const file of sources) sourceHashes[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
const receipt = { source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), capturedAt: new Date().toISOString(), command: "node client/src/pages/goal/admin-money/retirement/capture.mjs", synthetic: true, productionRequests: 0, sourceHashes, results };
await writeFile(path.join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
