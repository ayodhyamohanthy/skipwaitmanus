// Synthetic local parity proof. Run from the repository root; no production API calls.
// node design/goal-ui/captures/start/retirement/capture.mjs before|after
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
import sharp from "sharp";

const phase = process.argv[2];
if (phase !== "before" && phase !== "after") throw new Error("Pass before or after");
const root = process.cwd();
const here = path.dirname(fileURLToPath(import.meta.url));
const entryPath = "client/src/pages/Onboarding.tsx";
const baselineRef = "e8845c360425d3ac546ccad8c5de89c77cda12b1";
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sourceHead = git(["rev-parse", "HEAD"]);
const entrySource = phase === "before"
  ? execFileSync("git", ["show", `${baselineRef}:${entryPath}`], { cwd: root, encoding: "utf8" })
  : await readFile(path.join(root, entryPath), "utf8");
const entrySha256 = createHash("sha256").update(entrySource).digest("hex");
const base = "http://127.0.0.1:4347";
const url = "https://quillmint.com/careers/product-designer";
const states = ["start", "invalid", "checking", "identified", "ambiguous", "confirmed", "outage", "draft", "private"];
const results = [];
const server = await createServer({
  configFile: path.join(root, "vite.config.ts"),
  mode: "retirement-capture",
  logLevel: "error",
  plugins: [{
    name: "start-retirement-entry",
    enforce: "pre",
    transform(code, id) {
      if (id.split("?")[0] === path.join(root, entryPath)) return { code: entrySource, map: null };
    },
  }],
  server: { host: "127.0.0.1", port: 4347, strictPort: true, hmr: false },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  await mkdir(path.join(here, phase), { recursive: true });
  for (const state of states) {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        deviceScaleFactor: width === 390 ? 2 : 1,
        reducedMotion: "reduce", serviceWorkers: "block", locale: "en-US",
      });
      await context.route("**/*", async route => {
        const target = new URL(route.request().url());
        if (target.origin !== base) return route.abort();
        if (!target.pathname.startsWith("/api/")) return route.continue();
        let status = 200;
        let body = {};
        if (target.pathname.startsWith("/api/trpc/")) {
          const names = target.pathname.slice("/api/trpc/".length).split(",");
          const values = names.map(() => ({ result: { data: { json: null } } }));
          body = target.searchParams.has("batch") ? values : values[0];
        } else if (target.pathname === "/api/job-link/preview") {
          if (state === "checking" || state === "draft") return;
          if (state === "outage") { status = 503; body = { error: "Synthetic preview outage" }; }
          else if (state === "ambiguous" || state === "confirmed") {
            body = { canonicalUrl: url, status: "ok", employerConfidence: "ambiguous", companyDomain: null, reason: "Several companies match", recoveryAction: "Confirm the company domain." };
          } else body = { canonicalUrl: url, status: "ok", employerConfidence: "verified", companyDomain: "quillmint.com", companyName: "Quillmint" };
        } else if (target.pathname === "/api/dev-auth/session") body = { signedIn: false, account: null };
        else if (target.pathname === "/api/account/preferences") body = { preferences: { timeZone: "UTC", dateFormat: "dmy" } };
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.setFixedTime(new Date("2026-11-18T00:00:00.000Z"));
      await page.addInitScript(({ state, url }) => {
        localStorage.setItem("skipwait:cookie-consent", "essential");
        if (state === "draft") localStorage.setItem("skipwait-pwa-referral-draft", JSON.stringify({ name: "Synthetic Seeker", targetUrl: url, updatedAt: Date.now() - 60_000 }));
      }, { state, url });
      await page.goto(`${base}/start${state === "private" ? "?fast=SYNTHETIC" : ""}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("goal-start").waitFor();
      const input = page.getByLabel("Target Role URL", { exact: true });
      if (!["start", "draft", "private"].includes(state)) await input.fill(state === "invalid" ? "not a job link" : url);
      if (state === "invalid") await page.getByText("That doesn't look like a job link yet. Copy the link from the job posting and paste it here.").waitFor();
      if (state === "checking" || state === "draft") await page.getByText("Checking the link…", { exact: true }).waitFor();
      if (state === "identified") await page.getByText("Company identified: Quillmint", { exact: true }).waitFor();
      if (state === "ambiguous" || state === "confirmed") {
        await page.getByLabel("Company domain", { exact: true }).waitFor();
        if (state === "confirmed") await page.getByLabel("Company domain", { exact: true }).fill("quillmint.com");
      }
      if (state === "outage") await page.getByRole("alert").waitFor();
      if (state === "private") await page.getByText("Private referral path", { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const file = `${state}-${width}.png`;
      await page.screenshot({ path: path.join(here, phase, file), fullPage: true, animations: "disabled" });
      const geometry = await page.evaluate(() => ({
        horizontalOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        continueDisabled: document.querySelector('[data-g-primary="true"]')?.getAttribute("aria-disabled") === "true",
      }));
      if (geometry.horizontalOverflowPx || errors.length) throw new Error(JSON.stringify({ state, width, errors, ...geometry }));
      const sha256 = createHash("sha256").update(await readFile(path.join(here, phase, file))).digest("hex");
      results.push({ state, width, file, sha256, errors, ...geometry });
      await context.close();
    }
  }
  await writeFile(path.join(here, `${phase}.json`), JSON.stringify({ synthetic: true, baselineRef, sourceHead, entrySha256, baselineEntryOnly: phase === "before", results }, null, 2) + "\n");
  if (phase === "after") {
    const before = JSON.parse(await readFile(path.join(here, "before.json"), "utf8"));
    const comparison = [];
    for (const result of results) {
      const pair = before.results.find(item => item.file === result.file);
      if (!pair) throw new Error(`Missing baseline ${result.file}`);
      const [a, b] = await Promise.all(["before", "after"].map(folder => sharp(path.join(here, folder, result.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      if (a.info.width !== b.info.width || a.info.height !== b.info.height || a.data.length !== b.data.length) throw new Error(`Dimensions differ: ${result.file}`);
      let differentPixels = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        if (!a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) differentPixels++;
      }
      comparison.push({ file: result.file, differentPixels, width: a.info.width, height: a.info.height, beforeSha256: pair.sha256, afterSha256: result.sha256 });
    }
    await writeFile(path.join(here, "comparison.json"), JSON.stringify({ synthetic: true, beforeEntrySha256: before.entrySha256, afterEntrySha256: entrySha256, results: comparison }, null, 2) + "\n");
    console.log(JSON.stringify({ phase, captures: results.length, differentPixels: comparison.reduce((total, item) => total + item.differentPixels, 0) }));
  } else console.log(JSON.stringify({ phase, captures: results.length, entrySha256 }));
} finally {
  await browser.close();
  await server.close();
}
