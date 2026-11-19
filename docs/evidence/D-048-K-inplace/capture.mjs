import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, resolve } from "node:path";

// Local synthetic browser comparison only: no real sign-in, account or API.
const [beforeRoot, afterRoot, destination = "docs/evidence/D-048-K-inplace/verified"] = process.argv.slice(2);
assert.ok(beforeRoot && afterRoot, "provide baseline and candidate dist/public directories");
const { chromium } = createRequire(resolve("package.json"))("playwright");
const out = resolve(destination);
const person = { id: 79, name: "Synthetic Seeker", email: "seeker@synthetic.example", role: "user", openId: "synthetic", loginMethod: "fixture" };
const company = { slug: "synthetic", name: "Synthetic Company", initials: "SC", industry: "Technology", location: "Remote", functions: ["Engineering"], blurb: "Synthetic browser fixture", domains: ["synthetic.example"], openToReferrals: false };
const slots = { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null };
const request = { id: 79, title: "Synthetic Engineer", targetRoleUrl: "https://synthetic.example/jobs/79", companyDomain: "synthetic.example", companyName: "Synthetic Company", companyInitials: "SC", status: "pending", referrerId: null, queueStatus: "waiting_for_coverage", waitingForCoverage: true, createdAt: "2026-11-19T12:00:00.000Z", updatedAt: "2026-11-19T12:00:00.000Z", attachmentCount: 1, unreadMessageCount: 0 };
const cases = [
  { name: "requests-populated", path: "/requests", ready: "Synthetic Engineer" },
  { name: "requests-empty", path: "/requests", empty: true, ready: "No asks yet." },
  { name: "requests-error", path: "/requests", error: true, ready: "We couldn’t load your requests" },
  { name: "explore", path: "/explore", ready: "Synthetic Company" },
  { name: "company", path: "/explore/synthetic", ready: "Get referred at Synthetic Company." },
  { name: "ask", path: "/ask" },
  { name: "queue-gate", path: "/queue" },
  { name: "landed-error", path: "/landed", error: true, ready: "We could not load your referral requests" },
];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json" };
async function serve(root) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path.startsWith("/api/")) { res.writeHead(501); res.end("API must be intercepted"); return; }
    try {
      const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
      assert.ok(file.startsWith(`${resolve(root)}/`));
      const data = await readFile(file).catch(() => readFile(resolve(root, "index.html")));
      res.writeHead(200, { "Content-Type": mime[extname(path)] ?? "text/html" }); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
// A reproduction always takes fresh captures; never accept receipts from an
// earlier build merely because their scenario names happen to match.
const results = [];
try {
  for (const [phase, root] of [["before", beforeRoot], ["after", afterRoot]]) {
    const { server, base } = await serve(resolve(root));
    await mkdir(resolve(out, phase), { recursive: true });
    try {
      for (const width of [1280, 390]) for (const sample of cases) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, locale: "en-US", timezoneId: "UTC", colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
        try {
          const errors = [], unmatched = [], calls = [];
          const page = await context.newPage();
          page.on("pageerror", error => errors.push(error.message));
          await context.route("**/*", async route => {
            const req = route.request(), url = new URL(req.url()), method = req.method();
            if (url.origin !== base) return route.fulfill({ status: 204, body: "" });
            if (!url.pathname.startsWith("/api/")) return route.continue();
            calls.push(`${method} ${url.pathname}`);
            const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
            if (url.pathname.startsWith("/api/trpc/")) {
              const data = url.pathname.slice(10).split(",").map(name => ({ result: { data: { json: name === "auth.me" ? person : null } } }));
              return json(200, url.searchParams.has("batch") ? data : data[0]);
            }
            if (["/api/account/signup-language", "/api/csp-report"].includes(url.pathname)) return route.fulfill({ status: 204, body: "" });
            if (url.pathname === "/api/dev-auth/session") return json(200, { signedIn: true, account: person });
            if (url.pathname === "/api/credits/summary") return json(200, { summary: { totalAvailable: 3 } });
            if (url.pathname === "/api/company-referrals/access") return json(200, { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
            if (url.pathname === "/api/account/preferences") return json(200, { preferences: { timeZone: "UTC", dateFormat: "mdy", language: "en" } });
            if (url.pathname === "/api/notifications") return json(200, { notifications: [] });
            if (url.pathname === "/api/company-referrals/mine") return sample.error ? json(503, { error: "Synthetic requests unavailable" }) : json(200, { requests: sample.empty ? [] : [request], slots, hasEverAsked: true });
            if (url.pathname === "/api/profile/setup") return json(200, { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: null });
            if (url.pathname === "/api/ask-drafts") return json(200, { draft: null });
            if (url.pathname === "/api/work-items") return json(200, { items: [] });
            if (url.pathname === "/api/companies") return json(200, { companies: [company], openCount: 0 });
            if (url.pathname === "/api/companies/synthetic") return json(200, { company });
            if (url.pathname.endsWith("/opportunities")) return json(200, { opportunities: [] });
            unmatched.push(`${method} ${url.pathname}`);
            return json(501, { error: "Unmatched synthetic request" });
          });
          await page.goto(`${base}${sample.path}`, { waitUntil: "networkidle" });
          await page.locator("h1:visible").first().waitFor();
          if (sample.ready) await page.getByText(sample.ready, { exact: true }).first().waitFor();
          if (sample.name === "ask") await page.getByLabel("Job link", { exact: true }).waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.mouse.move(0, 0);
          const metrics = await page.evaluate(() => ({ text: document.body.innerText, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
          assert.equal(metrics.overflow, 0); assert.deepEqual(errors, []); assert.deepEqual(unmatched, []);
          const screenshot = `${phase}/${sample.name}-${width}.png`;
          const image = await page.screenshot({ path: resolve(out, screenshot), fullPage: true, animations: "disabled" });
          results.push({ phase, name: sample.name, route: sample.path, width, synthetic: true, ...metrics, calls, errors, unmatched, screenshot, sha256: createHash("sha256").update(image).digest("hex") });
          await writeFile(resolve(out, "capture.json"), JSON.stringify({ task: "D-048-K-inplace", runtime: "Separate baseline/candidate local production bundles; all APIs and external telemetry intercepted", productionRequests: 0, results }, null, 2) + "\n");
          console.log(`${phase}: ${sample.name} ${width}, no overflow/page errors/unmatched API`);
        } finally { await context.close(); }
      }
    } finally { await new Promise(done => server.close(done)); }
  }
  const pairs = results.filter(row => row.phase === "before").map(before => {
    const after = results.find(row => row.phase === "after" && row.name === before.name && row.width === before.width);
    assert.ok(after); assert.equal(after.text, before.text);
    // Independent React Query reads can launch in a different order. Keep every
    // method/path and its multiplicity, and report ordering separately.
    assert.deepEqual([...after.calls].sort(), [...before.calls].sort());
    return { name: before.name, width: before.width, textAndApiCountsEqual: true, apiSequenceEqual: JSON.stringify(before.calls) === JSON.stringify(after.calls), pngByteIdentical: before.sha256 === after.sha256 };
  });
  await writeFile(resolve(out, "parity.json"), JSON.stringify({ task: "D-048-K-inplace", pairs }, null, 2) + "\n");
  console.log(JSON.stringify({ pairs: pairs.length, pngByteIdentical: pairs.filter(pair => pair.pngByteIdentical).length }));
} finally { await browser.close(); }
