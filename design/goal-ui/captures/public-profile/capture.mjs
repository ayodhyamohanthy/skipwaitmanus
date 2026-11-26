// D-048-p3-public-profile captures. Synthetic local evidence only (example
// domains, no real people). Build with the flag on, then capture against the
// static build:
//   VITE_GOAL_SURFACES=all pnpm build
//   node design/goal-ui/captures/public-profile/capture.mjs
// Every /api call is answered by the fixtures below; every other https request
// is aborted, so nothing leaves the machine.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { extname, join } from "node:path";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const root = new URL("../../../../dist/public/", import.meta.url).pathname;
const out = new URL("./", import.meta.url);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = join(root, path);
  try { if (!(await stat(file)).isFile()) throw new Error("dir"); } catch { file = join(root, "index.html"); }
  try {
    const content = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    try {
      const fallback = await readFile(join(root, "index.html"));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(fallback);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
});
await new Promise(resolve => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const PIECES = [
  { id: 1, title: "Checkout redesign", kind: "case_study", source: "Behance", url: "https://portfolio.synthetic.example/checkout", pinned: true, visibleOnProfile: true },
  { id: 2, title: "Design system for a fintech app", kind: "project", source: "GitHub", url: "https://code.synthetic.example/design-system", pinned: false, visibleOnProfile: true },
  { id: 3, title: "Private sketchbook", kind: "project", source: null, url: null, pinned: false, visibleOnProfile: false },
];
const VISIBLE = {
  visible: true, visibility: "public", isOwner: false,
  displayName: "Asha Rao", headline: "Senior product designer", location: "Bengaluru",
  openTo: ["Product Designer", "UX Lead"], company: "Synthetic Co",
  verifiedWork: { domain: "synthetic.example", verifiedAt: "2026-01-01" },
  handle: "asha-rao", workItems: PIECES.slice(0, 2),
};
const OWNER = { ...VISIBLE, isOwner: true, visibility: "link", workItems: PIECES };
const EMPTY = { ...VISIBLE, workItems: [] };
const PRIVATE = { visible: false, visibility: "private" };

const scenarios = [
  ["visible", "/p/asha-rao", [200, { profile: VISIBLE }]],
  ["empty", "/p/asha-rao", [200, { profile: EMPTY }]],
  ["private", "/p/asha-rao", [200, { profile: PRIVATE }]],
  ["missing", "/p/nobody-here", [404, { error: "This profile isn't available" }]],
  ["error", "/p/asha-rao", [500, { error: "We couldn't load this profile." }]],
  ["owner", "/p/asha-rao", [200, { profile: OWNER }]],
  ["owner-visitor", "/p/asha-rao", [200, { profile: OWNER }], { action: "visitor" }],
  ["offline", "/p/asha-rao", [200, { profile: OWNER }], { action: "offline" }],
];

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const [width, height, dpr] of [[1280, 900, 1], [390, 844, 2]]) {
    for (const [name, route, fixture, opts = {}] of scenarios) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, timezoneId: "Asia/Kolkata", locale: "en-IN" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**", r => r.abort());
      await page.route("**/api/**", async r => {
        const [status, body] = fixture;
        await r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "all"));
      await page.goto(base + route, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-goal-page]");
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      // document.fonts.ready can resolve before the goal fonts are first used;
      // wait for the faces the page actually paints with.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.fonts.check('700 28px "Instrument Sans"') && document.fonts.check('400 16px "Instrument Sans"'));
      if (opts.action === "visitor") await page.getByRole("tab", { name: "Visitor" }).click();
      if (opts.action === "offline") { await context.setOffline(true); await page.getByTestId("goal-offline-state").waitFor(); }
      await page.waitForTimeout(300);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
        h1: document.querySelector("h1")?.textContent,
        primaries: document.querySelectorAll("[data-g-primary]").length,
        nestedButtons: document.querySelectorAll("button button").length,
        kitHexClasses: [...document.querySelectorAll("[class]")].filter(el => /#[0-9a-f]{3,6}/i.test(String(el.getAttribute("class")))).length,
        outsideGoalScope: [...document.body.querySelectorAll("body > *:not(script)")].flatMap(el => [...el.children]).filter(el => !el.closest(".g-scope") && el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== "none").map(el => (el.getAttribute("data-skipwait-screen") || el.tagName) + ":" + (el.textContent || "").trim().slice(0, 60)),
        text: (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
      }));
      const file = `${name}-${width}.png`;
      await page.screenshot({ path: new URL(file, out).pathname, fullPage: true });
      results.push({ file, route, viewport: { width, height, dpr }, metrics, errors });
      console.log(JSON.stringify({ file, h1: metrics.h1, primaries: metrics.primaries, overflow: metrics.scrollWidth > width, errors }));
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  await writeFile(new URL("manifest.json", out), JSON.stringify({ source: process.env.CAPTURE_SOURCE ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), command: "VITE_GOAL_SURFACES=all pnpm build && node design/goal-ui/captures/public-profile/capture.mjs", synthetic: true, results }, null, 2) + "\n");
}
