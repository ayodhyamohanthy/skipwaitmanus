import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

const [baseline, candidate, out] = process.argv.slice(2);
const require = createRequire(join(candidate, "package.json"));
const express = require("express");
const { chromium } = require("playwright");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const head = cwd => execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();

async function serve(root) {
  const files = join(root, "dist", "public");
  const app = express();
  app.use(express.static(files));
  app.get("*", (_request, response) => response.sendFile(join(files, "index.html")));
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.on("error", reject);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, server };
}

const cases = [
  { id: "seeker", path: "/sign-in", page: "sign-in", heading: "Sign in to find or give a referral." },
  { id: "referrer", path: "/sign-in", page: "sign-in", heading: "Sign in to find or give a referral.", referrer: true },
  { id: "manage-passkeys", path: "/sign-in?passkeys=manage", page: "passkey-management", heading: "Manage your saved passkeys." },
  { id: "forgot-password", path: "/forgot-password", page: "forgot-password", heading: "Get back into your account." },
  { id: "reset-missing", path: "/reset-password", page: "reset-password", heading: "Set a new password and get back in.", state: "This link has expired or was already used" },
  { id: "reset-valid", path: "/reset-password?token=synthetic-review-token", page: "reset-password", heading: "Set a new password and get back in.", field: "New password" },
  { id: "reviewer-sign-in", path: "/reviewer-sign-in", page: "reviewer-sign-in", heading: "Review SkipWait with a demo account." },
];

async function capture(browser, target, variant, scenario, viewport) {
  const { width, height, deviceScaleFactor } = viewport;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, serviceWorkers: "block", reducedMotion: "reduce" });
  try {
    const errors = [];
    const mutations = [];
    await context.route("**/*", route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== target.origin) return route.fulfill({ status: 204 });
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (request.method() !== "GET" && url.pathname !== "/api/auth/passkey/login/options") mutations.push(url.pathname);
      if (url.pathname === "/api/auth/passkey/availability") return route.fulfill({ json: { enabled: scenario.id === "manage-passkeys" } });
      if (url.pathname === "/api/auth/passkey/list") return route.fulfill({ json: { credentials: [] } });
      if (url.pathname === "/api/auth/passkey/login/options") return route.fulfill({ status: 404, json: { code: "not_available" } });
      if (url.pathname === "/api/auth/password/reset/verify") return route.fulfill({ json: { valid: true } });
      if (url.pathname.startsWith("/api/trpc/")) {
        const payload = { result: { data: { json: null } } };
        return route.fulfill({ json: url.searchParams.get("batch") === "1" ? [payload] : payload });
      }
      return route.fulfill({ status: 401, json: { code: "sign_in_required" } });
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(target.origin + scenario.path, { waitUntil: "load", timeout: 25_000 });
    assert.equal(response?.status(), 200);
    await page.getByRole("heading", { name: scenario.heading, exact: true }).waitFor();
    const selector = scenario.page === "passkey-management"
      ? '[data-skipwait-screen="passkey-management"]'
      : `[data-goal-page="${scenario.page}"]`;
    await page.locator(selector).waitFor();
    if (scenario.referrer) {
      const intent = page.getByRole("button", { name: /Give a referral/ });
      await intent.click();
      assert.equal(await intent.getAttribute("aria-pressed"), "true");
      await page.getByLabel("Company email", { exact: true }).waitFor();
      assert.equal(await page.getByText(/Continue with (?:Google|Microsoft|GitHub|LinkedIn|Slack)/).count(), 0);
      assert.equal(await page.getByLabel("Password", { exact: true }).count(), 0);
    }
    if (scenario.field) await page.getByLabel(scenario.field, { exact: true }).waitFor();
    if (scenario.state) await page.getByRole("heading", { name: scenario.state }).waitFor();
    if (scenario.id === "manage-passkeys") await page.getByText("You have no saved passkeys.", { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const screenshot = await page.screenshot({ path: join(out, `${variant}-${scenario.id}-${width}.png`), fullPage: true, animations: "disabled" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (scenario.id === "manage-passkeys") {
      await page.getByRole("link", { name: "Back to sign-in", exact: true }).click();
      await page.getByRole("heading", { name: "Sign in to find or give a referral.", exact: true }).waitFor();
      assert.equal(new URL(page.url()).search, "");
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(mutations, []);
    assert.equal(overflow, false);
    return sha(screenshot);
  } finally {
    await context.close();
  }
}

await mkdir(out, { recursive: true });
const before = await serve(baseline);
const after = await serve(candidate);
const browser = await chromium.launch();
const pairs = [];
try {
  for (const viewport of [{ width: 1280, height: 900, deviceScaleFactor: 1 }, { width: 390, height: 844, deviceScaleFactor: 2 }]) {
    for (const scenario of cases) {
      const [oldHash, newHash] = await Promise.all([
        capture(browser, before, "before", scenario, viewport),
        capture(browser, after, "after", scenario, viewport),
      ]);
      pairs.push({ scenario: scenario.id, width: viewport.width, before: oldHash, after: newHash, identical: oldHash === newHash });
    }
  }
  const result = { baseline: head(baseline), candidate: head(candidate), pairs, identical: pairs.filter(pair => pair.identical).length, horizontalOverflow: 0, pageErrors: 0, authMutations: 0 };
  await writeFile(join(out, "receipt.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  before.server.close();
  after.server.close();
}
