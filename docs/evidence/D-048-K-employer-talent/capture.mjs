import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";

// Compare real local production bundles. Every API, auth, telemetry and mutation
// is fulfilled locally; no production account, intro or payment is touched.
const [baselineRoot, candidateRoot, destination = "docs/evidence/D-048-K-employer-talent/verified"] = process.argv.slice(2);
assert.ok(baselineRoot && candidateRoot, "provide baseline and candidate repository roots with completed production builds");
const require = createRequire(resolve(candidateRoot, "package.json"));
const express = require("express");
const { chromium } = require("playwright");
const ts = require("typescript");
const sharp = require("sharp");
const out = resolve(destination);
const hash = value => createHash("sha256").update(value).digest("hex");
const revision = root => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const goalPath = "client/src/pages/goal/employer-talent/GoalEmployerTalent.tsx";
const printer = ts.createPrinter({ removeComments: true });
async function identity(root) {
  const source = await readFile(resolve(root, goalPath), "utf8");
  const syntax = ts.createSourceFile(goalPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return { revision: revision(root), goalSourceSha256: hash(source), goalRuntimeAstSha256: hash(printer.printFile(syntax)) };
}
async function serve(root) {
  const app = express();
  app.use("/api", (_req, res) => res.status(501).json({ error: "Synthetic interception required" }));
  app.use(express.static(resolve(root, "dist/public")));
  app.get("*", (_req, res) => res.sendFile(resolve(root, "dist/public/index.html")));
  const server = await new Promise((done, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => done(listener));
    listener.on("error", reject);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const REF_A = "tal_nfAQM_mhMoW-xVAnLby9eKLM";
const REF_B = "tal_sj50_1A9Gy4ztL3B_o7TbNls";
const REF_C = "tal_Qw3rTy-uI0pAsDfGhJkLzXcV";
const locked = { displayRef: REF_A, headline: "Backend engineer", location: "Pune", skills: ["Go", "Postgres"], isUnlocked: false };
const unlocked = { displayRef: REF_B, headline: "Product designer", location: "Remote", skills: ["Figma"], isUnlocked: true };
const other = { displayRef: REF_C, headline: "Platform engineer", location: "Remote", skills: ["TypeScript"], isUnlocked: false };
const person = { id: 79, name: "Synthetic Employer", email: "employer@synthetic.example", role: "user", openId: "synthetic", loginMethod: "fixture" };
const scenarios = ["default", "profile", "profile-cleared", "intro-sent", "intro-refused", "unlock-pending", "unlock-confirmed", "unlock-error", "unlock-402", "search", "loading", "empty", "load-error", "retry", "denied"];
const beforeIdentity = await identity(baselineRoot);
const afterIdentity = await identity(candidateRoot);
assert.equal(beforeIdentity.goalRuntimeAstSha256, afterIdentity.goalRuntimeAstSha256, "retirement must not alter goal behavior");
await mkdir(out, { recursive: true });
const results = [];
const browser = await chromium.launch();
try {
  for (const [phase, root] of [["before", baselineRoot], ["after", candidateRoot]]) {
    const target = await serve(root);
    await mkdir(join(out, phase), { recursive: true });
    try {
      for (const width of [1280, 390]) for (const scenario of scenarios) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, locale: "en-US", timezoneId: "UTC", colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
        const deferred = [];
        try {
          const errors = [], unexpected = [], calls = [];
          let listReads = 0, externalIntercepted = 0;
          const page = await context.newPage();
          page.on("pageerror", error => errors.push(error.message));
          await context.route("**/*", async route => {
            const request = route.request(), url = new URL(request.url()), method = request.method();
            if (url.origin !== target.origin) { externalIntercepted++; return route.fulfill({ status: 204, body: "" }); }
            if (!url.pathname.startsWith("/api/")) return route.continue();
            calls.push(`${method} ${url.pathname}${url.search}`);
            const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
            const hold = body => new Promise(done => deferred.push(async () => { try { await json(200, body); } finally { done(); } }));
            if (url.pathname.startsWith("/api/trpc/")) {
              const data = url.pathname.slice(10).split(",").map(name => ({ result: { data: { json: name === "auth.me" ? person : null } } }));
              return json(200, url.searchParams.has("batch") ? data : data[0]);
            }
            if (["/api/account/signup-language", "/api/csp-report"].includes(url.pathname)) return route.fulfill({ status: 204, body: "" });
            if (url.pathname === "/api/dev-auth/session") return json(200, { signedIn: true, account: person });
            if (url.pathname === "/api/account/preferences") return json(200, { preferences: { timeZone: "UTC", dateFormat: "mdy", language: "en" } });
            if (url.pathname === "/api/notifications") return json(200, { notifications: [] });
            if (url.pathname === "/api/credits/summary") return json(200, { summary: { totalAvailable: 3 } });
            if (url.pathname === "/api/company-referrals/access") return json(200, { verifiedCompanyAccess: false, workEmailDomain: null });
            if (url.pathname === "/api/employer/account" && method === "GET") return json(200, { account: { credits: 20, budgetMonthlyUsdCents: 5000, approvalStatus: "approved" } });
            if (url.pathname === "/api/employer/spend-history" && method === "GET") return json(200, { spend: [] });
            if (url.pathname === "/api/employer/talent" && method === "GET") {
              listReads++;
              if (scenario === "loading") return hold({ talent: [] });
              if (scenario === "denied") return json(403, { error: "Employer access is required" });
              if (scenario === "load-error" || (scenario === "retry" && listReads === 1)) return json(503, { error: "Synthetic talent service unavailable" });
              if (url.searchParams.has("query")) {
                assert.equal(url.searchParams.get("query"), "Go");
                assert.equal(url.searchParams.get("location"), "Pune");
                return json(200, { talent: [locked] });
              }
              return json(200, { talent: scenario === "empty" ? [] : [{ ...locked, name: "Hidden Synthetic Identity", email: "hidden@synthetic.example", resumeUrl: "https://private.synthetic.example/resume.pdf" }, unlocked, other] });
            }
            if (url.pathname === `/api/employer/talent/${REF_A}/unlock` && method === "POST") {
              if (scenario === "unlock-pending") return hold({ unlocked: true, remaining: 15 });
              if (scenario === "unlock-error") return json(500, { error: "Synthetic unlock unavailable" });
              if (scenario === "unlock-402") return json(402, { error: "Top-up required", credits: 2 });
              return json(201, { unlocked: true, remaining: 15 });
            }
            if (url.pathname === `/api/employer/talent/${REF_B}` && method === "GET") return json(200, { profile: { experience: "6-10 years", expertise: ["Design systems", "Figma"], name: "Hidden Synthetic Identity", email: "hidden@synthetic.example", resumeUrl: "https://private.synthetic.example/resume.pdf" } });
            if (url.pathname === `/api/employer/talent/${REF_B}/intro` && method === "POST") return scenario === "intro-refused" ? json(409, { error: "Unlock no longer active" }) : json(201, { requested: true });
            unexpected.push(`${method} ${url.pathname}`);
            return json(501, { error: "Unmatched synthetic request" });
          });
          const response = await page.goto(`${target.origin}/employer/talent`, { waitUntil: "load", timeout: 25_000 });
          assert.equal(response.status(), 200);
          const rootElement = page.locator('[data-goal-page="employer-talent"]');
          await page.getByRole("heading", { level: 1, name: "Meet opt-in talent.", exact: true }).waitFor();
          const card = ref => page.getByRole("listitem", { name: ref, exact: true });
          const unlockButton = card(REF_A).getByRole("button", { name: "Unlock profile · costs 5", exact: true });
          if (scenario === "loading") await page.getByRole("status", { name: "Loading talent", exact: true }).waitFor();
          else if (scenario === "empty") await page.getByText("No opt-in talent matches yet.", { exact: true }).waitFor();
          else if (["load-error", "denied"].includes(scenario)) await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
          else if (scenario === "retry") {
            await page.getByRole("button", { name: "Try again", exact: true }).click();
            await card(REF_A).waitFor();
          } else await card(REF_A).waitFor();
          if (["profile", "profile-cleared"].includes(scenario)) {
            await card(REF_B).getByRole("button", { name: "View profile", exact: true }).click();
            await page.getByRole("group", { name: "Shared profile", exact: true }).waitFor();
          }
          if (["search", "profile-cleared"].includes(scenario)) {
            await page.getByRole("textbox", { name: "Search talent", exact: true }).fill("Go");
            await page.getByRole("textbox", { name: "Filter by location", exact: true }).fill("Pune");
            const searched = page.waitForResponse(response => {
              const url = new URL(response.url());
              return url.pathname === "/api/employer/talent" && url.searchParams.get("query") === "Go";
            });
            await page.getByRole("button", { name: "Search", exact: true }).click();
            await searched;
            await card(REF_A).waitFor();
            await card(REF_B).waitFor({ state: "detached" });
            assert.equal(await page.getByRole("group", { name: "Shared profile", exact: true }).count(), 0);
          }
          if (scenario.startsWith("intro-")) {
            await card(REF_B).getByRole("button", { name: "Send intro request", exact: true }).click();
            if (scenario === "intro-sent") await card(REF_B).getByRole("button", { name: "Intro sent", exact: true }).waitFor();
            else await page.getByText("Intro not sent. This unlock may no longer be active.", { exact: true }).waitFor();
          }
          if (scenario.startsWith("unlock-")) {
            await unlockButton.click();
            if (scenario === "unlock-pending") {
              await card(REF_A).getByRole("button", { name: "Unlocking…", exact: true }).waitFor();
              assert.equal(await card(REF_A).getByText("Locked", { exact: true }).count(), 1);
              assert.equal(await card(REF_A).getByRole("button", { name: /View profile|Send intro/ }).count(), 0);
              assert.equal(await card(REF_C).getByRole("button").getAttribute("aria-disabled"), "true");
            } else if (scenario === "unlock-confirmed") await card(REF_A).getByRole("button", { name: "View profile", exact: true }).waitFor();
            else if (scenario === "unlock-error") {
              await page.getByText("Synthetic unlock unavailable", { exact: true }).waitFor();
              await card(REF_A).getByText("Locked", { exact: true }).waitFor();
            } else {
              await page.waitForURL("**/employer/billing");
              await page.getByRole("heading", { name: "Control what you spend.", exact: true }).waitFor();
            }
          }
          if (scenario !== "unlock-402") {
            assert.equal(await rootElement.count(), 1);
            const text = await rootElement.innerText();
            assert.ok(!text.includes("Hidden Synthetic Identity") && !text.includes("hidden@synthetic.example"));
            assert.equal(await rootElement.locator('a[href="https://private.synthetic.example/resume.pdf"]').count(), 0);
          }
          await page.evaluate(() => document.fonts.ready);
          await page.mouse.move(0, 0);
          const metrics = await page.evaluate(() => ({ text: document.body.innerText, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
          assert.equal(metrics.overflow, 0);
          assert.deepEqual(errors, []);
          assert.deepEqual(unexpected, []);
          const screenshot = `${phase}/${scenario}-${width}.png`;
          const png = await page.screenshot({ path: join(out, screenshot), fullPage: true, animations: "disabled" });
          const raw = await sharp(png).ensureAlpha().raw().toBuffer();
          results.push({ phase, scenario, width, route: new URL(page.url()).pathname, screenshot, pngSha256: hash(png), pixelSha256: hash(raw), ...metrics, calls, externalIntercepted, errors, unexpected });
          await writeFile(join(out, "capture.json"), JSON.stringify({ task: "D-048-K-employer-talent", synthetic: true, productionRequests: 0, beforeIdentity, afterIdentity, results }, null, 2) + "\n");
          console.log(`${phase}: ${scenario} ${width}; no identity leak, overflow or page error`);
        } finally {
          for (const release of deferred) await release();
          await context.close();
        }
      }
    } finally { await new Promise(done => target.server.close(done)); }
  }
  const pairs = results.filter(result => result.phase === "before").map(before => {
    const after = results.find(result => result.phase === "after" && result.scenario === before.scenario && result.width === before.width);
    assert.ok(after);
    assert.equal(after.text, before.text);
    assert.equal(after.route, before.route);
    assert.deepEqual([...after.calls].sort(), [...before.calls].sort());
    assert.equal(after.pixelSha256, before.pixelSha256);
    return { scenario: before.scenario, width: before.width, before: before.screenshot, after: after.screenshot, pixelIdentical: true, pngByteIdentical: before.pngSha256 === after.pngSha256, requestsIdenticalIgnoringOrder: true };
  });
  await writeFile(join(out, "parity.json"), JSON.stringify({ task: "D-048-K-employer-talent", beforeIdentity, afterIdentity, pairs }, null, 2) + "\n");
  console.log(JSON.stringify({ pairs: pairs.length, pixelIdentical: pairs.length }));
} finally { await browser.close(); }
