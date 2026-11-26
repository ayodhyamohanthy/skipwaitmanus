#!/usr/bin/env node
// Synthetic production-build parity proof. Run from the repository root after `pnpm build`.
// Before: on the pre-retirement main worktree. After: on the retirement candidate worktree.
// Usage: node client/src/pages/goal/profile/retirement/capture.mjs before|after <evidence-dir>
// All API responses are fixture-backed; external network requests are blocked.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const phase = process.argv[2];
const output = process.argv[3];
if (phase !== "before" && phase !== "after") throw new Error("Pass before or after");
if (!output) throw new Error("Pass an evidence directory outside the repository");

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const { chromium } = require("playwright");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const evidence = path.resolve(output);
const fixtures = path.join(root, "design/goal-ui/captures/profile/fixtures");
const states = [
  ["profile-default", "/profile", "profile__default"],
  ["profile-error", "/profile", "profile__error"],
  ["profile-link", "/profile?focus=handle", "profile__link"],
  ["profile-referrer", "/profile", "profile__referrer"],
  ["profile-signed-out", "/profile", "profile__signed-out"],
  ["work-signed-out", "/work", "profile__signed-out"],
  ["work-work", "/work", "profile__work"],
  ["work-work-add", "/work", "profile__work-add"],
  ["work-work-empty", "/work", "profile__work-empty"],
  ["work-work-error", "/work", "profile__work-error"],
  ["work-work-referrer-view", "/work", "profile__work-referrer-view"],
];

const server = await require("vite").preview({
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "silent",
  preview: { host: "127.0.0.1", port: 4396, strictPort: true },
});
const browser = await chromium.launch();
const results = [];
try {
  await mkdir(path.join(evidence, phase), { recursive: true });
  for (const [name, pathname, fixtureName] of states) {
    const fixture = JSON.parse(await readFile(path.join(fixtures, `${fixtureName}.json`), "utf8"));
    for (const width of [1280, 390]) {
      const mobile = width === 390;
      const context = await browser.newContext({
        viewport: { width, height: mobile ? 844 : 900 },
        deviceScaleFactor: mobile ? 2 : 1,
        isMobile: mobile,
        hasTouch: mobile,
        locale: "en-US",
        timezoneId: "UTC",
        colorScheme: "light",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      const requests = new Set();
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== "http://127.0.0.1:4396") return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        requests.add(`${route.request().method()} ${url.pathname}`);
        if (url.pathname.startsWith("/api/trpc/")) {
          const names = url.pathname.slice("/api/trpc/".length).split(",");
          const calls = names.map(name => ({ result: { data: { json: name === "auth.me" ? fixture.signedIn || null : null } } }));
          const body = url.searchParams.has("batch") ? calls : calls[0];
          return route.fulfill({ status: 200, json: body });
        }
        if (url.pathname === "/api/account/preferences") return route.fulfill({ status: 200, json: { preferences: { timeZone: "UTC", dateFormat: "dmy" } } });
        const mock = fixture.routes?.find(record => record.path === url.pathname && record.method === route.request().method());
        return route.fulfill({ status: mock?.status ?? 200, json: mock?.body ?? {} });
      });
      await context.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "essential"));
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.setFixedTime(new Date("2026-11-19T00:00:00Z"));
      await page.goto(`http://127.0.0.1:4396${pathname}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const screen = name.startsWith("work-") ? "work" : "profile";
      const main = page.locator(`main[data-goal-page="${screen}"][data-skipwait-screen="${fixture.signedIn ? screen : `${screen}-sign-in`}"]`);
      await main.waitFor({ timeout: 30_000 });
      const click = label => main.getByRole("button", { name: label, exact: true });
      if (!fixture.signedIn) await main.locator('[data-g-primary="true"]').getByText("Sign in", { exact: true }).waitFor();
      else if (name.endsWith("error")) await main.getByRole("alert").getByRole("button", { name: "Try again" }).waitFor();
      else if (name === "profile-link") await page.getByRole("dialog", { name: "Change your profile link" }).waitFor();
      else if (screen === "profile") {
        await main.getByLabel("Headline").waitFor();
        if (name === "profile-referrer") await click("Referrer profile").click();
      } else {
        await main.getByTestId("pin-count").waitFor();
        await main.getByText("meera", { exact: true }).waitFor();
        if (name === "work-work-add") {
          await click("Add work").click();
          await page.getByRole("dialog", { name: "Add work" }).waitFor();
        }
        if (name === "work-work-referrer-view") {
          await click("What a referrer sees").click();
          await main.getByRole("region", { name: "Work a referrer sees" }).waitFor();
          assert.equal(await main.getByText("Private sketchbook").count(), 0);
        }
      }
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const file = `${name}-${width}.png`;
      const bytes = await page.screenshot({ path: path.join(evidence, phase, file), fullPage: true, animations: "disabled" });
      assert.equal(overflow, 0, `${file} overflow`);
      assert.deepEqual(errors, [], `${file} page errors`);
      if (!fixture.signedIn) assert.ok(!requests.has("GET /api/profile/me") && !requests.has("GET /api/work-items"));
      results.push({ file, width, pathname, overflow, errors, sha256: digest(bytes), requests: [...requests].sort() });
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(path.join(evidence, `${phase}.json`), JSON.stringify({ synthetic: true, sourceHead: git("rev-parse", "HEAD"), results }, null, 2) + "\n");
if (phase === "after") {
  const before = JSON.parse(await readFile(path.join(evidence, "before.json"), "utf8"));
  const comparisons = [];
  for (const item of results) {
    const prior = before.results.find(candidate => candidate.file === item.file);
    assert.ok(prior, item.file);
    const [oldImage, newImage] = await Promise.all(["before", "after"].map(folder => require("sharp")(path.join(evidence, folder, item.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    assert.deepEqual(oldImage.info, newImage.info, item.file);
    let differentPixels = 0;
    for (let offset = 0; offset < oldImage.data.length; offset += 4) if (oldImage.data.readUInt32LE(offset) !== newImage.data.readUInt32LE(offset)) differentPixels++;
    comparisons.push({ file: item.file, differentPixels, beforeSha256: prior.sha256, afterSha256: item.sha256 });
  }
  await writeFile(path.join(evidence, "comparison.json"), JSON.stringify(comparisons, null, 2) + "\n");
  console.log(JSON.stringify({ pairs: comparisons.length, differentPixels: comparisons.reduce((sum, item) => sum + item.differentPixels, 0), evidence }));
} else console.log(JSON.stringify({ captures: results.length, evidence }));
