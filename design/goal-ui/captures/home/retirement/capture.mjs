// Local fixtures only: all API and external traffic is intercepted.
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const phase = process.argv[2];
if (phase !== "before" && phase !== "after") throw new Error("Pass before or after");
const sourceCommit = process.env.RETIREMENT_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const homeEntryObject = execFileSync("git", ["rev-parse", `${sourceCommit}:client/src/pages/Home.tsx`], { encoding: "utf8" }).trim();
if (process.argv.includes("--manifest-only")) {
  const manifestPath = path.join(here, `${phase}.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const result of manifest.results) {
    const actual = createHash("sha256").update(await readFile(path.join(here, phase, result.file))).digest("hex");
    if (actual !== result.sha256) throw new Error(`Capture changed after it was recorded: ${result.file}`);
  }
  await writeFile(manifestPath, JSON.stringify({ ...manifest, sourceCommit, homeEntryObject, manifestReconciled: true }, null, 2));
  console.log(JSON.stringify({ phase, sourceCommit, homeEntryObject, verifiedCaptures: manifest.results.length }, null, 2));
  process.exit(0);
}
const base = "http://127.0.0.1:4339";
const results = [];
const account = { id: 21, openId: "synthetic-home", name: "Test Seeker", email: "seeker@example.test", role: "user", loginMethod: "fixture", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", lastSignedIn: "2026-10-01T00:00:00Z" };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await mkdir(path.join(here, phase), { recursive: true });
  for (const state of ["signed-out", "auth-loading", "access-checking", "access-error"]) {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, reducedMotion: "reduce", serviceWorkers: "block", locale: "en-US" });
      const errors = [];
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        let body = {};
        let status = 200;
        if (url.pathname.startsWith("/api/trpc/")) {
          if (state === "auth-loading") return;
          const names = url.pathname.slice("/api/trpc/".length).split(",");
          const values = names.map(name => ({ result: { data: { json: name === "auth.me" && state !== "signed-out" ? account : null } } }));
          body = url.searchParams.has("batch") ? values : values[0];
        } else if (url.pathname === "/api/company-referrals/access") {
          if (state === "access-checking") return;
          status = 503;
          body = { error: "We could not check access. Try again." };
        } else if (url.pathname === "/api/account/preferences") body = { preferences: { timeZone: "UTC", dateFormat: "dmy" } };
        else if (url.pathname === "/api/account/signup-language") body = { ok: true };
        else if (url.pathname === "/api/dev-auth/session") body = { signedIn: state !== "signed-out", account: state === "signed-out" ? null : account };
        else { status = 404; body = { error: "Not in capture fixture" }; }
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
      await context.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "essential"));
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(base, { waitUntil: "domcontentloaded" });
      const expected = state === "signed-out" ? "Nobody reads the pile." : state === "auth-loading" ? "Opening skipwait.me" : state === "access-checking" ? "Checking your referral access" : "We couldn't check your referral access.";
      await page.getByText(expected, { exact: state === "signed-out" || state === "access-error" }).waitFor({ timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      const file = `${state}-${width}.png`;
      await page.screenshot({ path: path.join(here, phase, file), fullPage: true, animations: "disabled" });
      const geometry = await page.evaluate(() => ({ horizontalOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth, path: location.pathname }));
      if (geometry.horizontalOverflowPx || errors.length) throw new Error(JSON.stringify({ state, width, geometry, errors }));
      const sha256 = createHash("sha256").update(await readFile(path.join(here, phase, file))).digest("hex");
      results.push({ state, width, file, ...geometry, errors, sha256 });
      await context.close();
    }
  }
  await writeFile(path.join(here, `${phase}.json`), JSON.stringify({ synthetic: true, sourceCommit, homeEntryObject, base, results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
