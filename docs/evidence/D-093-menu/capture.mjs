import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import express from "express";
import sharp from "sharp";
import { chromium } from "playwright";
import { buildLanguageFixture } from "./fixture-build.mjs";

const [baselineRoot, candidateRoot, destination = "docs/evidence/D-093-menu/verified"] = process.argv.slice(2);
assert.ok(baselineRoot && candidateRoot, "provide baseline/candidate repository roots with completed normal production builds");
const out = resolve(destination);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const revision = root => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const registryHash = hash(await readFile(join(candidateRoot, "shared/languages.ts")));
const fixture = await buildLanguageFixture(candidateRoot);
assert.equal(fixture.identity.productionRegistrySha256, registryHash);
const person = { id: 79, name: "Synthetic Seeker", email: "seeker@synthetic.example", role: "user", openId: "synthetic", loginMethod: "fixture" };
const results = [];
await mkdir(out, { recursive: true });
async function serve(directory) {
  const app = express();
  app.use("/api", (_req, res) => res.status(501).json({ error: "Synthetic interception required" }));
  app.use(express.static(resolve(directory)));
  app.get("*", (_req, res) => res.sendFile(resolve(directory, "index.html")));
  const server = await new Promise((done, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => done(listener));
    listener.on("error", reject);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
const browser = await chromium.launch();
try {
  for (const target of [
    { name: "before", directory: join(baselineRoot, "dist/public"), fixture: false },
    { name: "after", directory: join(candidateRoot, "dist/public"), fixture: false },
    { name: "two-language-fixture", directory: fixture.directory, fixture: true },
  ]) {
    const host = await serve(target.directory);
    try {
      for (const width of [1280, 390]) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block", colorScheme: "light" });
        try {
          const errors = [], unexpected = [], calls = [], preferencesWrites = [];
          const page = await context.newPage();
          page.on("pageerror", error => errors.push(error.message));
          await context.route("**/*", route => {
            const request = route.request(), url = new URL(request.url()), method = request.method();
            if (url.origin !== host.origin) return route.fulfill({ status: 204, body: "" });
            if (!url.pathname.startsWith("/api/")) return route.continue();
            calls.push(`${method} ${url.pathname}`);
            const json = body => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
            if (url.pathname.startsWith("/api/trpc/")) {
              const payload = url.pathname.slice(10).split(",").map(name => ({ result: { data: { json: name === "auth.me" ? person : null } } }));
              return json(url.searchParams.has("batch") ? payload : payload[0]);
            }
            if (["/api/account/signup-language", "/api/csp-report"].includes(url.pathname)) return route.fulfill({ status: 204, body: "" });
            if (url.pathname === "/api/dev-auth/session") return json({ signedIn: true, account: person });
            if (url.pathname === "/api/account/preferences") {
              if (method === "PUT") preferencesWrites.push(request.postDataJSON());
              return json({ preferences: { timeZone: "UTC", dateFormat: "mdy", language: null } });
            }
            if (url.pathname === "/api/notifications") return json({ notifications: [] });
            if (url.pathname === "/api/credits/summary") return json({ summary: { totalAvailable: 3 } });
            if (url.pathname === "/api/company-referrals/access") return json({ verifiedCompanyAccess: false, workEmailDomain: null });
            if (url.pathname === "/api/company-referrals/mine") return json({ requests: [], slots: { plan: "free", planLabel: "Free", open: 0, cap: 3, full: false, nextPlan: null }, hasEverAsked: false });
            unexpected.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 501, json: { error: "Unexpected synthetic request" } });
          });
          const response = await page.goto(`${host.origin}/start`, { waitUntil: "networkidle", timeout: 25_000 });
          assert.equal(response.status(), 200);
          const originalUrl = page.url();
          const trigger = page.getByRole("button", { name: "Account menu", exact: true });
          await trigger.waitFor();
          assert.equal(await trigger.getAttribute("aria-haspopup"), "menu", "verify the real account menu, not a shell placeholder");
          await trigger.click();
          await page.getByRole("menuitem", { name: "Settings", exact: true }).waitFor();
          const capture = async (state, metrics = {}) => {
            await page.evaluate(() => document.fonts.ready);
            await page.mouse.move(0, 0);
            const surface = await page.evaluate(() => ({ text: document.body.innerText, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
            assert.equal(surface.overflow, 0);
            assert.deepEqual(errors, []);
            assert.deepEqual(unexpected, []);
            assert.equal(page.url(), originalUrl, "the menu must never navigate to choose a language");
            const screenshot = `${target.name}-${state}-${width}.png`;
            const png = await page.screenshot({ path: join(out, screenshot), fullPage: true, animations: "disabled" });
            results.push({ target: target.name, fixtureOnly: target.fixture, state, width, route: new URL(page.url()).pathname, screenshot, pngSha256: hash(png), pixelSha256: hash(await sharp(png).ensureAlpha().raw().toBuffer()), ...surface, ...metrics, calls: [...calls], preferencesWrites: [...preferencesWrites], errors: [...errors], unexpected: [...unexpected] });
            console.log(`${target.name} ${state} ${width}: no overflow, navigation, page error or unmatched API`);
          };
          if (!target.fixture) {
            assert.equal(await page.getByRole("menuitem", { name: "Language", exact: true }).count(), 0);
            assert.deepEqual(preferencesWrites, []);
            await capture("menu");
          } else {
            const item = page.getByRole("menuitem", { name: "Language", exact: true });
            const entryBounds = await item.boundingBox();
            assert.ok(entryBounds && entryBounds.height >= 44, "new language entry has a phone-sized hit target");
            await capture("menu", { entryHeight: entryBounds.height });
            await item.click();
            const picker = page.getByRole("combobox", { name: "Language", exact: true });
            await picker.waitFor();
            await page.waitForFunction(() => document.activeElement?.tagName === "SELECT");
            const popover = page.getByRole("dialog", { name: "Language", exact: true });
            const bounds = await popover.boundingBox();
            const pickerBounds = await picker.boundingBox();
            const doneBounds = await page.getByRole("button", { name: "Done", exact: true }).boundingBox();
            assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
            assert.ok(pickerBounds && pickerBounds.height >= 44 && doneBounds && doneBounds.height >= 44);
            assert.deepEqual(await picker.locator("option").evaluateAll(options => options.map(option => [option.textContent, option.lang])), [["English", "en"], [fixture.identity.expandedEndonym, "hi"]]);
            assert.deepEqual(preferencesWrites, [], "opening the picker is not a language choice");
            await capture("picker", { popoverWidth: bounds.width, controlHeight: pickerBounds.height });
            const saved = page.waitForResponse(reply => new URL(reply.url()).pathname === "/api/account/preferences" && reply.request().method() === "PUT");
            await picker.selectOption("hi");
            await saved;
            assert.equal(await page.evaluate(() => localStorage.getItem("sw:language")), "hi");
            assert.deepEqual(preferencesWrites, [{ language: "hi" }]);
            await capture("selected");
            await page.keyboard.press("Escape");
            await picker.waitFor({ state: "hidden" });
            await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Account menu");
            await capture("closed");
          }
          await writeFile(join(out, "capture.json"), JSON.stringify({ task: "D-093.menu", synthetic: true, productionRequests: 0, beforeRevision: revision(baselineRoot), afterRevision: revision(candidateRoot), fixture: fixture.identity, results }, null, 2) + "\n");
        } finally { await context.close(); }
      }
    } finally { await new Promise(done => host.server.close(done)); }
  }
  const pairs = [1280, 390].map(width => {
    const before = results.find(row => row.target === "before" && row.width === width);
    const after = results.find(row => row.target === "after" && row.width === width);
    assert.ok(before && after);
    assert.equal(after.text, before.text);
    assert.equal(after.pixelSha256, before.pixelSha256);
    assert.deepEqual([...after.calls].sort(), [...before.calls].sort());
    return { width, before: before.screenshot, after: after.screenshot, englishOnlyPixelIdentical: true, textAndRequestMultisetsIdentical: true };
  });
  assert.equal(hash(await readFile(join(candidateRoot, "shared/languages.ts"))), registryHash);
  await writeFile(join(out, "parity.json"), JSON.stringify({ task: "D-093.menu", normalProductionRegistryUnchanged: true, englishOnlyPairs: pairs, fixtureScreens: results.filter(row => row.fixtureOnly).length }, null, 2) + "\n");
  console.log(JSON.stringify({ englishOnlyPairs: pairs.length, fixtureScreens: results.filter(row => row.fixtureOnly).length }));
} finally {
  await browser.close();
  await rm(fixture.directory, { recursive: true, force: true });
}
