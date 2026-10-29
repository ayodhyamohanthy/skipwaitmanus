#!/usr/bin/env node
// D-048-p3-links captures at 1280 and 390 from synthetic fixtures.
// Serves a built dist/public (built with VITE_GOAL_SURFACES=all or =links)
// with an SPA fallback, mocks every /api call at the network layer (nothing
// reaches a backend), and writes <state>-<width>.png next to this file.
// Usage: node design/goal-ui/captures/links/capture.mjs [distDir]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.argv[2] || path.join(here, "..", "..", "..", "..", "dist", "public"));
const fixtures = JSON.parse(await readFile(path.join(here, "fixtures.json"), "utf8"));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  try { if ((await stat(file)).isDirectory()) file = path.join(file, "index.html"); } catch { file = path.join(dist, "index.html"); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const VIEWPORTS = [
  { width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

const browser = await chromium.launch();
const results = [];
for (const shot of fixtures.shots) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch });
    await context.addInitScript(() => { try { localStorage.setItem("skipwait:cookie-consent", "essential"); } catch { /* storage blocked */ } });
    const page = await context.newPage();
    await page.route("**/api/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      const hit = shot.routes.find(r => pathname === r.path);
      if (hit?.hang) return; // loading state: never answer
      if (hit) return route.fulfill({ status: hit.status, contentType: "application/json", body: JSON.stringify(hit.body) });
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Signed out" }) });
    });
    await page.goto(base + shot.url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(shot.waitFor, { timeout: 20_000 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const out = path.join(here, `${shot.name}-${viewport.width}.png`);
    await page.screenshot({ path: out, fullPage: true });
    results.push({ shot: shot.name, width: viewport.width, horizontalOverflowPx: overflow });
    await context.close();
  }
}
await browser.close();
server.close();
console.log(JSON.stringify(results, null, 1));
