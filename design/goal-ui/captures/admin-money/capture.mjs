// Synthetic local evidence only (D-048-p3-admin-money, PR #986 finding 2).
// Every /api call is answered in the browser by this script: no backend, no real
// account, no live payment and no production admin data. Run a local client with
// this surface id on, then the driver:
//   VITE_GOAL_SURFACES=admin-money node node_modules/vite/bin/vite.js --port 5199 --strictPort
//   node design/goal-ui/captures/admin-money/capture.mjs [390|1280]
// Output: <state>-<width>.png (whole page) for every fixture beside this file,
// plus manifest-<width|all>.json with the source commit, the route, the rendered
// goal line, the next-step and black-commit counts, horizontal overflow,
// unmatched API calls and console errors.
import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const BASE = process.env.CAPTURE_BASE || "http://localhost:5199";
const out = new URL("./", import.meta.url);
const fixturesDir = new URL("./fixtures/", import.meta.url);

const ROUTES = {
  payments: { route: "/admin/payments", screen: "admin-payments", signedOutScreen: "admin-payments-sign-in" },
  catalog: { route: "/admin/catalog-sync", screen: "admin-catalog-sync", signedOutScreen: "admin-catalog-sync-sign-in" },
  recovery: { route: "/admin/token-recovery", screen: "admin-token-recovery", signedOutScreen: "admin-token-recovery-sign-in" },
  // Packet §10 assigns /admin/money-check's styling to this row, but the path is
  // not in owns: it still renders the kit page and has no goal screen id.
  "money-check": { route: "/admin/money-check", screen: null, signedOutScreen: null },
};

const fixtureFiles = (await readdir(fixturesDir)).filter(name => name.endsWith(".json")).sort();
const states = [];
for (const name of fixtureFiles) {
  states.push({
    name,
    state: name.replace(/^admin-money__/, "").replace(/\.json$/, ""),
    fixture: JSON.parse(await readFile(new URL(name, fixturesDir), "utf8")),
  });
}

const widths = [[390, 844, 2], [1280, 900, 1]].filter(([w]) => !process.argv[2] || w === Number(process.argv[2]));
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const [width, height, dpr] of widths) {
    for (const { state, fixture } of states) {
      const spec = ROUTES[state.startsWith("money-check") ? "money-check" : state.split("-")[0]];
      if (!spec) throw new Error(`fixture ${state} has no route mapping`);
      const signedIn = fixture.signedIn
        ? { openId: "fixture", loginMethod: "fixture", role: "user", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastSignedIn: "2026-10-08T00:00:00.000Z", ...fixture.signedIn }
        : null;
      const screen = signedIn ? spec.screen : spec.signedOutScreen;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: width < 600, hasTouch: width < 600, reducedMotion: "reduce", colorScheme: "light", locale: "en-US", timezoneId: "Asia/Kolkata" });
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
          const body = procedures.map(p => ({ result: { data: { json: p === "auth.me" ? signedIn : null } } }));
          return json(200, url.searchParams.get("batch") ? body : body[0]);
        }
        if (url.pathname === "/api/dev-auth/session") return json(200, signedIn ? { signedIn: true, account: signedIn } : { signedIn: false });
        const hit = (fixture.routes || []).find(item => (item.method || "GET").toUpperCase() === method && (item.match === "prefix" ? url.pathname.startsWith(item.path) : url.pathname === item.path));
        if (hit) {
          if (hit.abort) return r.abort();
          if (hit.delayMs) await new Promise(resolve => setTimeout(resolve, hit.delayMs));
          return json(hit.status || 200, hit.body ?? {});
        }
        unmatched.add(`${method} ${url.pathname}`);
        return json(signedIn ? 404 : 401, { error: "not mocked" });
      });
      await page.goto(BASE + spec.route, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      if (screen) await page.waitForSelector(`[data-skipwait-screen="${screen}"]`, { timeout: 60000 });
      else await page.waitForSelector("h1", { timeout: 60000 });
      for (const action of fixture.actions || []) {
        if (action.click) await page.locator(action.click).first().click();
        else if (action.fill) await page.locator(action.fill[0]).first().fill(action.fill[1]);
        else if (action.check) await page.locator(action.check).first().check();
        else if (action.wait) await page.waitForTimeout(action.wait);
        else if (action.waitFor) await page.locator(action.waitFor).first().waitFor({ timeout: 8000 });
        else if (action.scroll) await page.locator(action.scroll).first().scrollIntoViewIfNeeded();
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
        nestedButtons: document.querySelectorAll("button button, a button, button a").length,
      }));
      const file = `${state}-${width}.png`;
      await page.screenshot({ path: new URL(file, out).pathname, fullPage: true, animations: "disabled" });
      const result = {
        file, route: spec.route, screen: screen ?? "kit-page (outside owns)",
        persona: signedIn ? "synthetic admin" : "signed out",
        fixture: { api: (fixture.routes || []).map(item => `${item.method || "GET"} ${item.path} -> ${item.status || 200}`), actions: (fixture.actions || []).map(action => JSON.stringify(action)) },
        viewport: { width, height, dpr },
        horizontalOverflowPx: Math.max(0, metrics.scrollWidth - metrics.innerWidth),
        h1: metrics.h1,
        nextStepBlocks: metrics.nextSteps,
        primaryCommits: metrics.primaries,
        nestedButtons: metrics.nestedButtons,
        unmatchedApi: [...unmatched],
        consoleErrors: errors.slice(0, 8),
      };
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
    build: "VITE_GOAL_SURFACES=admin-money (local vite dev server, every /api call mocked in the browser)",
    command: `node design/goal-ui/captures/admin-money/capture.mjs ${process.argv[2] || ""}`.trim(),
    synthetic: true,
    clock: "2026-10-08T10:00:00+05:30 fixed",
    results,
  }, null, 2) + "\n");
}
