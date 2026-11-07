// SUPPORT-A (docs/plans/SUPPORT-A.md A7): capture the kit /support page at the
// two required widths after R1-R5. Every /api call is answered in the browser;
// nothing reaches a backend and no account is used.
//   VITE_GOAL_SURFACES= node node_modules/vite/bin/vite.js --port 5199 --strictPort
//   node artifacts/support-promises/capture.mjs
// Output: support-promises-<width>.png and manifest.json beside this file.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const BASE = process.env.CAPTURE_BASE || "http://localhost:5199";
const out = new URL("./", import.meta.url);

const REMOVED = [
  "A person answers",
  "within one business day",
  "reaches an administrator directly",
  "Response target",
  "handled first",
  "triaged ahead of everything else",
  "can be paused while we look",
  "in-product notification when an administrator decides",
];

const widths = [
  [1280, 900, 1],
  [390, 844, 2],
];

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const clean = line => line.replace(/@fs\/[^\s)"']+/g, "<vite-dep>").replace(/https?:\/\/localhost:\d+/g, "<local>");
const results = [];
try {
  for (const [width, height, dpr] of widths) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: dpr,
      isMobile: width < 600,
      hasTouch: width < 600,
    });
    const page = await context.newPage();
    const errors = [];
    const unmatched = new Set();
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", err => errors.push(String(err)));
    page.on("requestfailed", req => unmatched.add(req.url()));
    await page.route("**/api/**", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

    const response = await page.goto(`${BASE}/support`, { waitUntil: "networkidle" });
    await page.waitForSelector("h1", { timeout: 15000 });
    const h1 = (await page.locator("h1").first().textContent())?.trim() ?? "";
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const leaked = REMOVED.filter(phrase => body.includes(phrase));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const file = `support-promises-${width}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(file, out)), fullPage: true });
    results.push({ width, height, dpr, url: `${BASE}/support`, status: response?.status() ?? 0, h1, leaked, horizontalOverflow: overflow, consoleErrors: errors.map(clean), failedRequests: [...unmatched].map(clean), file });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(new URL("manifest.json", out), `${JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, runs: results }, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
if (results.some(r => r.leaked.length || r.horizontalOverflow || r.status !== 200)) process.exitCode = 1;
