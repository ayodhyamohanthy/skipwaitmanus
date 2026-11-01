// Synthetic local evidence only (D-048-p3-support). Every /api call is answered
// in the browser by this script; nothing reaches a backend and no real account
// is used. Run a local client with the support id on, for example
//   VITE_GOAL_SURFACES=support node node_modules/vite/bin/vite.js --port 5199 --strictPort
// then: node design/goal-ui/captures/support/capture.mjs [390|1280]
// Output: <scenario>-<width>.png (whole page) and manifest-<width|all>.json beside this file.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const BASE = process.env.CAPTURE_BASE || "http://localhost:5199";
const out = new URL("./", import.meta.url);
const SEEKER = { id: 41, name: "Synthetic Seeker", email: "seeker@synthetic.example", role: "user", openId: "fixture", loginMethod: "fixture" };

// [name, route, { signedIn, report: status|"ok", block: status|"ok", offline, steps: [...] }]
const scenarios = [
  ["help", "/help", {}],
  ["help-no-match", "/help", { search: "zzz-no-such-topic" }],
  ["help-safety-filter", "/help", { chip: "Safety" }],
  ["safety", "/safety", {}],
  ["report-sign-in", "/report", { signedIn: false }],
  ["report-reason", "/report", {}],
  ["report-details", "/report?request=42", { steps: ["Continue"] }],
  ["report-details-offline", "/report", { steps: ["Continue"], offline: true }],
  // The server's daily cap answers 400 with this line (server/db.ts createSafetyReport).
  ["report-refused", "/report", { steps: ["Continue", "Submit report"], report: 400 }],
  ["report-unreached", "/report", { steps: ["Continue", "Submit report"], report: "abort" }],
  ["report-done-urgent", "/report", { steps: ["Continue", "I feel unsafe", "Submit report"], report: "ok" }],
  ["report-done-block-failed", "/report?request=42", { steps: ["Continue", "Also block this person", "Submit report"], report: "ok", block: 500 }],
  ["report-done-block-unreached", "/report?request=42", { steps: ["Continue", "Also block this person", "Submit report"], report: "ok", block: "abort" }],
];

const widths = [[390, 844, 2], [1280, 900, 1]].filter(([w]) => !process.argv[2] || w === Number(process.argv[2]));
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const [width, height, dpr] of widths) {
    for (const [name, route, opts] of scenarios.filter(s => !process.env.CAPTURE_ONLY || process.env.CAPTURE_ONLY.split(",").includes(s[0]))) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: width < 600, hasTouch: width < 600 });
      const page = await context.newPage();
      const errors = []; const unmatched = new Set();
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      const signedIn = opts.signedIn === false ? null : SEEKER;
      await page.route("https://**", r => r.abort());
      await page.route(url => new URL(url).pathname.startsWith("/api/"), async r => {
        const url = new URL(r.request().url()); const method = r.request().method();
        const json = (status, body) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (url.pathname.startsWith("/api/trpc/")) {
          const body = url.pathname.slice("/api/trpc/".length).split(",").map(p => ({ result: { data: { json: p === "auth.me" ? signedIn : null } } }));
          return json(200, url.searchParams.get("batch") ? body : body[0]);
        }
        if (url.pathname === "/api/dev-auth/session") return json(200, signedIn ? { signedIn: true, account: signedIn } : { signedIn: false });
        if (url.pathname === "/api/credits/summary") return json(200, { summary: { totalAvailable: 3 } });
        if (url.pathname === "/api/company-referrals/access") return json(200, { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
        if (method === "POST" && url.pathname === "/api/safety-reports") {
          if (opts.report === "abort") return r.abort("failed");
          return opts.report === "ok" ? json(200, { report: { id: 48, reference: "R-SYN-1048" } }) : json(opts.report || 500, { error: "You have filed several reports today. Contact support directly for anything urgent." });
        }
        if (method === "POST" && url.pathname === "/api/blocks" && opts.block === "abort") return r.abort("failed");
        if (method === "POST" && url.pathname === "/api/blocks") return opts.block === "ok" ? json(200, { blocked: true, created: true, id: 9 }) : json(opts.block || 500, { error: "synthetic" });
        unmatched.add(`${method} ${url.pathname}`);
        return json(signedIn ? 404 : 401, { error: "not mocked" });
      });
      await page.addInitScript(() => { localStorage.setItem("skipwait:cookie-consent", "all"); });
      await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-goal-page]", { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      if (opts.offline) await context.setOffline(true);
      if (opts.search) await page.getByRole("searchbox", { name: "Search help" }).fill(opts.search);
      if (opts.chip) await page.getByRole("button", { name: opts.chip, exact: true }).first().click();
      for (const step of opts.steps || []) {
        await page.getByRole("button", { name: step }).first().click();
        await page.waitForTimeout(150);
      }
      if (opts.report) await page.waitForSelector(opts.report === "ok" ? "text=Thanks. We're on it." : "[role=alert]", { timeout: 10000 });
      await page.waitForTimeout(300);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
        h1: [...document.querySelectorAll("h1")].map(h => h.textContent.trim()),
        primaries: document.querySelectorAll("[data-g-primary]").length,
      }));
      const file = `${name}-${width}.png`;
      await page.screenshot({ path: new URL(file, out).pathname, fullPage: true });
      const result = { file, route, persona: signedIn ? "synthetic seeker" : "signed out", fixture: opts, viewport: { width, height, dpr }, horizontalOverflowPx: Math.max(0, metrics.scrollWidth - metrics.innerWidth), h1: metrics.h1, primaries: metrics.primaries, unmatchedApi: [...unmatched], consoleErrors: errors };
      results.push(result); console.log(JSON.stringify(result));
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(new URL(`manifest-${process.argv[2] || "all"}.json`, out), JSON.stringify({
    source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    build: "VITE_GOAL_SURFACES=support (local vite dev server)",
    command: `node design/goal-ui/captures/support/capture.mjs ${process.argv[2] || ""}`.trim(),
    synthetic: true,
    results,
  }, null, 2) + "\n");
}
