#!/usr/bin/env node
// Synthetic local evidence only (D-048-p3-for-companies).
// Serves built dist/public (built with VITE_GOAL_SURFACES=all) with SPA fallback,
// mocks every /api call at the network layer (nothing reaches a backend),
// and writes <scenario>-<width>.png and manifest-all.json beside this file.
// Usage: node design/goal-ui/captures/for-companies/capture.mjs [390|1280]
import { createServer } from "node:http";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(process.env.DIST_DIR || path.join(here, "..", "..", "..", "..", "dist", "public"));

const makeCompany = (slug, name) => ({
  slug,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  industry: "Software",
  location: "Remote",
  functions: ["Engineering"],
  blurb: `${name} builds software.`,
  domains: [`${slug}.example.com`],
  openToReferrals: false,
});

const SAMPLE_COMPANIES = [
  makeCompany("quillmint", "Quillmint"),
  makeCompany("northbeam", "Northbeam"),
  makeCompany("stripe", "Stripe"),
  makeCompany("google", "Google"),
  makeCompany("figma", "Figma"),
];

const scenarios = [
  {
    name: "default",
    companies: SAMPLE_COMPANIES,
    waitFor: "text=Quillmint",
  },
  {
    name: "empty",
    companies: [],
    waitFor: '[data-testid="goal-empty-state"]',
  },
  {
    name: "error",
    error: true,
    waitFor: '[data-testid="goal-error-state"]',
  },
  {
    name: "loading",
    hang: true,
    waitFor: '[data-testid="goal-skeleton-rows"]',
  },
];

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(dist, "index.html");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const VIEWPORTS = [
  { width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter(v => !process.argv[2] || v.width === Number(process.argv[2]));

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];

try {
  for (const viewport of VIEWPORTS) {
    for (const scenario of scenarios) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        reducedMotion: "reduce",
        colorScheme: "light",
        locale: "en-US",
        timezoneId: "Asia/Kolkata",
      });

      await context.addInitScript(() => {
        try {
          localStorage.setItem("skipwait:cookie-consent", "all");
        } catch {}
      });

      const page = await context.newPage();
      const errors = [];
      const warnings = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => {
        if (m.type() === "error") errors.push(m.text());
      });

      await page.route("https://**", r => r.abort());
      await page.route("**/api/**", async route => {
        const url = new URL(route.request().url());
        const pathname = url.pathname;
        const json = (status, body) =>
          route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

        if (pathname === "/api/dev-auth/session") {
          return json(200, { signedIn: false });
        }
        if (pathname.startsWith("/api/trpc/")) {
          const procedures = pathname.slice("/api/trpc/".length).split(",");
          const body = procedures.map(p => ({ result: { data: { json: null } } }));
          return json(200, url.searchParams.get("batch") ? body : body[0]);
        }
        if (pathname === "/api/companies") {
          if (scenario.hang) return; // leave pending for loading state
          if (scenario.error) return json(500, { error: "Failed to load companies" });
          return json(200, { companies: scenario.companies, openCount: 0 });
        }
        return json(200, {});
      });

      await page.goto(base + "/for-companies", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector('[data-goal-page="for-companies"]', { timeout: 30000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForSelector(scenario.waitFor, { timeout: 15000 });
      await page.waitForTimeout(300);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      const file = `${scenario.name}-${viewport.width}.png`;
      const outPath = path.join(here, file);
      await page.screenshot({ path: outPath, fullPage: true });

      results.push({
        file,
        scenario: scenario.name,
        route: "/for-companies",
        viewport: { width: viewport.width, height: viewport.height },
        horizontalOverflowPx: overflow,
        errors,
        warnings,
      });

      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  const manifest = {
    source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    route: "/for-companies",
    command: "node design/goal-ui/captures/for-companies/capture.mjs",
    synthetic: true,
    results,
  };
  await writeFile(path.join(here, "manifest-all.json"), JSON.stringify(manifest, null, 2) + "\n");
}
