import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = resolve(process.argv[3] ?? "client/src/pages/goal/support/retirement/evidence");
const PERSON = { id: 41, name: "Synthetic Seeker", email: "seeker@synthetic.example", role: "user", openId: "fixture", loginMethod: "fixture" };
const cases = [
  { name: "help", path: "/help", page: "help", title: "Get help." },
  { name: "safety", path: "/safety", page: "safety", title: "Stay safe on SkipWait." },
  { name: "report-sign-in", path: "/report", page: "report", title: "Report a problem.", signedIn: false },
  { name: "report-reason", path: "/report", page: "report", title: "Report a problem." },
  { name: "report-details", path: "/report?request=42", page: "report", title: "Report a problem.", steps: ["Continue"] },
  { name: "report-refused", path: "/report", page: "report", title: "Report a problem.", steps: ["Continue", "Submit report"], report: 400 },
];
const dimensions = [[390, 844, 2], [1280, 900, 1]];
const results = [];
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

try {
  for (const [width, height, dpr] of dimensions) {
    for (const item of cases) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: width < 600, hasTouch: width < 600 });
      const page = await context.newPage();
      const errors = [];
      const unmatched = new Set();
      const unexpectedResponses = [];
      const signedIn = item.signedIn === false ? null : PERSON;
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        const text = message.text();
        const expectedRefusal = item.report === 400 && text.includes("Failed to load resource") && text.includes("400 (Bad Request)");
        if (message.type() === "error" && !text.includes("VITE_WORKOS_CLIENT_ID is not set") && !expectedRefusal) errors.push(text);
      });
      page.on("response", response => {
        if (response.status() >= 400 && !(item.report === 400 && response.url().includes("/api/safety-reports") && response.status() === 400)) {
          unexpectedResponses.push(`${response.status()} ${response.url()}`);
        }
      });
      await page.route("https://**", route => route.abort());
      await page.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (url.pathname.startsWith("/api/trpc/")) {
          const body = url.pathname.slice("/api/trpc/".length).split(",").map(name => ({ result: { data: { json: name === "auth.me" ? signedIn : null } } }));
          return json(200, url.searchParams.has("batch") ? body : body[0]);
        }
        if (url.pathname === "/api/dev-auth/session") return json(200, signedIn ? { signedIn: true, account: signedIn } : { signedIn: false });
        if (url.pathname === "/api/credits/summary") return json(200, { summary: { totalAvailable: 3 } });
        if (url.pathname === "/api/company-referrals/access") return json(200, { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
        if (url.pathname === "/api/account/preferences") return json(200, { preferences: { timeZone: null, dateFormat: null, language: null } });
        if (url.pathname === "/api/notifications") return json(200, { notifications: [] });
        if (method === "POST" && url.pathname === "/api/account/signup-language") return route.fulfill({ status: 204 });
        if (method === "POST" && url.pathname === "/api/safety-reports") {
          return item.report === 400
            ? json(400, { error: "You have filed several reports today. Contact support directly for anything urgent." })
            : json(200, { report: { id: 48, reference: "R-SYN-1048" } });
        }
        if (method === "POST" && url.pathname === "/api/blocks") return json(200, { blocked: true, created: true, id: 9 });
        unmatched.add(`${method} ${url.pathname}`);
        return json(signedIn ? 404 : 401, { error: "not mocked" });
      });
      await page.addInitScript(() => { localStorage.setItem("skipwait:cookie-consent", "all"); });
      await page.goto(`${BASE}${item.path}`, { waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
      await page.waitForSelector(`[data-goal-page="${item.page}"]`);
      await page.getByRole("heading", { level: 1, name: item.title }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const step of item.steps ?? []) await page.getByRole("button", { name: step }).first().click();
      if (item.report === 400) await page.getByRole("alert").waitFor();
      const metrics = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        goalPages: document.querySelectorAll("[data-goal-page]").length,
        primaryActions: document.querySelectorAll("[data-g-primary]").length,
      }));
      const file = `${item.name}-${width}.png`;
      await page.screenshot({ path: resolve(OUT, file), fullPage: true });
      const result = {
        file,
        route: item.path,
        viewport: { width, height, deviceScaleFactor: dpr },
        signedIn: signedIn !== null,
        h1: item.title,
        goalPages: metrics.goalPages,
        primaryActions: metrics.primaryActions,
        horizontalOverflowPx: Math.max(0, metrics.scrollWidth - metrics.width),
        unmatchedApi: [...unmatched],
        consoleErrors: errors,
        unexpectedResponses,
      };
      results.push(result);
      console.log(JSON.stringify(result));
      await context.close();
    }
  }
} finally {
  await browser.close();
  const git = args => execFileSync("git", args, { encoding: "utf8" }).trim();
  await writeFile(resolve(OUT, "manifest.json"), JSON.stringify({
    source: git(["rev-parse", "HEAD"]),
    renderedRuntime: process.argv[4] ?? "working tree at HEAD",
    sourceTreeDirty: git(["status", "--porcelain", "--", "client/src/pages"]) !== "",
    base: BASE,
    synthetic: true,
    apiMockedInBrowser: true,
    results,
  }, null, 2) + "\n");
}

const failures = results.filter(result => result.goalPages !== 1 || result.primaryActions !== 1 || result.horizontalOverflowPx !== 0 || result.unmatchedApi.length || result.consoleErrors.length || result.unexpectedResponses.length);
if (failures.length) throw new Error(`${failures.length} capture(s) failed the UI contract`);
