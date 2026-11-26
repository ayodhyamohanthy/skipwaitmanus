import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const [phase, base = "http://127.0.0.1:5191", destination = "docs/evidence/D-048-K-developers"] = process.argv.slice(2);
assert.ok(phase === "before" || phase === "after");
const out = resolve(destination, phase);
const { chromium } = createRequire(resolve("package.json"))("playwright");
const person = { id: 41, name: "Synthetic Developer", email: "dev@synthetic.example", role: "user", openId: "fixture", loginMethod: "fixture" };
const secret = "SYNTHETIC_814e_NEVER_RENDER";
const app = (id, name, status) => ({ id, name, kind: "agent_mcp", description: "Tracks referral requests", website: "https://synthetic.example", redirectUrls: ["https://synthetic.example/cb"], scopes: ["companies:read", "requests:read", "asks:draft"], status, rejectReasons: status === "rejected" ? ["Explain what is sent for the user"] : [], webhookUrl: null, clientId: `sw_app_synthetic${id}`, createdAt: "2026-10-01T00:00:00.000Z", clientSecret: secret, signingKey: secret });
const cases = [
  { name: "public", path: "/developers", signedIn: false },
  { name: "signed-out", path: "/developer-console", signedIn: false },
  { name: "list", apps: [app(1, "Trackwise", "live"), app(2, "Pathfinder", "rejected"), app(3, "Draftly", "test")] },
  { name: "empty", apps: [] },
  { name: "load-error", error: true },
  { name: "details", path: "/developer-console?app=3&details=1" },
  { name: "in-review", path: "/developer-console?app=3", status: "in_review" },
  { name: "rejected", path: "/developer-console?app=3", status: "rejected" },
  { name: "suspended", path: "/developer-console?app=3", status: "suspended" },
  { name: "not-found", path: "/developer-console?app=99" },
  { name: "register", path: "/developer-console?new=1", apps: [] },
  { name: "edit-rejected", path: "/developer-console?app=3", status: "rejected", action: "edit" },
  { name: "webhook-saved", path: "/developer-console?app=3&details=1", action: "webhook" },
  { name: "submitted", path: "/developer-console?app=3", action: "submit" },
  { name: "registered", path: "/developer-console?new=1", apps: [], action: "register" },
];
const results = [];
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) for (const sample of cases) {
    const height = width === 390 ? 844 : 900;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: width === 390, hasTouch: width === 390, locale: "en-US", timezoneId: "UTC", colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
    try {
      const page = await context.newPage(), errors = [], unmatched = [], calls = [];
      const account = sample.signedIn === false ? null : person;
      const apps = sample.apps ?? [app(3, "Draftly", sample.status ?? "test")];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (url.origin !== new URL(base).origin) return route.fulfill({ status: 204, body: "" });
        if (!url.pathname.startsWith("/api/")) return route.continue();
        const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (url.pathname.startsWith("/api/trpc/")) {
          const body = url.pathname.slice("/api/trpc/".length).split(",").map(name => ({ result: { data: { json: name === "auth.me" ? account : null } } }));
          return json(200, url.searchParams.has("batch") ? body : body[0]);
        }
        if (url.pathname === "/api/dev-auth/session") return json(200, account ? { signedIn: true, account } : { signedIn: false });
        if (url.pathname === "/api/credits/summary") return json(200, { summary: { totalAvailable: 3 } });
        if (url.pathname === "/api/company-referrals/access") return json(200, { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
        if (url.pathname === "/api/account/preferences") return json(200, { preferences: { timeZone: "UTC", dateFormat: "mdy", language: "en" } });
        if (url.pathname === "/api/notifications") return json(200, { notifications: [] });
        if (url.pathname === "/api/account/signup-language" || url.pathname === "/api/csp-report") return route.fulfill({ status: 204, body: "" });
        if (url.pathname.startsWith("/api/developer-apps")) {
          const body = request.postData() ? JSON.parse(request.postData()) : null;
          calls.push({ method, path: url.pathname, body });
          if (method === "GET" && url.pathname === "/api/developer-apps") return sample.error ? json(503, { error: "Synthetic apps unavailable" }) : json(200, { apps });
          if (method === "POST" && url.pathname === "/api/developer-apps" && sample.action === "register") return json(201, { app: { ...app(7, body.name, "test"), description: body.description } });
          if (method === "PUT" && url.pathname === "/api/developer-apps/3/webhook" && sample.action === "webhook") return json(200, { webhookUrl: body.webhookUrl });
          if (method === "POST" && url.pathname === "/api/developer-apps/3/submit" && sample.action === "submit") return json(200, {});
        }
        unmatched.push(`${method} ${url.pathname}`);
        return json(501, { error: "Unmatched synthetic request" });
      });
      await page.goto(`${base}${sample.path ?? "/developer-console"}`, { waitUntil: "networkidle" });
      await page.locator("[data-goal-page]").waitFor();
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      if (sample.error) await page.getByRole("alert").waitFor();
      if (sample.action === "edit") {
        await page.getByRole("button", { name: "Edit and resubmit", exact: true }).click();
        await page.getByLabel("App name", { exact: true }).waitFor();
        assert.equal(await page.getByLabel("App name", { exact: true }).inputValue(), "Draftly");
      }
      if (sample.action === "webhook") {
        await page.getByLabel("Webhook URL", { exact: true }).fill("https://synthetic.example/hooks");
        await Promise.all([page.waitForResponse(response => response.url().endsWith("/3/webhook") && response.request().method() === "PUT"), page.getByRole("button", { name: "Save webhook", exact: true }).click()]);
        await page.getByRole("button", { name: "Save webhook", exact: true }).waitFor();
        assert.deepEqual(calls.filter(call => call.method !== "GET"), [{ method: "PUT", path: "/api/developer-apps/3/webhook", body: { webhookUrl: "https://synthetic.example/hooks" } }]);
      }
      if (sample.action === "submit") {
        await page.getByRole("button", { name: "Submit for review", exact: true }).click();
        await page.getByRole("heading", { level: 1, name: "Draftly is in review", exact: true }).waitFor();
        assert.deepEqual(calls.filter(call => call.method !== "GET"), [{ method: "POST", path: "/api/developer-apps/3/submit", body: null }]);
      }
      if (sample.action === "register") {
        await page.getByLabel("App name", { exact: true }).fill("Synthetic app");
        await page.getByLabel("What does your app do for job seekers?", { exact: true }).fill("Tracks referral requests");
        await page.getByRole("button", { name: "Create app", exact: true }).click();
        await page.getByText("sw_app_synthetic7", { exact: true }).waitFor();
        assert.deepEqual(calls.filter(call => call.method !== "GET"), [{ method: "POST", path: "/api/developer-apps", body: { name: "Synthetic app", kind: "web_app", description: "Tracks referral requests", redirectUrls: [], scopes: ["companies:read", "requests:read", "asks:draft"], agreeToTerms: true } }]);
      }
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({ roots: document.querySelectorAll("[data-goal-page]").length, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), primaryActions: document.querySelectorAll("[data-g-primary]").length }));
      assert.equal(metrics.roots, 1); assert.equal(metrics.overflow, 0); assert.deepEqual(errors, []); assert.deepEqual(unmatched, []);
      assert.ok(!(await page.content()).includes(secret));
      if (!account) assert.deepEqual(calls, []);
      const screenshot = `${sample.name}-${width}.png`, image = await page.screenshot({ path: resolve(out, screenshot), fullPage: true, animations: "disabled" });
      results.push({ name: sample.name, route: new URL(page.url()).pathname + new URL(page.url()).search, width, height, synthetic: true, signedIn: account !== null, ...metrics, pageErrors: errors, unmatchedApi: unmatched, calls, screenshot, sha256: createHash("sha256").update(image).digest("hex") });
      console.log(`${phase} ${sample.name} ${width}: expected goal UI, requests, no secret/overflow/errors`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
const sourceHashes = {};
for (const path of ["client/src/pages/Developers.tsx", "client/src/pages/DeveloperConsole.tsx", "client/src/pages/goal/developers/GoalDevelopers.tsx", "client/src/pages/goal/developers/GoalDeveloperConsole.tsx"]) sourceHashes[path] = createHash("sha256").update(await readFile(resolve(path))).digest("hex");
await writeFile(resolve(out, "receipt.json"), JSON.stringify({ task: "D-048-K-developers", phase, source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceHashes, runtime: "Local Vite preview, released goal UI; browser API fixtures intercept every API request and fulfill external telemetry locally", synthetic: true, productionRequests: 0, secretsRendered: false, results }, null, 2) + "\n");
