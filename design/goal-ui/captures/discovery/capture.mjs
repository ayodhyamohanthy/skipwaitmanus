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

const opening = (id, roleTitle, over = {}) => ({ id, companyDomain: "synthetic.example", kind: "hiring_now", roleTitle, targetRoleUrl: `https://careers.synthetic.example/jobs/${id}`, location: "Remote", walkInAt: null, walkInEndsAt: null, createdAt: "2026-10-28T00:00:00.000Z", poster: { kind: "anonymous" }, ...over });
const WALL = { opportunities: [
  opening(1, "Product Designer", { isSponsored: true }),
  opening(2, "Data Analyst", { companyDomain: "example.org", poster: { kind: "firstName", firstName: "Asha" }, location: "Bengaluru" }),
  opening(3, "Walk-in: Support Associates", { kind: "walk_in", targetRoleUrl: null, location: "Hyderabad", walkInAt: "2026-11-04T04:30:00.000Z", walkInEndsAt: "2026-11-04T10:30:00.000Z" }),
  opening(4, "Backend Engineer"),
  opening(5, "Frontend Engineer", { location: "Remote" }),
  opening(6, "Product Manager", { companyDomain: "example.org", location: "Delhi" }),
  opening(7, "DevOps Engineer", { location: "Bengaluru" }),
  opening(8, "Security Specialist", { location: "Remote" }),
  opening(9, "Mobile Engineer (iOS)", { location: "Hyderabad" }),
  opening(10, "Mobile Engineer (Android)", { location: "Bengaluru" }),
  opening(11, "Staff Infrastructure Engineer", { location: "Remote" }),
  opening(12, "Technical Writer", { location: "Remote" }),
] };
const PARTNERS = { modules: [{ id: 9, partnerName: "Synthetic Prep", headline: "Practice a mock interview", description: "Thirty minutes with a reviewer.", ctaLabel: "See how it works", ctaUrl: "https://partner.synthetic.example" }] };
const COMPANIES = { companies: [{ slug: "synthetic", name: "Synthetic Co", domains: ["synthetic.example"] }, { slug: "example-org", name: "Example Org", domains: ["example.org"] }] };
const JOBS = { jobs: [
  { id: 11, title: "Senior Product Designer", company: "Synthetic Co", location: "Bengaluru", seniority: "Senior", workMode: "Hybrid", targetRoleUrl: "https://careers.synthetic.example/jobs/11" },
  { id: 12, title: "Backend Engineer", company: "Example Org", location: "Remote", seniority: "Mid", workMode: "Remote", targetRoleUrl: null },
  { id: 13, title: "Data Scientist", company: "Synthetic Co", location: "Pune", seniority: "Mid", workMode: "Onsite", targetRoleUrl: "https://careers.synthetic.example/jobs/13" },
  { id: 14, title: "Engineering Manager, Payments Platform", company: "Example Org", location: "Remote", seniority: "Lead", workMode: "Remote", targetRoleUrl: "https://careers.example.org/jobs/14" },
  { id: 15, title: "Site Reliability Engineer", company: "Synthetic Co", location: "Bengaluru", seniority: "Mid", workMode: "Hybrid", targetRoleUrl: "https://careers.synthetic.example/jobs/15" },
  { id: 16, title: "Frontend Engineer", company: "Example Org", location: "Remote", seniority: "Junior", workMode: "Remote", targetRoleUrl: "https://careers.example.org/jobs/16" },
  { id: 17, title: "Product Operations Lead", company: "Synthetic Co", location: "Mumbai", seniority: "Lead", workMode: "Onsite", targetRoleUrl: "https://careers.synthetic.example/jobs/17" },
  { id: 18, title: "Machine Learning Engineer", company: "Synthetic Co", location: "Bengaluru", seniority: "Senior", workMode: "Hybrid", targetRoleUrl: "https://careers.synthetic.example/jobs/18" },
  { id: 19, title: "Technical Program Manager", company: "Example Org", location: "Remote", seniority: "Senior", workMode: "Remote", targetRoleUrl: "https://careers.example.org/jobs/19" },
  { id: 20, title: "QA Automation Engineer", company: "Synthetic Co", location: "Hyderabad", seniority: "Mid", workMode: "Hybrid", targetRoleUrl: "https://careers.synthetic.example/jobs/20" },
  { id: 21, title: "Security Operations Analyst", company: "Example Org", location: "Remote", seniority: "Mid", workMode: "Remote", targetRoleUrl: "https://careers.example.org/jobs/21" },
  { id: 22, title: "Cloud Architect", company: "Synthetic Co", location: "Bengaluru", seniority: "Lead", workMode: "Hybrid", targetRoleUrl: "https://careers.synthetic.example/jobs/22" },
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
  // Whole-page checks (owner rule, Oct 30): the share block after "More" (no native
  // share sheet in headless Chromium, so the copy path and its goal status line show),
  // the walk-in's share block, the /jobs sign-in step, and a first visit with no stored
  // cookie choice (any global banner the app renders shows up here).
  ["wall-share-copied", "/wall?opening=4", { "/api/opportunities": [200, WALL] }, { action: "share" }],
  ["wall-first-visit", "/wall", { "/api/opportunities": [200, WALL] }, { fresh: true }],
  ["jobs-sign-in-step", "/jobs", { "/api/jobs": [200, JOBS] }, { action: "save" }],
  ["jobs-first-visit", "/jobs", { "/api/jobs": [200, JOBS] }, { fresh: true }],
  ["wall-opening-11", "/wall?opening=11", { "/api/opportunities": [200, WALL] }],
  ["jobs-job-22", "/jobs?job=22", { "/api/jobs": [200, JOBS] }],
  ["wall-select-end", "/wall", { "/api/opportunities": [200, WALL] }, { action: "select-near-end-wall" }],
  ["jobs-select-end", "/jobs", { "/api/jobs": [200, JOBS] }, { action: "select-near-end-jobs" }],
];

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const [width, height, dpr] of [[1280, 900, 1], [390, 844, 2]]) {
    for (const [name, route, fixtures, opts = {}] of scenarios) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, timezoneId: "Asia/Kolkata", locale: "en-IN" });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**", r => r.abort());
      await page.route("**/api/**", async r => {
        const path = new URL(r.request().url()).pathname;
        const [status, body] = fixtures[path] ?? (path === "/api/partners" ? [200, PARTNERS] : (path === "/api/companies" || path === "/api/companies/directory") ? [200, COMPANIES] : path.startsWith("/api/trpc/") ? [200, path.slice(10).split(",").map(() => ({ result: { data: { json: null } } }))] : [401, {}]);
        await r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
      if (!opts.fresh) await page.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "all"));
      if (opts.action === "share") await page.addInitScript(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => undefined }, configurable: true }); });
      await page.goto(base + route, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-goal-page]");
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      await page.evaluate(() => document.fonts.ready);
      if (opts.action === "share") { await page.getByRole("button", { name: "More sharing options" }).click(); await page.getByText("Opening link copied.").waitFor(); }
      if (opts.action === "save") { await page.getByRole("button", { name: "Save Senior Product Designer" }).click(); await page.getByRole("heading", { level: 1, name: "Sign in to save roles." }).waitFor(); }
      if (opts.action === "select-near-end-wall") { await page.locator("#opening-12 button").first().click(); }
      if (opts.action === "select-near-end-jobs") { await page.locator("#job-22 button").first().click(); }
      await page.waitForTimeout(300);
      const metrics = await page.evaluate(() => {
        const primary = document.querySelector("[data-g-primary]");
        const rect = primary ? primary.getBoundingClientRect() : null;
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth,
          scrollY: window.scrollY,
          actionRect: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), right: Math.round(rect.right) } : null,
          actionInViewport: rect ? (rect.top >= 0 && rect.bottom <= window.innerHeight) : false,
          h1: document.querySelector("h1")?.textContent,
          primaries: document.querySelectorAll("[data-g-primary]").length,
          goalShare: document.querySelectorAll("[data-goal-share]").length,
          nestedButtons: document.querySelectorAll("button button").length,
          kitHexClasses: [...document.querySelectorAll("[class]")].filter(el => /#[0-9a-f]{3,6}/i.test(String(el.getAttribute("class")))).length,
          outsideGoalScope: [...document.body.querySelectorAll("body > *:not(script)")].flatMap(el => [...el.children]).filter(el => !el.closest(".g-scope") && el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== "none").map(el => (el.getAttribute("data-skipwait-screen") || el.tagName) + ":" + (el.textContent || "").trim().slice(0, 60))
        };
      });
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
