import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import express from "express";
import sharp from "sharp";
import { chromium } from "playwright";
import { buildLanguageFixture } from "../../../../docs/evidence/D-093-menu/fixture-build.mjs";

const [baselineRoot, candidateRoot, destination = "design/goal-ui/captures/language/verified"] = process.argv.slice(2);
assert.ok(baselineRoot && candidateRoot, "provide baseline and candidate repositories with completed production builds");
const output = resolve(destination);
const hash = value => createHash("sha256").update(value).digest("hex");
const revision = root => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const registry = join(candidateRoot, "shared/languages.ts");
const registryHash = hash(await readFile(registry));
const fixture = await buildLanguageFixture(candidateRoot);
const person = { id: 79, name: "Synthetic Seeker", email: "seeker@synthetic.example", role: "user", openId: "synthetic", loginMethod: "fixture" };
const routes = [
  { name: "app-shell", path: "/alerts", picker: true, landing: false },
  { name: "goal-app-shell", path: "/explore", picker: true, landing: false },
  { name: "goal-landing", path: "/", picker: false, landing: true },
];
const targets = [
  { name: "before", root: baselineRoot, directory: join(baselineRoot, "dist/public"), locale: "en-US", fixtureOnly: false },
  { name: "english-only", root: candidateRoot, directory: join(candidateRoot, "dist/public"), locale: "en-US", fixtureOnly: false },
  { name: "two-language-fixture", root: candidateRoot, directory: fixture.directory, locale: "hi-IN", fixtureOnly: true },
];
const widths = [1280, 390];
const results = [];

async function serve(directory) {
  const app = express();
  app.use(express.static(resolve(directory)));
  app.get("*", (_request, response) => response.sendFile(resolve(directory, "index.html")));
  const server = await new Promise((done, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => done(listener));
    listener.on("error", reject);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const target of targets) {
    const host = await serve(target.directory);
    try {
      for (const route of routes) {
        for (const signedIn of [false, true]) {
          if (route.landing && signedIn) continue;
          for (const width of widths) {
            const context = await browser.newContext({
              viewport: { width, height: width === 390 ? 844 : 900 },
              deviceScaleFactor: width === 390 ? 2 : 1,
              locale: target.locale,
              timezoneId: "UTC",
              reducedMotion: "reduce",
              serviceWorkers: "block",
              colorScheme: "light",
            });
            try {
              const errors = [];
              const unexpected = [];
              const calls = [];
              const page = await context.newPage();
              page.on("pageerror", error => errors.push(error.message));
              await page.route("**/*", async requestRoute => {
                const request = requestRoute.request();
                const url = new URL(request.url());
                if (url.origin !== host.origin) return requestRoute.fulfill({ status: 204, body: "" });
                if (!url.pathname.startsWith("/api/")) return requestRoute.continue();
                calls.push(`${request.method()} ${url.pathname}`);
                const json = body => requestRoute.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
                if (url.pathname.startsWith("/api/trpc/")) {
                  const names = url.pathname.slice(10).split(",");
                  const payload = names.map(name => ({ result: { data: { json: name === "auth.me" && signedIn ? person : null } } }));
                  return json(url.searchParams.has("batch") ? payload : payload[0]);
                }
                if (url.pathname === "/api/dev-auth/session") return json({ signedIn, account: signedIn ? person : null });
                if (url.pathname === "/api/account/preferences") return json({ preferences: { timeZone: "UTC", dateFormat: "mdy", language: null } });
                if (["/api/account/signup-language", "/api/csp-report"].includes(url.pathname)) return requestRoute.fulfill({ status: 204, body: "" });
                if (url.pathname === "/api/company-referrals/access") return json({ verifiedCompanyAccess: false, workEmailDomain: null });
                if (url.pathname === "/api/company-referrals/mine") return json({ requests: [], slots: { plan: "free", planLabel: "Free", open: 0, cap: 3, full: false, nextPlan: null }, hasEverAsked: false });
                if (url.pathname === "/api/credits/summary") return json({ summary: { totalAvailable: 3 } });
                if (url.pathname.startsWith("/api/notifications")) return json({ notifications: [], unreadCount: 0 });
                if (url.pathname.startsWith("/api/companies")) return json({ companies: [], results: [], total: 0 });
                unexpected.push(`${request.method()} ${url.pathname}`);
                return requestRoute.fulfill({ status: 200, contentType: "application/json", body: "{}" });
              });
              const response = await page.goto(`${host.origin}${route.path}`, { waitUntil: "networkidle", timeout: 25_000 });
              assert.equal(response?.status(), 200, `${route.name} returns 200`);
              await page.evaluate(() => document.fonts.ready);
              const consent = page.getByRole("region", { name: "Language suggestion" });
              if (target.fixtureOnly) await consent.waitFor();
              else assert.equal(await consent.count(), 0, "English-only has no language suggestion");
              const picker = page.getByRole("combobox", { name: "Language" });
              if (route.picker && !signedIn && target.fixtureOnly) {
                await picker.waitFor();
                const bounds = await picker.boundingBox();
                assert.ok(bounds && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width);
              } else assert.equal(await picker.count(), 0, "picker is absent for English-only, signed-in, and landing states");
              const surface = await page.evaluate(() => ({ text: document.body.innerText, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
              assert.equal(surface.overflow, 0, `${route.name} ${width}px has no horizontal overflow`);
              assert.deepEqual(errors, [], `${route.name} ${width}px has no page errors`);
              assert.deepEqual(unexpected, [], `${route.name} has no unmatched API calls`);
              const state = signedIn ? "signed-in" : "signed-out";
              const name = `${target.name}-${route.name}-${state}-${width}.png`;
              const png = await page.screenshot({ path: join(output, name), fullPage: true, animations: "disabled" });
              results.push({ target: target.name, route: route.path, mount: route.name, state, width, locale: target.locale, screenshot: name, pngSha256: hash(png), pixelSha256: hash(await sharp(png).ensureAlpha().raw().toBuffer()), ...surface, calls, errors, unexpected, fixtureOnly: target.fixtureOnly });
              console.log(`${target.name} ${route.name} ${state} ${width}: no overflow or page errors`);
            } finally { await context.close(); }
          }
        }
      }
    } finally { await new Promise(done => host.server.close(done)); }
  }

  const englishPairs = [];
  for (const route of routes) {
    for (const signedIn of [false, true]) {
      if (route.landing && signedIn) continue;
      for (const width of widths) {
        const state = signedIn ? "signed-in" : "signed-out";
        const before = results.find(row => row.target === "before" && row.mount === route.name && row.state === state && row.width === width);
        const after = results.find(row => row.target === "english-only" && row.mount === route.name && row.state === state && row.width === width);
        assert.ok(before && after);
        assert.equal(after.text, before.text, `${route.name} English-only text matches baseline`);
        assert.equal(after.pixelSha256, before.pixelSha256, `${route.name} English-only pixels match baseline`);
        englishPairs.push({ mount: route.name, state, width, before: before.screenshot, after: after.screenshot, pixelIdentical: true });
      }
    }
  }

  assert.equal(hash(await readFile(registry)), registryHash, "production visibility and language registry must remain unchanged");
  const evidence = { task: "D-093.mount", baselineRevision: revision(baselineRoot), candidateRevision: revision(candidateRoot), fixture: fixture.identity, englishOnlyPairs: englishPairs, results };
  await writeFile(join(output, "capture.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({ englishOnlyPairs: englishPairs.length, screenshots: results.length, fixtureOnly: results.filter(row => row.fixtureOnly).length }));
} finally {
  await browser.close();
  await import("node:fs/promises").then(module => module.rm(fixture.directory, { recursive: true, force: true }));
}
