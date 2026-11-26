import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const [phase, base = "http://127.0.0.1:5192", destination = "docs/evidence/D-048-K-system"] = process.argv.slice(2);
assert.ok(["before", "after"].includes(phase));
const out = resolve(destination, phase);
const { chromium } = createRequire(resolve("package.json"))("playwright");
const templates = ["Work-email code", "Password reset", "Welcome", "Request claimed", "Referral accepted", "Referral passed", "New message", "Waiting for coverage", "Slot opened", "Review ready", "Re-verify reminder", "Report outcome", "Payment receipt / failed"];
const scenarios = [
  { name: "android", path: "/app-states" },
  ...["Install (iPhone)", "Push permission", "Offline", "Slow connection", "Not found", "Something went wrong", "Payment failed", "Loading"].map(chip => ({ name: `gallery-${chip.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`, path: "/app-states", chip })),
  { name: "android-dismiss", path: "/app-states", action: "Not now" },
  { name: "android-reopen", path: "/app-states", action: "Not now", reopen: "Install (Android)" },
  { name: "iphone-dismiss", path: "/app-states", chip: "Install (iPhone)", action: "Got it" },
  { name: "iphone-reopen", path: "/app-states", chip: "Install (iPhone)", action: "Got it", reopen: "Install (iPhone)" },
  { name: "install-unavailable", path: "/app-states", action: "Install app" },
  ...["accepted", "dismissed", "error"].map(install => ({ name: `install-${install}`, path: "/app-states", install, action: "Install app" })),
  ...["granted", "denied", "default", "error", "absent"].map(permission => ({ name: `push-${permission}`, path: "/app-states", permission, chip: "Push permission", action: "Allow" })),
  { name: "push-later", path: "/app-states", chip: "Push permission", action: "Maybe later" },
  { name: "offline", path: "/offline" },
  { name: "offline-draft", path: "/offline", draft: true },
  { name: "not-found", path: "/not-a-real-system-route" },
  ...templates.map(template => ({ name: `email-${template.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`, path: "/emails", template })),
];
const browser = await chromium.launch(), results = [];
await mkdir(out, { recursive: true });
try {
  for (const width of [1280, 390]) for (const sample of scenarios) {
    const height = width === 390 ? 844 : 900;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: width === 390, hasTouch: width === 390, locale: "en-US", timezoneId: "UTC", colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
    try {
      const page = await context.newPage(), pageErrors = [], unmatched = [], calls = [];
      page.on("pageerror", e => pageErrors.push(e.message));
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (url.origin !== new URL(base).origin) return route.fulfill({ status: 204, body: "" });
        if (!url.pathname.startsWith("/api/")) return route.continue();
        calls.push({ method, path: url.pathname, body: request.postData() });
        const json = body => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        if (url.pathname.startsWith("/api/trpc/")) {
          const body = url.pathname.slice("/api/trpc/".length).split(",").map(() => ({ result: { data: { json: null } } }));
          return json(url.searchParams.has("batch") ? body : body[0]);
        }
        if (url.pathname === "/api/dev-auth/session") return json({ signedIn: false });
        if (url.pathname === "/api/account/preferences") return json({ preferences: { timeZone: "UTC", dateFormat: "mdy", language: "en" } });
        if (url.pathname === "/api/credits/summary") return json({ summary: { totalAvailable: 0 } });
        if (url.pathname === "/api/company-referrals/access") return json({ verifiedCompanyAccess: false });
        if (url.pathname === "/api/notifications") return json({ notifications: [] });
        if (url.pathname === "/api/account/signup-language" || url.pathname === "/api/csp-report") return route.fulfill({ status: 204, body: "" });
        unmatched.push(`${method} ${url.pathname}`);
        return route.fulfill({ status: 501, contentType: "application/json", body: "{}" });
      });
      await page.addInitScript(sample => {
        localStorage.setItem("skipwait:cookie-consent", "all");
        if (sample.draft) localStorage.setItem("skipwait-pwa-referral-draft", JSON.stringify({ name: "Synthetic candidate", targetUrl: `https://careers.synthetic.example/jobs/${"long-".repeat(22)}123`, updatedAt: 1793310000000 }));
        window.syntheticPermissionCalls = 0; window.syntheticInstallCalls = 0;
        Object.defineProperty(window, "Notification", { configurable: true, value: sample.permission === "absent" ? undefined : { requestPermission: async () => { window.syntheticPermissionCalls++; if (sample.permission === "error") throw Error("Synthetic permission refusal"); return sample.permission ?? "default"; } } });
      }, sample);
      await page.goto(`${base}${sample.path}`, { waitUntil: "networkidle" });
      const root = page.locator("[data-goal-page]"); await root.waitFor(); await page.getByRole("heading", { level: 1 }).waitFor();
      if (sample.chip) await page.getByRole("button", { name: sample.chip, exact: true }).click();
      if (sample.install) await page.evaluate(outcome => {
        window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => { window.syntheticInstallCalls++; if (outcome === "error") throw Error("Synthetic install refusal"); }, userChoice: Promise.resolve({ outcome }) }));
      }, sample.install);
      if (sample.template) { await page.getByRole("button", { name: sample.template, exact: true }).click(); await page.getByRole("article", { name: sample.template, exact: true }).waitFor(); }
      if (sample.action) {
        await page.getByRole("button", { name: sample.action, exact: true }).click();
        if (sample.install || sample.permission || sample.name === "install-unavailable" || sample.name === "push-later" || sample.name.endsWith("dismiss")) await root.getByRole("status").waitFor();
      }
      if (sample.reopen) await page.getByRole("button", { name: sample.reopen, exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({ roots: document.querySelectorAll("[data-goal-page]").length, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), permissionCalls: window.syntheticPermissionCalls, installCalls: window.syntheticInstallCalls }));
      assert.equal(metrics.roots, 1); assert.equal(metrics.overflow, 0); assert.deepEqual(pageErrors, []); assert.deepEqual(unmatched, []);
      assert.equal(metrics.permissionCalls, sample.permission && sample.permission !== "absent" ? 1 : 0);
      assert.equal(metrics.installCalls, sample.install ? 1 : 0);
      assert.ok(calls.every(call => call.method === "GET" || ["/api/csp-report", "/api/account/signup-language"].includes(call.path)), "unexpected business write");
      const screenshot = `${sample.name}-${width}.png`, image = await page.screenshot({ path: resolve(out, screenshot), fullPage: true, animations: "disabled" });
      const visibleText = await root.innerText();
      results.push({ name: sample.name, path: sample.path, width, height, synthetic: true, ...metrics, calls, pageErrors, unmatched, visibleText, screenshot, sha256: createHash("sha256").update(image).digest("hex") });
      console.log(`${phase} ${sample.name} ${width}: real goal surface, synthetic browser outcomes and API interception; no overflow/page errors/writes`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
const sourceHashes = {};
for (const name of ["NotFound", "Offline", "Emails", "AppStates"]) sourceHashes[`client/src/pages/${name}.tsx`] = createHash("sha256").update(await readFile(resolve(`client/src/pages/${name}.tsx`))).digest("hex");
for (const name of ["GoalNotFound", "GoalOffline", "GoalEmails", "GoalAppStates"]) sourceHashes[`client/src/pages/goal/system/${name}.tsx`] = createHash("sha256").update(await readFile(resolve(`client/src/pages/goal/system/${name}.tsx`))).digest("hex");
await writeFile(resolve(out, "receipt.json"), JSON.stringify({ task: "D-048-K-system", phase, source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceHashes, runtime: "Owned local Vite preview with system released goal UI; browser APIs mocked and all network fixtures local", synthetic: true, productionRequests: 0, realInstallOrPermission: false, results }, null, 2) + "\n");
