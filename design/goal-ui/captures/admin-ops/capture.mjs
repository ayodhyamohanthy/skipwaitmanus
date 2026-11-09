// Synthetic local evidence only (D-048-p3-admin-ops). Every /api call is answered
// in the browser by this script: no backend, no real account, no live payment and
// no production admin data. Run a local client with this surface id on, then the
// driver:
//   VITE_GOAL_SURFACES=admin-ops node node_modules/vite/bin/vite.js --port 5199 --strictPort
//   node design/goal-ui/captures/admin-ops/capture.mjs [390|1280]
// Output: goal-admin-ops-<scenario>-<width>.png (whole page) plus
// manifest-<width|all>.json beside this file, with the rendered h1, the count of
// black commits, horizontal overflow, unmatched API calls and console errors.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const BASE = process.env.CAPTURE_BASE || "http://localhost:5199";
const out = new URL("./", import.meta.url);
const ADMIN = { id: 1, name: "Ops Admin", email: "ops@example.com", role: "admin", openId: "fixture", loginMethod: "fixture" };

const ok = (path, body, method = "GET") => ({ method, path, match: "prefix", status: 200, body });
const answer = (path, status, body = {}, method = "GET") => ({ method, path, match: "prefix", status, body });

// ---------- synthetic payloads (the shapes server/adminRoutes.ts answers) ----------

const EVENTS = [
  { id: 91, action: "referral_request.create", outcome: "success", resourceType: "referral_request", resourceId: "req-41", companyDomain: "acme.example", metadata: '{"credits":1}', createdAt: "2026-10-08T04:30:00.000Z", actorName: "Synthetic Seeker", actorEmail: "seeker@synthetic.example" },
  { id: 92, action: "referrer.accept", outcome: "success", resourceType: "referral_request", resourceId: "req-41", companyDomain: "acme.example", metadata: null, createdAt: "2026-10-08T05:10:00.000Z", actorName: "Synthetic Referrer", actorEmail: "employee@acme.example" },
  { id: 93, action: "otp.verify", outcome: "failure", resourceType: "user", resourceId: null, companyDomain: null, metadata: '{"reason":"expired"}', createdAt: "2026-10-08T05:40:00.000Z", actorName: null, actorEmail: null },
  { id: 94, action: "document.download", outcome: "denied", resourceType: "document", resourceId: "doc-9", companyDomain: "globex.example", metadata: null, createdAt: "2026-10-08T06:05:00.000Z", actorName: "Synthetic Referrer", actorEmail: "employee@globex.example" },
];

const WEEKS = [
  { weekStart: "2026-09-14", asks: 18, accepted: 5, passed: 4, expired: 3, declined: 0, withdrawn: 1, waiting: 5, uncovered: 4, referredWithin7Days: 2 },
  { weekStart: "2026-09-21", asks: 24, accepted: 8, passed: 5, expired: 2, declined: 0, withdrawn: 2, waiting: 7, uncovered: 6, referredWithin7Days: 4 },
  { weekStart: "2026-09-28", asks: 31, accepted: 11, passed: 7, expired: 4, declined: 0, withdrawn: 1, waiting: 8, uncovered: 7, referredWithin7Days: 6 },
  { weekStart: "2026-10-05", asks: 27, accepted: 9, passed: 6, expired: 1, declined: 0, withdrawn: 0, waiting: 12, uncovered: 9, referredWithin7Days: 7 },
];

const BASELINE = {
  windowDays: 28,
  generatedAt: "2026-10-08T04:55:00.000Z",
  weeks: WEEKS,
  expiries: { total: 10, last7Days: 3 },
  decisionLatency: { sampleSize: 26, medianHours: 18.5, p90Hours: 61.2 },
  coverage: [
    { companyDomain: "acme.example", verifiedReferrers: 4, availableReferrers: 3, pausedOrFull: 1, waitingAsks: 6 },
    { companyDomain: "globex.example", verifiedReferrers: 2, availableReferrers: 1, pausedOrFull: 1, waitingAsks: 9 },
    { companyDomain: "initech.example", verifiedReferrers: 1, availableReferrers: 0, pausedOrFull: 1, waitingAsks: 4 },
  ],
  demand: [
    { companyDomain: "globex.example", waitingAsks: 9, oldestWaitingDays: 12, verifiedReferrers: 2 },
    { companyDomain: "acme.example", waitingAsks: 6, oldestWaitingDays: 5, verifiedReferrers: 4 },
    { companyDomain: "initech.example", waitingAsks: 4, oldestWaitingDays: 21, verifiedReferrers: 1 },
  ],
  externalReferrers: { activeLast7Days: 7, activeInWindow: 11, excludedOperatorDomains: ["skipwait.me"] },
  subscribers: { paid: 3, trialing: 0, byPlan: [{ plan: "mid_to_senior", count: 2 }, { plan: "senior_to_executive", count: 1 }] },
  referredWithin7DaysPct: 34,
  dataQuality: [{ id: "claim_without_pickup", label: "Claims with no pickup event", count: 2, hint: "Referred rows whose claim event is missing; check the D-038 reconcile." }],
};

const HEALTH = {
  health: {
    funnel: { requestsCreated: 100, requestsClaimed: 33, decisionsRecorded: 26, waitingForCoverage: 32 },
    coverageGaps: [
      { companyDomain: "globex.example", waitingRequests: 9, verifiedCoverage: 2 },
      { companyDomain: "initech.example", waitingRequests: 4, verifiedCoverage: 1 },
    ],
    instrumentation: { uploadedDocuments: 41, recordedFailures: 12 },
  },
  baseline: BASELINE,
};

const REVENUE = {
  revenue: {
    byProvider: [
      { provider: "chargebee", currency: "INR", totalAmount: 229000, count: 10 },
      { provider: "stripe", currency: "USD", totalAmount: 4490, count: 1 },
    ],
    totalsByCurrency: [
      { currency: "INR", totalAmount: 229000, count: 10 },
      { currency: "USD", totalAmount: 4490, count: 1 },
    ],
    refundedTotalByCurrency: [{ currency: "INR", totalAmount: 22900, count: 1 }],
    recordedAt: "2026-10-08T04:55:00.000Z",
  },
};

const SCHEMA_PENDING = {
  reconciled: false,
  firstError: "Unknown column 'jobFunction' in 'field list'",
  results: [
    { statement: "ALTER TABLE jobs ADD COLUMN jobFunction VARCHAR(64) NULL", ok: false, error: "Unknown column 'jobFunction' in 'field list'" },
    { statement: "ALTER TABLE jobs ADD COLUMN jobFunctionSource VARCHAR(24) NULL", ok: false, error: "Unknown column 'jobFunctionSource' in 'field list'" },
    { statement: "CREATE TABLE IF NOT EXISTS partnerModules (id INT AUTO_INCREMENT PRIMARY KEY)", ok: true },
  ],
};
const SCHEMA_CLEAN = { reconciled: true, firstError: null, results: [{ statement: "ALTER TABLE jobs ADD COLUMN jobFunction VARCHAR(64) NULL", ok: true }, { statement: "CREATE TABLE IF NOT EXISTS partnerModules (id INT AUTO_INCREMENT PRIMARY KEY)", ok: true }] };

const SMOKE_SNAPSHOT = { role: "seeker", enteredAt: "2026-10-08T05:00:00.000Z", asks: [{ id: "syn-1", state: "waiting", companyDomain: "synthetic.example" }], credits: 3, note: "Synthetic rows only. No live user, message, payment or file is reachable from this fixture." };

const MODULES = [
  { id: 7, partnerName: "PrepLab", category: "interview_prep", headline: "Mock interviews with senior engineers", description: "A 30-minute practice round before you apply.", targetRoles: "frontend, react", ctaLabel: "Learn more", ctaUrl: "https://preplab.example/tool", isActive: true, impressions: 128, clicks: 9 },
  { id: 8, partnerName: "VetRight", category: "resume_vetting", headline: "Resume check for referral-worthy detail", description: null, targetRoles: null, ctaLabel: "Try it", ctaUrl: "https://vetright.example/check", isActive: false, impressions: 0, clicks: 0 },
];
const SPONSORSHIPS = [
  { id: 4, companyDomain: "acme.example", roleTitle: "Senior Frontend Engineer", sponsoredTier: "week", sponsoredUntil: "2026-11-30T00:00:00.000Z" },
  { id: 5, companyDomain: "globex.example", roleTitle: "Data Analyst", sponsoredTier: null, sponsoredUntil: null },
];

// ---------- scenarios: [name, route, { signedIn, api, steps, screen }] ----------

const scenarios = [
  ["activity-default", "/admin/activity", { screen: "admin-activity", api: [ok("/api/admin/activity", { events: EVENTS })] }],
  ["activity-empty", "/admin/activity", { screen: "admin-activity", api: [ok("/api/admin/activity", { events: [] })] }],
  ["activity-error", "/admin/activity", { screen: "admin-activity", api: [answer("/api/admin/activity", 500)] }],
  ["activity-signed-out", "/admin/activity", { screen: "admin-activity-sign-in", signedIn: false, api: [] }],
  ["flow-health-default", "/admin/flow-health", { screen: "admin-flow-health", api: [ok("/api/admin/flow-health", HEALTH), ok("/api/admin/revenue", REVENUE)] }],
  ["flow-health-no-baseline", "/admin/flow-health", { screen: "admin-flow-health", api: [ok("/api/admin/flow-health", { ...HEALTH, baseline: null }), ok("/api/admin/revenue", REVENUE)] }],
  ["flow-health-error", "/admin/flow-health", { screen: "admin-flow-health", api: [answer("/api/admin/flow-health", 500), ok("/api/admin/revenue", REVENUE)] }],
  ["schema-pending", "/admin/schema", { screen: "admin-schema", api: [ok("/api/admin/schema/reconcile", SCHEMA_PENDING)] }],
  ["schema-reconciled", "/admin/schema", { screen: "admin-schema", api: [ok("/api/admin/schema/reconcile", SCHEMA_CLEAN)] }],
  ["smoke-roles", "/admin/smoke", { screen: "admin-smoke", api: [ok("/api/admin/smoke/status", { enabled: true, active: false, csrf: "synthetic-csrf" })] }],
  ["smoke-active", "/admin/smoke", { screen: "admin-smoke", api: [ok("/api/admin/smoke/status", { enabled: true, active: true, role: "seeker", csrf: "synthetic-csrf" }), ok("/api/admin/smoke/snapshot", SMOKE_SNAPSHOT)] }],
  ["smoke-disabled", "/admin/smoke", { screen: null, api: [answer("/api/admin/smoke/status", 404)] }],
  ["partners-modules", "/admin/partners", { screen: "admin-partners", api: [ok("/api/admin/partners", { modules: MODULES }), ok("/api/admin/sponsorships", { sponsorships: SPONSORSHIPS })] }],
  ["partners-sponsored", "/admin/partners", { screen: "admin-partners", steps: [/^Sponsored roles/], api: [ok("/api/admin/partners", { modules: MODULES }), ok("/api/admin/sponsorships", { sponsorships: SPONSORSHIPS })] }],
  ["partners-end-choice", "/admin/partners", { screen: "admin-partners", steps: [/^Sponsored roles/, { check: "Senior Frontend Engineer" }], api: [ok("/api/admin/partners", { modules: MODULES }), ok("/api/admin/sponsorships", { sponsorships: SPONSORSHIPS })] }],
  ["partners-denied", "/admin/partners", { screen: "admin-partners-forbidden", api: [answer("/api/admin/partners", 403, { error: "Administrator access is required." }), ok("/api/admin/sponsorships", { sponsorships: SPONSORSHIPS })] }],
  ["partners-empty", "/admin/partners", { screen: "admin-partners", api: [ok("/api/admin/partners", { modules: [] }), ok("/api/admin/sponsorships", { sponsorships: [] })] }],
  ["partners-signed-out", "/admin/partners", { screen: "admin-partners-sign-in", signedIn: false, api: [] }],
];

const widths = [[390, 844, 2], [1280, 900, 1]].filter(([w]) => !process.argv[2] || w === Number(process.argv[2]));
await mkdir(new URL("./", import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const [width, height, dpr] of widths) {
    for (const [name, route, opts] of scenarios.filter(s => !process.env.CAPTURE_ONLY || process.env.CAPTURE_ONLY.split(",").includes(s[0]))) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: width < 600, hasTouch: width < 600, reducedMotion: "reduce", colorScheme: "light", locale: "en-US", timezoneId: "Asia/Kolkata" });
      const account = opts.signedIn === false ? null : ADMIN;
      await context.addInitScript(() => {
        const fixed = new Date("2026-10-08T10:00:00+05:30").getTime();
        const RealDate = Date;
        class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
        globalThis.Date = FixedDate;
        localStorage.setItem("skipwait:cookie-consent", "all");
      });
      const page = await context.newPage();
      const errors = [];
      const unmatched = new Set();
      page.on("pageerror", e => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
      await page.route("https://**", r => r.abort());
      await page.route(url => new URL(url).pathname.startsWith("/api/"), async r => {
        const url = new URL(r.request().url());
        const method = r.request().method();
        const json = (status, body) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (url.pathname.startsWith("/api/trpc/")) {
          const procedures = url.pathname.slice("/api/trpc/".length).split(",");
          const body = procedures.map(p => ({ result: { data: { json: p === "auth.me" ? account : null } } }));
          return json(200, url.searchParams.get("batch") ? body : body[0]);
        }
        if (url.pathname === "/api/dev-auth/session") return json(200, account ? { signedIn: true, account } : { signedIn: false });
        if (url.pathname === "/api/account/preferences") return json(200, { preferences: { timeZone: null, dateFormat: null } });
        const hit = (opts.api || []).find(item => item.method.toUpperCase() === method && (item.match === "prefix" ? url.pathname.startsWith(item.path) : url.pathname === item.path));
        if (hit) return json(hit.status || 200, hit.body ?? {});
        unmatched.add(`${method} ${url.pathname}`);
        return json(account ? 404 : 401, { error: "not mocked" });
      });
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      if (opts.screen) await page.waitForSelector(`[data-skipwait-screen="${opts.screen}"]`, { timeout: 60000 });
      else await page.waitForSelector("h1", { timeout: 60000 });
      for (const step of opts.steps || []) {
        if (typeof step === "string" || step instanceof RegExp) await page.getByRole("button", { name: step }).first().click();
        else await page.getByText(step.check, { exact: false }).first().click();
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(300);
      for (let pass = 0; pass < 3; pass += 1) {
        const full = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
        if (full <= height) break;
        await page.setViewportSize({ width, height: full });
        await page.waitForTimeout(250);
      }
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        h1: [...document.querySelectorAll("h1")].map(node => node.textContent.trim()),
        primaries: document.querySelectorAll("[data-g-primary]").length,
        nextSteps: document.querySelectorAll("[aria-labelledby='goal-next-step-heading']").length,
        // Nested interactive nodes are invalid HTML that jsdom renders happily;
        // only a real browser reports them, and they make the click unreliable.
        nestedButtons: document.querySelectorAll("button button, a button, button a").length,
      }));
      const file = `goal-admin-ops-${name}-${width}.png`;
      await page.screenshot({ path: new URL(file, out).pathname, fullPage: true, animations: "disabled" });
      const result = { file, route, screen: opts.screen ?? "not-found", persona: account ? "synthetic admin" : "signed out", fixture: { api: (opts.api || []).map(item => `${item.method} ${item.path} -> ${item.status}`), steps: (opts.steps || []).map(step => (typeof step === "string" || step instanceof RegExp ? String(step) : JSON.stringify(step))) }, viewport: { width, height, dpr }, horizontalOverflowPx: Math.max(0, metrics.scrollWidth - metrics.innerWidth), h1: metrics.h1, nextStepBlocks: metrics.nextSteps, primaryCommits: metrics.primaries, nestedButtons: metrics.nestedButtons, unmatchedApi: [...unmatched], consoleErrors: errors.slice(0, 8) };
      results.push(result);
      console.log(JSON.stringify(result));
      await context.close();
    }
  }
} finally {
  await browser.close();
  const git = args => execFileSync("git", args, { cwd: new URL("../../../../", import.meta.url).pathname, encoding: "utf8" }).trim();
  await writeFile(new URL(`manifest-${process.argv[2] || "all"}.json`, out), JSON.stringify({
    source: git(["rev-parse", "HEAD"]),
    sourceTreeDirty: git(["status", "--porcelain", "--", "client", "shared"]) !== "",
    build: "VITE_GOAL_SURFACES=admin-ops (local vite dev server, every /api call mocked in the browser)",
    command: `node design/goal-ui/captures/admin-ops/capture.mjs ${process.argv[2] || ""}`.trim(),
    synthetic: true,
    clock: "2026-10-08T10:00:00+05:30 fixed",
    results,
  }, null, 2) + "\n");
}
