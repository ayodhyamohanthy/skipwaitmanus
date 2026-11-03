// Synthetic local evidence for D-048-F-app-wrapper. Not production proof.
// Run the dev server with one more goal surface on, then this script:
//   JWT_SECRET=synthetic-local VITE_APP_ID=skipwait BILLING_ENV=test CHARGEBEE_SITE=dummy \
//   CHARGEBEE_API_KEY=dummy CHARGEBEE_WEBHOOK_SECRET=dummy VITE_GOAL_SURFACES=start \
//   PORT=3017 NODE_ENV=development npx tsx server/_core/index.ts
//   node design/goal-ui/captures/app-wrapper/capture.mjs [390|1280]
// Every API call is answered locally ({} / tRPC null), every https request is
// blocked, and no real account, payment or person is involved.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const out = new URL("./images/", import.meta.url);
await mkdir(out, { recursive: true });
const base = process.env.CAPTURE_BASE || "http://localhost:3017";
const widthArg = process.argv[2] ? Number(process.argv[2]) : null;

// route "/" is the released `home` surface; "/start" is `start`, on in this dev build only.
const routes = ["/", "/start"];
const states = ["page", "offline", "slow", "update", "route-error", "app-error", "toast"];

const SHELL = ['nav[aria-label="Primary"]', "[data-goal-bottom-bar]", 'header', '[role="dialog"][aria-label="Cookie choices"]'];

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const [width, height, dpr] of [[390, 844, 2], [1280, 900, 1]].filter(v => !widthArg || v[0] === widthArg)) {
    for (const route of routes) {
      for (const state of states) {
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
        const errors = [];
        page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
        page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
        await page.route("https://**", r => r.abort());
        await page.route("**/api/**", async r => {
          const p = new URL(r.request().url()).pathname;
          await r.fulfill({ status: 200, contentType: "application/json", body: p.startsWith("/api/trpc/") ? JSON.stringify(p.slice("/api/trpc/".length).split(",").map(() => ({ result: { data: { json: null } } }))) : "{}" });
        });
        if (state === "route-error" && route === "/start") await page.route("**/src/pages/Onboarding.tsx*", r => r.abort());
        await page.addInitScript(({ state, route }) => {
          if (state === "slow") Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ effectiveType: "2g", addEventListener() {}, removeEventListener() {} }) });
          // App-wide boundary: a wrapper state outside the router throws while rendering.
          if (state === "app-error") Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => { throw new Error("synthetic app-wide failure"); } });
          // Route boundary on "/": the landing's banner-art effect throws inside the route.
          if (state === "route-error" && route === "/") {
            const real = window.matchMedia.bind(window);
            window.matchMedia = q => { if (q === "(prefers-reduced-motion: reduce)") throw new Error("synthetic route failure"); return real(q); };
          }
        }, { state, route });
        await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForFunction(() => document.querySelector("#root")?.children.length, null, { timeout: 120000 });
        await page.waitForTimeout(2500);
        await page.evaluate(() => document.fonts.ready);
        let posted = null;
        if (state === "offline") await page.evaluate(() => { Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false }); window.dispatchEvent(new Event("offline")); });
        if (state === "update") posted = await page.evaluate(() => { let got = null; window.dispatchEvent(new CustomEvent("skipwait:sw-update", { detail: { postMessage: m => { got = m; } } })); return got; });
        if (state === "toast") {
          await page.evaluate(async () => {
            const url = performance.getEntriesByType("resource").map(e => e.name).find(n => /\/deps\/sonner\.js/.test(n));
            const mod = await import(url);
            mod.toast("Link copied.", { duration: 60000 });
          });
        }
        await page.waitForTimeout(600);
        const metrics = await page.evaluate(SHELL => {
          const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
          const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h && a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0;
          const target = document.querySelector("[data-goal-wrapper]") || document.querySelector("[data-sonner-toast]") || document.querySelector('[role="status"][aria-live="polite"]');
          const shell = SHELL.flatMap(sel => [...document.querySelectorAll(sel)].map(el => ({ sel, box: box(el) })));
          const t = target ? box(target) : null;
          const cs = target ? getComputedStyle(target) : null;
          return {
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth,
            wrapper: target ? { kind: target.getAttribute("data-goal-wrapper") || (target.hasAttribute("data-sonner-toast") ? "toast" : "legacy"), box: t, color: cs.color, background: cs.backgroundColor } : null,
            overlaps: t && target.getAttribute("data-goal-wrapper") !== "error" ? shell.filter(s => overlap(t, s.box)).map(s => s.sel) : [],
            statusCount: document.querySelectorAll('[role="status"][aria-live="polite"]').length,
            toasters: document.querySelectorAll("section[aria-label^='Notifications']").length,
            h1: document.querySelectorAll("h1").length,
            screen: document.querySelector("[data-skipwait-screen]")?.getAttribute("data-skipwait-screen") ?? null,
          };
        }, SHELL);
        const file = `${route === "/" ? "home" : "start"}-${state}-${width}.png`;
        await page.screenshot({ path: new URL(file, out).pathname, fullPage: true });
        results.push({ file, route, state, viewport: { width, height, dpr }, posted, metrics, errors: [...new Set(errors)].slice(0, 6) });
        console.log(JSON.stringify(results.at(-1)));
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(new URL(`manifest-${widthArg || "all"}.json`, import.meta.url), JSON.stringify({
    task: "D-048-F-app-wrapper",
    source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    command: `node design/goal-ui/captures/app-wrapper/capture.mjs ${widthArg || ""}`.trim(),
    server: "VITE_GOAL_SURFACES=start, NODE_ENV=development, no database, API mocked",
    synthetic: true,
    results,
  }, null, 2) + "\n");
}
