// Synthetic local parity proof; no production data, credentials or mutations.
// From the repository root: node client/src/pages/goal/settings/retirement/capture.mjs before|after
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import sharp from "sharp";

const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const root = process.cwd();
const out = process.env.SETTINGS_CAPTURE_DIR || "/tmp/skipwait-settings-retirement";
const baseline = "d0e3bb899e5f05065bd630301964fa8999813b68";
const entry = "client/src/pages/Settings.tsx";
const source = phase === "before"
  ? execFileSync("git", ["show", `${baseline}:${entry}`], { cwd: root, encoding: "utf8" })
  : await readFile(path.join(root, entry), "utf8");
const hash = value => createHash("sha256").update(value).digest("hex");
const legacyFiles = ["AppPanel", "NotificationPanels", "NewAskEmailRow", "SlackReviewAlerts"];
const legacySources = new Map(phase === "before" ? legacyFiles.map(name => {
  const file = `client/src/components/settings/${name}.tsx`;
  return [path.join(root, file), execFileSync("git", ["show", `${baseline}:${file}`], { cwd: root, encoding: "utf8" })];
}) : []);
const base = "http://127.0.0.1:4379";
const states = ["region", "notifications", "app", "privacy", "account", "guest-privacy", "guest-account", "access-error", "offline", "active-consent"];
const main = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {httpBatchLink} from '@trpc/client'; import superjson from 'superjson';
import {trpc} from '@/lib/trpc'; import {AppShell} from '@/components/AppShell';
import Settings from '@/pages/Settings'; import '@/index.css';
const q=new QueryClient({defaultOptions:{queries:{retry:false}}});
const client=trpc.createClient({links:[httpBatchLink({url:'/api/trpc',transformer:superjson})]});
createRoot(document.getElementById('root')).render(
<QueryClientProvider client={q}><trpc.Provider client={client} queryClient={q}><AppShell><Settings/></AppShell></trpc.Provider></QueryClientProvider>);`;
const auth = `
import React from 'react';
const signedIn=!window.__settingsCapture.startsWith('guest');
const auth={isLoaded:true,isSignedIn:signedIn,userId:signedIn?'42':null,getToken:async()=>null,signOut:async()=>{},openSignIn:()=>{}};
export const useAuth=()=>auth;
export const useUser=()=>({isLoaded:true,isSignedIn:signedIn,user:signedIn?{id:'42',fullName:'Synthetic Referrer',imageUrl:null,primaryEmailAddress:{emailAddress:'synthetic@example.invalid'},emailAddresses:[]}:null});
export const AuthProvider=({children})=>children;
export const SignInButton=({children})=><button>{children}</button>;
export const SignedIn=({children})=>signedIn?children:null;
export const SignedOut=({children})=>signedIn?null:children;`;
const server = await createServer({
  configFile: path.join(root, "vite.config.ts"), mode: "retirement-capture", logLevel: "error",
  plugins: [{ name: "settings-retirement-fixture", enforce: "pre",
  resolveId(id, importer) {
    const resolved = id.startsWith("@/") ? path.join(root, "client/src", id.slice(2))
      : path.isAbsolute(id) ? id : importer && id.startsWith(".") ? path.resolve(path.dirname(importer), id) : "";
    const file = resolved.endsWith(".tsx") ? resolved : `${resolved}.tsx`;
    return legacySources.has(file) ? file : undefined;
  },
  load(id) { return legacySources.get(id); },
  transform(code, id) {
    const file = id.split("?")[0];
    if (file === path.join(root, entry)) return { code: source, map: null };
    if (file === path.join(root, "client/src/main.tsx")) return { code: main, map: null };
    if (file === path.join(root, "client/src/_core/auth.tsx")) return { code: auth, map: null };
  } }],
  server: { host: "127.0.0.1", port: 4379, strictPort: true, hmr: false },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  await mkdir(path.join(out, phase), { recursive: true });
  for (const state of states) for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.addInitScript(state => {
      window.__settingsCapture = state;
      const NativeDate = Date;
      globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : ["2026-11-19T00:00:00.000Z"])); }
        static now() { return new NativeDate("2026-11-19T00:00:00.000Z").getTime(); }
      };
      Object.defineProperty(navigator, "onLine", { configurable: true, value: state !== "offline" });
      localStorage.setItem("skipwait:cookie-consent", "essential");
    }, state);
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      let status = 200;
      let body = {};
      if (url.pathname.startsWith("/api/trpc/")) {
        const names = url.pathname.slice("/api/trpc/".length).split(",");
        const consent = { active: state === "active-consent", selectedFields: ["headline", "expertise"], policyVersion: "2026-10-01", audience: "Approved employers on skipwait.me", retentionDays: 90, unlockCreditCost: 5, unlockDays: 30 };
        const values = names.map(name => ({ result: { data: { json: name === "talentConsent.state" ? consent : null } } }));
        body = url.searchParams.has("batch") ? values : values[0];
      } else if (url.pathname === "/api/company-referrals/access") {
        if (state === "access-error") { status = 503; body = { error: "Synthetic access outage" }; }
        else body = { verifiedCompanyAccess: true, workEmailDomain: "example.invalid", companyName: "Synthetic Company", companyInitials: "SC" };
      } else if (url.pathname === "/api/credits/summary") body = { summary: { totalAvailable: 3 } };
      else if (url.pathname === "/api/referrer-preferences") body = { preferences: { notifyNewAsk: true, referralCapacity: 3, paused: false } };
      else if (url.pathname === "/api/referrer/slack-webhook") body = { connected: false, active: false };
      else if (url.pathname === "/api/notifications") body = { notifications: [] };
      else if (url.pathname === "/api/blocks/mine") body = { blocks: [] };
      else if (url.pathname === "/api/privacy/requests") body = { requests: [] };
      else if (url.pathname === "/api/privacy/export-requests/latest") body = { export: null };
      else if (url.pathname === "/api/account/sessions") body = { sessions: [], currentKnown: true };
      else if (url.pathname === "/api/account/preferences") body = { preferences: {} };
      else throw new Error(`Unexpected fixture API: ${url.pathname}`);
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    const section = state === "access-error" ? "account" : state === "offline" || state === "active-consent" ? "privacy" : state.replace("guest-", "");
    await page.goto(`${base}/settings?section=${section}`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.getByRole("heading", { name: "Control your account." }).waitFor();
    if (state.startsWith("guest")) await page.getByRole("link", { name: "Sign in", exact: true }).last().waitFor();
    else if (state === "access-error") await page.getByText("We could not check your work email. Nothing was changed.").waitFor();
    else if (state === "account") await page.getByText("Verified · example.invalid").waitFor();
    else if (state === "notifications") await page.getByRole("switch", { name: "Email when a new referral request arrives" }).waitFor();
    else if (["privacy", "offline", "active-consent"].includes(state)) await page.getByText("You haven't blocked anyone.").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    if (overflow || errors.length) throw new Error(JSON.stringify({ state, width, overflow, errors }));
    const file = `${state}-${width}.png`;
    const bytes = await page.screenshot({ path: path.join(out, phase, file), fullPage: true, animations: "disabled" });
    results.push({ state, width, file, sha256: hash(bytes), overflow, errors });
    await context.close();
  }
  const manifest = { synthetic: true, baseline, entrySha256: hash(source), phase, results };
  await writeFile(path.join(out, `${phase}.json`), JSON.stringify(manifest, null, 2) + "\n");
  if (phase === "after") {
    const comparison = [];
    for (const result of results) {
      const [a, b] = await Promise.all(["before", "after"].map(folder => sharp(path.join(out, folder, result.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error(`Dimensions changed: ${result.file}`);
      let differentPixels = 0;
      for (let i = 0; i < a.data.length; i += 4) if (!a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) differentPixels++;
      comparison.push({ file: result.file, differentPixels });
    }
    await writeFile(path.join(out, "comparison.json"), JSON.stringify({ synthetic: true, results: comparison }, null, 2) + "\n");
    console.log(JSON.stringify({ phase, captures: results.length, differentPixels: comparison.reduce((sum, item) => sum + item.differentPixels, 0), out }));
  } else console.log(JSON.stringify({ phase, captures: results.length, out }));
} finally { await browser.close(); await server.close(); }