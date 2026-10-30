// D-048-p3-discovery captures. Synthetic local evidence only (example domains,
// no real people). Build with the flag on, then capture against the static build:
//   VITE_GOAL_SURFACES=all pnpm build
//   node design/goal-ui/captures/discovery/capture.mjs
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
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
});
await new Promise(resolve => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const opening = (id, roleTitle, over = {}) => ({ id, companyDomain: "synthetic.example", kind: "hiring_now", roleTitle, targetRoleUrl: `https://careers.synthetic.example/jobs/${id}`, location: "Remote", walkInAt: null, walkInEndsAt: null, createdAt: "2026-10-28T00:00:00.000Z", poster: { kind: "anonymous" }, ...over });
const WALL = { opportunities: [
  opening(1, "Product Designer", { isSponsored: true }),
  opening(2, "Data Analyst", { companyDomain: "example.org", poster: { kind: "firstName", firstName: "Asha" }, location: "Bengaluru" }),
  opening(3, "Walk-in: Support Associates", { kind: "walk_in", targetRoleUrl: null, location: "Hyderabad", walkInAt: "2026-11-04T04:30:00.000Z", walkInEndsAt: "2026-11-04T10:30:00.000Z" }),
  opening(4, "Backend Engineer"),
] };
const PARTNERS = { modules: [{ id: 9, partnerName: "Synthetic Prep", headline: "Practice a mock interview", description: "Thirty minutes with a reviewer.", ctaLabel: "See how it works", ctaUrl: "https://partner.synthetic.example" }] };
const COMPANIES = { companies: [{ slug: "synthetic", name: "Synthetic Co", domains: ["synthetic.example"] }, { slug: "example-org", name: "Example Org", domains: ["example.org"] }] };
const JOBS = { jobs: [
  { id: 11, title: "Senior Product Designer", company: "Synthetic Co", location: "Bengaluru", seniority: "Senior", workMode: "Hybrid", targetRoleUrl: "https://careers.synthetic.example/jobs/11" },
  { id: 12, title: "Backend Engineer", company: "Example Org", location: "Remote", seniority: "Mid", workMode: "Remote", targetRoleUrl: null },
  { id: 13, title: "Data Scientist", company: "Synthetic Co", location: "Pune", seniority: "Mid", workMode: "Onsite", targetRoleUrl: "https://careers.synthetic.example/jobs/13" },
  { id: 14, title: "Engineering Manager, Payments Platform", company: "Example Org", location: "Remote", seniority: "Lead", workMode: "Remote", targetRoleUrl: "https://careers.example.org/jobs/14" },
] };

const scenarios = [
  ["wall-default", "/wall", { "/api/opportunities": [200, WALL] }],
  ["wall-walk-in", "/wall?opening=3", { "/api/opportunities": [200, WALL] }],
  ["wall-empty", "/wall", { "/api/opportunities": [200, { opportunities: [] }] }],
  ["wall-error", "/wall", { "/api/opportunities": [503, { error: "Internal openings are temporarily unavailable. Please try again." }] }],
  ["jobs-default", "/jobs", { "/api/jobs": [200, JOBS] }],
  ["jobs-no-link", "/jobs?job=12", { "/api/jobs": [200, JOBS] }],
  ["jobs-empty", "/jobs?q=astronaut", { "/api/jobs": [200, { jobs: [] }] }],
  ["jobs-error", "/jobs", { "/api/jobs": [500, { error: "We could not load the job list" }] }],
];

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const [width, height, dpr] of [[1280, 900, 1], [390, 844, 2]]) {
    for (const [name, route, fixtures] of scenarios) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**", r => r.abort());
      await page.route("**/api/**", async r => {
        const path = new URL(r.request().url()).pathname;
        const [status, body] = fixtures[path] ?? (path === "/api/partners" ? [200, PARTNERS] : path === "/api/companies" ? [200, COMPANIES] : path.startsWith("/api/trpc/") ? [200, path.slice(10).split(",").map(() => ({ result: { data: { json: null } } }))] : [401, {}]);
        await r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "all"));
      await page.goto(base + route, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-goal-page]");
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth, h1: document.querySelector("h1")?.textContent, primaries: document.querySelectorAll("[data-g-primary]").length }));
      const file = `${name}-${width}.png`;
      await page.screenshot({ path: new URL(file, out).pathname, fullPage: true });
      results.push({ file, route, viewport: { width, height, dpr }, metrics, errors });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  await writeFile(new URL("manifest.json", out), JSON.stringify({ source: process.env.CAPTURE_SOURCE ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), command: "VITE_GOAL_SURFACES=all pnpm build && node design/goal-ui/captures/discovery/capture.mjs", synthetic: true, results }, null, 2) + "\n");
}
