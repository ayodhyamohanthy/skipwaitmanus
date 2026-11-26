// Read-only canonical release check. Fresh contexts, no sign-in or decision.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expected = process.env.EXPECTED_SHA;
assert.match(expected ?? "", /^[0-9a-f]{40}$/);
const phase = process.argv[2];
assert.ok(["baseline", "released"].includes(phase));
const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.join(here, `live-${phase}`);
await mkdir(folder, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, serviceWorkers: "block", locale: "en-US", reducedMotion: "reduce" });
    const privateReads = [], mutations = [], errors = [];
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== "https://skipwait.me") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      if (!['GET', 'HEAD'].includes(request.method())) {
        mutations.push({ method: request.method(), path: url.pathname });
        return route.fulfill({ status: 204, body: "" });
      }
      if (/^\/api\/(referrer-review-links|company-referrals|referrer\/step-up)/.test(url.pathname)) {
        privateReads.push(url.pathname);
        return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "No private API access in this check" }) });
      }
      return route.continue();
    });
    await context.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "essential"));
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      const response = await page.goto(`https://skipwait.me/email-review/${"q".repeat(48)}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "Sign in with work email", exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const sha = await page.locator('meta[name="git-commit"]').getAttribute("content");
      assert.equal(sha, expected);
      assert.equal(response?.status(), 200);
      assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
      assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Use your company email.");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0); assert.deepEqual(privateReads, []); assert.deepEqual(errors, []);
      assert.deepEqual(mutations.filter(request => request.path !== "/api/csp-report"), []);
      const file = `email-review-${width}.png`;
      await page.screenshot({ path: path.join(folder, file), fullPage: true, animations: "disabled" });
      results.push({ width, status: response.status(), webSha: sha, overflow, privateReads, blockedMutations: mutations, errors, file, sha256: createHash("sha256").update(await readFile(path.join(folder, file))).digest("hex") });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
const receipt = { checkedAt: new Date().toISOString(), expected, phase, readOnly: true, canonical: "https://skipwait.me", route: "/email-review/:synthetic-token", results };
await writeFile(path.join(folder, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
