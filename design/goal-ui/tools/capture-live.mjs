#!/usr/bin/env node
// Live goal-UI captures at the two review widths (D-048: 1280 and 390).
// Renders a real route from the dev server with the API mocked at the network
// layer (no database, no provider keys), like scripts/kit-screens/capture.mjs,
// but writes plain full-page PNGs the way the W0 captures were taken.
//
// Usage: node design/goal-ui/tools/capture-live.mjs --route /requests --state empty \
//          [--base http://localhost:3000] [--out design/goal-ui/captures/my-asks] \
//          [--fixture <file.json>] [--wait 1200]
//
// Fixture: { "signedIn": { ... } | false, "routes": [{ method, path, match, status, body }],
//            "trpc": { "<procedure>": <data> }, "localStorage": { ... } }
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../package.json"));
const { chromium } = require("playwright");

const args = { base: process.env.CAPTURE_BASE || "http://localhost:3000", out: "design/goal-ui/captures", wait: "1200" };
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
if (!args.route || !args.state) { console.error("usage: capture-live.mjs --route /requests --state empty [--fixture f.json]"); process.exit(2); }
const fixture = args.fixture ? JSON.parse(await readFile(args.fixture, "utf8")) : {};
const signedIn = fixture.signedIn
  ? { openId: "fixture", loginMethod: "fixture", role: "user", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastSignedIn: "2026-10-08T00:00:00.000Z", ...fixture.signedIn }
  : null;

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [label, width, height, scale] of [["1280", 1280, 900, 1], ["390", 390, 844, 2]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/trpc/")) {
        const procedures = url.pathname.slice("/api/trpc/".length).split(",");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(procedures.map(name => ({
          result: { data: { json: name === "auth.me" ? signedIn : (fixture.trpc?.[name] ?? null) } },
        }))) });
      }
      const hit = (fixture.routes || []).find(r => r.method === route.request().method() && (r.match === "prefix" ? url.pathname.startsWith(r.path) : url.pathname === r.path));
      return route.fulfill({ status: hit?.status ?? 404, contentType: "application/json", body: JSON.stringify(hit?.body ?? { error: "not mocked" }) });
    });
    await page.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "all"));
    await page.goto(`${args.base}${args.route}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(Number(args.wait));
    const file = path.join(args.out, `${args.state}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${file}${overflow > 0 ? `  WARNING horizontal overflow ${overflow}px` : ""}${errors.length ? `  ERRORS ${errors.join(" | ").slice(0, 300)}` : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
}
