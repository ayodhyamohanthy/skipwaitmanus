// Replay the existing release fixtures locally; every API response is synthetic.
// Run from the repo root: node client/src/pages/goal/admin-approvals/retirement/capture.mjs before|after
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import sharp from "sharp";

const root = process.cwd();
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const out = path.join(root, "client/src/pages/goal/admin-approvals/retirement");
const fixtureDir = path.join(root, "design/goal-ui/captures/admin-approvals/fixtures");
const entries = ["AdminApprovalQueue.tsx", "AdminApprovalRecord.tsx"].map(name => `client/src/pages/${name}`);
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const baseline = git(["rev-parse", "93ec61e6"]);
const sources = new Map(await Promise.all(entries.map(async file => [path.join(root, file), phase === "before" ? git(["show", `${baseline}:${file}`]) : await readFile(path.join(root, file), "utf8")])));
const main = `import React from 'react'; import {createRoot} from 'react-dom/client';
import Queue from '@/pages/AdminApprovalQueue'; import Record from '@/pages/AdminApprovalRecord'; import '@/index.css';
createRoot(document.getElementById('root')).render(location.pathname==='/admin/approvals'?<Queue/>:<Record/>);`;
const auth = `import React from 'react';
const signedIn=()=>Boolean(window.__approvalCaptureSignedIn);
export const useAuth=()=>({isLoaded:true,isSignedIn:signedIn(),getToken:async()=>null,openSignIn:()=>{}});
export const useUser=()=>({isLoaded:true,isSignedIn:signedIn(),user:null});
export const AuthProvider=({children})=>children;
export const SignInButton=({children})=><button>{children}</button>;
export const SignedIn=({children})=>signedIn()?children:null;
export const SignedOut=({children})=>signedIn()?null:children;`;
const server = await createServer({
  configFile: path.join(root, "vite.config.ts"), mode: "retirement-capture", logLevel: "error",
  plugins: [{ name: "approvals-retirement-capture", enforce: "pre", transform(code, id) {
    const file = id.split("?")[0];
    if (sources.has(file)) return { code: sources.get(file), map: null };
    if (file === path.join(root, "client/src/main.tsx")) return { code: main, map: null };
    if (file === path.join(root, "client/src/_core/auth.tsx")) return { code: auth, map: null };
  } }],
  server: { host: "127.0.0.1", port: 4389, strictPort: true, hmr: false },
});
let browser;
const results = [];
let completed = false;
const hash = value => createHash("sha256").update(value).digest("hex");
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  await mkdir(path.join(out, phase), { recursive: true });
  const names = (await readdir(fixtureDir)).filter(name => name.endsWith(".json")).sort();
  for (const name of names) for (const width of [1280, 390]) {
    const fixture = JSON.parse(await readFile(path.join(fixtureDir, name), "utf8"));
    const state = name.replace(/^admin-approvals__/, "").replace(/\.json$/, "");
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [], consoleErrors = [], calls = [], unmatched = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await context.addInitScript(signedIn => {
      window.__approvalCaptureSignedIn = signedIn;
      localStorage.setItem("skipwait:cookie-consent", "essential");
      const NativeDate = Date;
      globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : ["2026-11-19T12:00:00.000Z"])); }
        static now() { return new NativeDate("2026-11-19T12:00:00.000Z").getTime(); }
      };
    }, Boolean(fixture.signedIn));
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:4389") return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/csp-report") return route.fulfill({ status: 204, body: "" });
      calls.push(`${request.method()} ${url.pathname}${url.search}${request.postData() ? ` ${request.postData()}` : ""}`);
      const hit = (fixture.routes || []).find(item => item.method === request.method() && (item.match === "prefix" ? url.pathname.startsWith(item.path) : url.pathname === item.path));
      if (!hit) unmatched.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: hit?.status || 404, json: hit?.body || { error: "not mocked" } });
    });
    try {
      await page.goto(`http://127.0.0.1:4389${fixture.route}`, { waitUntil: "networkidle" });
      await page.locator("[data-goal-page]").waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const click of fixture.clicks || []) {
        await page.getByRole(click.role, { name: click.name, exact: Boolean(click.exact) }).click();
        await page.waitForLoadState("networkidle");
        await page.getByRole("alert").waitFor();
      }
      const file = `${state}-${width}.png`;
      const png = await page.screenshot({ path: path.join(out, phase, file), fullPage: Boolean(fixture.fullPage), animations: "disabled" });
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
      results.push({ state, width, route: fixture.route, file, pngSha256: hash(png), calls, errors, consoleErrors, unmatched, overflow });
      if (errors.length || unmatched.length || overflow) throw new Error(`Capture failed: ${state}/${width}`);
    } finally { await context.close(); }
  }
  completed = true;
} finally {
  if (browser) await browser.close();
  await server.close();
  const sourceHashes = Object.fromEntries([...sources].map(([file, source]) => [path.relative(root, file), hash(source)]));
  for (const file of ["GoalAdminApprovalQueue.tsx", "GoalAdminApprovalRecord.tsx", "approvalsData.ts"]) {
    const relative = `client/src/pages/goal/admin-approvals/${file}`;
    sourceHashes[relative] = hash(await readFile(path.join(root, relative)));
  }
  await writeFile(path.join(out, `${phase}.json`), `${JSON.stringify({ completed, phase, baseline, head: git(["rev-parse", "HEAD"]), synthetic: true, productionRequests: 0, sourceHashes, results }, null, 2)}\n`);
}
if (phase === "after") {
  const before = JSON.parse(await readFile(path.join(out, "before.json"), "utf8"));
  const comparison = [];
  for (const result of results) {
    const prior = before.results.find(item => item.state === result.state && item.width === result.width);
    if (!prior) throw new Error(`No baseline for ${result.file}`);
    const a = await sharp(path.join(out, "before", result.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(path.join(out, "after", result.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error(`Image size differs: ${result.file}`);
    let differingPixels = 0;
    for (let i = 0; i < a.data.length; i += 4) if ([0, 1, 2, 3].some(channel => a.data[i + channel] !== b.data[i + channel])) differingPixels += 1;
    comparison.push({ file: result.file, differingPixels, sameCalls: JSON.stringify([...prior.calls].sort()) === JSON.stringify([...result.calls].sort()) });
  }
  await writeFile(path.join(out, "comparison.json"), `${JSON.stringify({ pairs: comparison.length, comparison }, null, 2)}\n`);
  console.log(JSON.stringify({ pairs: comparison.length, pixelIdentical: comparison.filter(item => item.differingPixels === 0).length, apiEquivalent: comparison.every(item => item.sameCalls) }));
} else console.log(JSON.stringify({ phase, captures: results.length, completed }));
