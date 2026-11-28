// Captures /jobs from a built dist/public with synthetic API answers only (FIX-jobs-catalog-search).
// usage: node capture-jobs.mjs <dist/public> <out dir> <port>
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const require = createRequire(path.join(process.cwd(), "package.json")); const { chromium } = require("playwright");
const [rootArg, out, port = "4176"] = process.argv.slice(2); const root = path.resolve(rootArg); fs.mkdirSync(out, { recursive: true });
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((req, res) => { const u = new URL(req.url, "http://x"); let f = path.join(root, decodeURIComponent(u.pathname)); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html"); res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); }).listen(Number(port));
const hit = (id, title, companyName, slug, locations, presence) => ({ id, companySlug: slug, companyName, title, locations, applyUrl: `https://careers.${slug}.example/jobs/${id}`, publishedAt: "2026-11-19T00:00:00.000Z", level: 5, referrerPresence: presence });
const CATALOG = [hit(901, "Platform Engineer", "Synthetic Co", "synthetic", ["Remote"], "none"), hit(902, "Data Engineer", "Example Labs", "example-labs", ["Bengaluru"], "present"), hit(903, "Senior Backend Engineer, Payments", "Fixture Systems", "fixture", ["London", "Remote"], "none")];
const answer = q => ({ kind: "job-title", query: q, companies: [], discovered: [], discoveryState: "ok", jobLink: null, jobs: /engineer/i.test(q) ? CATALOG : [], catalogState: "ok" });
const results = [];
async function shot(viewport, url, name, { searchFails = false } = {}) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: 1 })).newPage();
  const errors = []; const calls = []; page.on("pageerror", e => errors.push(String(e)));
  await page.route("**/*", async route => {
    const u = new URL(route.request().url());
    if (u.origin !== `http://127.0.0.1:${port}`) return route.fulfill({ status: 204, body: "" });
    if (!u.pathname.startsWith("/api/")) return route.continue();
    calls.push(u.pathname + u.search);
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname.startsWith("/api/trpc")) return json(u.pathname.slice(10).split(",").map(() => ({ result: { data: { json: null } } })));
    if (u.pathname === "/api/jobs") return json({ jobs: [] });
    if (u.pathname === "/api/search") return searchFails ? json({ error: "We could not search right now" }, 500) : json(answer(u.searchParams.get("q") ?? ""));
    return json({});
  });
  await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: "networkidle" }); await page.waitForTimeout(500);
  const file = path.join(out, `${name}-${viewport.width}.png`); await page.screenshot({ path: file, fullPage: false });
  const ld = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join(" "));
  results.push({ name, width: viewport.width, url, errors, calls: calls.filter(c => c.startsWith("/api/jobs") || c.startsWith("/api/search")), jsonLdHasCatalogRow: /Platform Engineer|Data Engineer|Backend Engineer, Payments/.test(ld), overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), text: (await page.innerText("main").catch(() => "")).replace(/\s+/g, " ").slice(0, 160) });
  await browser.close();
}
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await shot(viewport, "/jobs", "no-search");
    await shot(viewport, "/jobs?q=engineer", "careers-results");
    await shot(viewport, "/jobs?q=engineer&location=bengaluru", "careers-location");
    await shot(viewport, "/jobs?q=astronaut", "no-match");
    await shot(viewport, "/jobs?q=engineer", "search-failed", { searchFails: true });
  }
} finally { server.close(); }
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2) + "\n");
for (const r of results) console.log(r.name, r.width, "errors", r.errors.length, "overflow", r.overflow, "ldCatalog", r.jsonLdHasCatalogRow, "|", r.calls.join(" "), "|", r.text.slice(0, 110));
