// Run from the repository root: pnpm exec tsx <this file> before|after.
// Serves the actual production build locally. No external API or mutation is sent.
import { chromium } from "playwright";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GOAL_SURFACES } from "../../../../../client/src/lib/goalSurfaces.ts";

const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const root = process.cwd(), here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(root, process.argv[3] ?? "dist/public");
const routes = [...GOAL_SURFACES.policy];
if (!routes.length || new Set(routes).size !== routes.length || routes.some(route => !route.startsWith("/"))) throw new Error("Invalid policy route catalog");
const sha = value => createHash("sha256").update(value).digest("hex");
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const entryFiles = ["client/src/components/PolicyPageShell.tsx", "client/src/pages/GuidePage.tsx"];
const immutableFiles = [
  "client/src/pages/Terms.tsx", "client/src/pages/TrustPrivacy.tsx", "client/src/pages/RefundPolicy.tsx",
  "client/src/pages/CancellationPolicy.tsx", "client/src/pages/ShippingPolicy.tsx", "client/src/pages/Guidelines.tsx",
  "client/src/pages/About.tsx", "client/src/pages/Contact.tsx", "client/src/pages/Support.tsx",
  "client/src/content/guides.ts", "client/src/lib/business.ts", "shared/publicRoutes.ts", "shared/moneyCopy.ts",
  "client/src/pages/goal/policy/GoalPolicyPage.tsx", "client/src/pages/goal/policy/GoalGuidePage.tsx",
];
const hashes = async files => Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))])));
const receipt = { localPublicBuild: true, phase, sourceHead: git(["rev-parse", "HEAD"]), routes, entryHashes: await hashes(entryFiles), immutableHashes: await hashes(immutableFiles), results: [] };
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const relative = path.resolve(publicDir, `.${pathname}`);
  if (!relative.startsWith(publicDir + path.sep)) { response.writeHead(404).end(); return; }
  const candidates = path.extname(pathname) ? [relative] : [relative + ".html", path.join(publicDir, "index.html")];
  for (const file of candidates) {
    try { const body = await readFile(file); response.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" }).end(body); return; }
    catch { /* Try the actual app entry when this route has no prerendered file. */ }
  }
  response.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("No local capture address");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const LOCAL_AUTH_DIAGNOSTIC = "[auth] VITE_WORKOS_CLIENT_ID is not set; falling back to server-session-only auth";
try {
  await mkdir(path.join(here, phase), { recursive: true });
  for (const route of routes) for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, serviceWorkers: "block", reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC" });
    const apiCalls = [], externalRequests = [], preventedWrites = [], pageErrors = [], consoleErrors = [];
    await context.route("**/*", async intercepted => {
      const request = intercepted.request(), url = new URL(request.url());
      if (!["GET", "HEAD"].includes(request.method())) {
        preventedWrites.push({ method: request.method(), path: url.pathname });
        return intercepted.fulfill({ status: 204, body: "" });
      }
      if (url.origin !== origin) { externalRequests.push({ host: url.hostname, path: url.pathname }); return intercepted.abort(); }
      if (!url.pathname.startsWith("/api/")) return intercepted.continue();
      apiCalls.push(url.pathname);
      if (url.pathname.startsWith("/api/trpc/")) {
        const names = url.pathname.slice(10).split(",");
        if (names.every(name => name === "auth.me")) {
          const values = names.map(() => ({ result: { data: { json: null } } }));
          return intercepted.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.has("batch") ? values : values[0]) });
        }
      }
      return intercepted.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Outside public capture fixture" }) });
    });
    await context.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "essential"));
    const page = await context.newPage();
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    const response = await page.goto(origin + route, { waitUntil: "domcontentloaded" });
    await page.getByTestId("goal-policy").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => {
      const normalized = text => (text ?? "").replace(/\s+/g, " ").trim();
      return {
        heading: document.querySelector("h1")?.textContent,
        h1Count: document.querySelectorAll("h1").length,
        goalCount: document.querySelectorAll('[data-testid="goal-policy"]').length,
        text: normalized(document.body.innerText),
        links: Array.from(document.querySelectorAll("a")).map(a => ({ href: a.getAttribute("href"), text: normalized(a.textContent) })),
        missingAnchors: Array.from(document.querySelectorAll('nav[aria-label="On this page"] a[href^="#"]')).map(a => a.getAttribute("href")).filter(href => !href || !document.getElementById(href.slice(1))),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        buildSha: document.querySelector('meta[name="git-commit"]')?.getAttribute("content"),
      };
    });
    const file = `${route.slice(1)}-${width}.png`;
    await page.screenshot({ path: path.join(here, phase, file), fullPage: true, animations: "disabled" });
    const unexpectedConsoleErrors = consoleErrors.filter(message => message !== LOCAL_AUTH_DIAGNOSTIC);
    const sourceMatchesBuild = typeof state.buildSha === "string" && /^[0-9a-f]{7,40}$/i.test(state.buildSha) && receipt.sourceHead.startsWith(state.buildSha);
    const result = { route, width, file, status: response?.status(), ...state, sourceMatchesBuild, textHash: sha(state.text), imageHash: sha(await readFile(path.join(here, phase, file))), apiCalls, externalRequests, preventedWrites, pageErrors, consoleErrors, unexpectedConsoleErrors };
    receipt.results.push(result);
    console.log(JSON.stringify({ phase, route, width, status: result.status, overflow: state.overflow, apiCalls, pageErrors, consoleErrors, unexpectedConsoleErrors }));
    if (result.status !== 200 || !sourceMatchesBuild || state.h1Count !== 1 || state.goalCount !== 1 || state.overflow || state.missingAnchors.length || pageErrors.length || unexpectedConsoleErrors.length || apiCalls.some(call => !call.startsWith("/api/trpc/auth.me"))) throw new Error(`Capture failed: ${route} ${width}`);
    await context.close();
  }
  if (phase === "after") {
    const before = JSON.parse(await readFile(path.join(here, "before.json"), "utf8"));
    if (JSON.stringify(before.routes) !== JSON.stringify(routes) || JSON.stringify(before.immutableHashes) !== JSON.stringify(receipt.immutableHashes)) throw new Error("Route catalog, legal data or goal implementation changed");
    if (before.results.length !== routes.length * 2 || before.results.some(item => typeof item.buildSha !== "string" || !before.sourceHead.startsWith(item.buildSha))) throw new Error("Baseline build provenance is incomplete");
    const comparisons = [];
    for (const result of receipt.results) {
      const prior = before.results.find(item => item.route === result.route && item.width === result.width);
      if (!prior || prior.textHash !== result.textHash || JSON.stringify(prior.links) !== JSON.stringify(result.links)) throw new Error(`Text or link parity failed: ${result.file}`);
      if (JSON.stringify(prior.apiCalls) !== JSON.stringify(result.apiCalls) || JSON.stringify(prior.preventedWrites) !== JSON.stringify(result.preventedWrites)) throw new Error(`Network parity failed: ${result.file}`);
      const [a, b] = await Promise.all(["before", "after"].map(folder => sharp(path.join(here, folder, result.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error(`Capture dimensions changed: ${result.file}`);
      let differentPixels = 0;
      for (let index = 0; index < a.data.length; index += 4) if (!a.data.subarray(index, index + 4).equals(b.data.subarray(index, index + 4))) differentPixels++;
      comparisons.push({ route: result.route, width: result.width, file: result.file, differentPixels, sameText: true, sameLinks: true, sameApiCalls: true, samePreventedWrites: true, beforeHash: prior.imageHash, afterHash: result.imageHash });
    }
    await writeFile(path.join(here, "comparison.json"), JSON.stringify({ beforeHead: before.sourceHead, afterHead: receipt.sourceHead, comparisons }, null, 2) + "\n");
    console.log(JSON.stringify({ pairs: comparisons.length, identical: comparisons.filter(item => item.differentPixels === 0).length, differentPixels: comparisons.reduce((sum, item) => sum + item.differentPixels, 0) }));
  }
} finally {
  await writeFile(path.join(here, `${phase}.json`), JSON.stringify(receipt, null, 2) + "\n");
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
