// Run from the repository root after `pnpm build`.
// Synthetic, local-only rendering of the actual MyRequests and GoalAppShell.
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = process.cwd();
const output = dirname(fileURLToPath(import.meta.url));
const cssName = readdirSync(join(root, "dist/public/assets")).find(name => /^index-.*\.css$/.test(name));
if (!cssName) throw new Error("Run pnpm build first: production CSS is required");
const css = readFileSync(join(root, "dist/public/assets", cssName));
const flagSource = readFileSync(join(root, "shared/askReconfirm.ts"), "utf8");
if (!flagSource.includes("export const ASK_RECONFIRM_ENABLED = false;")) throw new Error("The production switch must remain off");
const auth = `export const useAuth=()=>({isLoaded:true,isSignedIn:true,userId:'synthetic-capture',getToken:async()=>null,openSignIn:()=>{}});
export const useUser=()=>({user:{fullName:'Example Person',primaryEmailAddress:{emailAddress:'person@example.com'},emailAddresses:[]}});
export const SignInButton=({children})=>children;`;
const mine = awaiting => ({ hasEverAsked: true, requests: [{ id: 501, title: "Platform Engineer", companyDomain: "example.com", companyName: "Example", companyInitials: "EX", status: "pending", referrerId: null, waitingForCoverage: true, queueStatus: "waiting_for_coverage", awaitingReconfirm: awaiting, createdAt: "2026-10-21T12:00:00.000Z", updatedAt: "2026-10-21T12:00:00.000Z", attachmentCount: 1, unreadMessageCount: 0 }], slots: { plan: "free", planLabel: "Free", open: 0, cap: 3, full: false, nextPlan: null } });
const app = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import MyRequests from './client/src/pages/MyRequests';
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MyRequests/></QueryClientProvider>);`, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": JSON.stringify({ PROD: true, DEV: false }) },
  plugins: [{ name: "synthetic-only", setup(bundle) {
    bundle.onResolve({ filter: /^@\/_core\/auth$/ }, () => ({ path: "auth", namespace: "fixture" }));
    bundle.onLoad({ filter: /^auth$/, namespace: "fixture" }, () => ({ contents: auth, loader: "jsx", resolveDir: root }));
    bundle.onResolve({ filter: /^@shared\/askReconfirm$/ }, () => ({ path: "flag", namespace: "fixture" }));
    bundle.onLoad({ filter: /^flag$/, namespace: "fixture" }, () => ({ contents: `export * from ${JSON.stringify(join(root, "shared/askReconfirm.ts"))};export const ASK_RECONFIRM_ENABLED=true;`, resolveDir: root }));
    bundle.onResolve({ filter: /^(@\/|@shared\/)/ }, args => {
      const path = args.path.startsWith("@/") ? join(root, "client/src", args.path.slice(2)) : join(root, "shared", args.path.slice(8));
      const file = [path, `${path}.ts`, `${path}.tsx`, join(path, "index.ts"), join(path, "index.tsx")].find(candidate => existsSync(candidate) && extname(candidate));
      if (!file) throw new Error(`Unresolved local import: ${args.path}`);
      return { path: file };
    });
  } }],
});
let nativeAwaiting = true;
let nativeAttempt = 0;
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/review") {
    const width = url.searchParams.get("width") === "390" ? 390 : 1280;
    nativeAwaiting = true; nativeAttempt = 0;
    res.setHeader("Content-Type", "text/html");
    res.end(`<body style="margin:0"><iframe title="My Requests at ${width}" style="border:0;width:${width}px;height:900px" src="/requests"></iframe></body>`);
  }
  else if (url.pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    let body;
    if (url.pathname.endsWith("/reconfirm")) {
      nativeAttempt += 1;
      if (nativeAttempt === 1) { res.statusCode = 503; body = { error: "Synthetic recovery fixture" }; }
      else { nativeAwaiting = false; body = { requestId: 501, confirmed: true }; }
    } else if (url.pathname.endsWith("/mine")) body = mine(nativeAwaiting);
    else if (url.pathname.endsWith("/access")) body = { verifiedCompanyAccess: false, workEmailDomain: null };
    else if (url.pathname.endsWith("/summary")) body = { summary: { totalAvailable: 2 } };
    else body = { notifications: [], preferences: {} };
    res.end(JSON.stringify(body));
  }
  else if (req.url === "/app.js") { res.setHeader("Content-Type", "text/javascript"); res.end(app.outputFiles[0].contents); }
  else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
  else if (req.url?.startsWith("/assets/")) {
    const file = resolve(root, "dist/public", `.${req.url}`);
    if (!file.startsWith(join(root, "dist/public/assets/")) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", extname(file) === ".woff2" ? "font/woff2" : "font/woff"); res.end(readFileSync(file));
  }
  else if (req.url?.startsWith("/fonts/")) {
    const file = resolve(root, "client/public", `.${req.url}`);
    if (!file.startsWith(join(root, "client/public/fonts/")) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", "font/woff2"); res.end(readFileSync(file));
  } else {
    if (url.pathname === "/requests") { nativeAwaiting = true; nativeAttempt = 0; }
    res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/app.js"></script>');
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Capture server address unavailable");
if (process.argv.includes("--serve")) {
  console.log(JSON.stringify({ url: `http://127.0.0.1:${address.port}` }));
  await new Promise(() => {});
}
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let awaiting = true;
    let attempts = 0;
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const json = value => route.fulfill({ json: value });
      if (path.endsWith("/reconfirm")) {
        attempts += 1;
        if (attempts === 1) return route.fulfill({ status: 503, json: { error: "Synthetic recovery fixture" } });
        awaiting = false;
        return json({ requestId: 501, confirmed: true });
      }
      if (path.endsWith("/mine")) return json(mine(awaiting));
      if (path.endsWith("/access")) return json({ verifiedCompanyAccess: false, workEmailDomain: null });
      if (path.endsWith("/summary")) return json({ summary: { totalAvailable: 2 } });
      return json({ notifications: [], preferences: {} });
    });
    await page.goto(`http://127.0.0.1:${address.port}/requests`);
    await page.getByRole("button", { name: "Confirm", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Horizontal overflow at ${width}`);
    const files = [];
    for (const state of ["awaiting", "error"]) {
      if (state === "error") { await page.getByRole("button", { name: "Confirm", exact: true }).click(); await page.getByRole("alert").waitFor(); }
      const name = `${state}-${width}.png`;
      await page.screenshot({ path: join(output, name), fullPage: true });
      files.push({ name, sha256: createHash("sha256").update(readFileSync(join(output, name))).digest("hex") });
    }
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).waitFor({ state: "hidden" });
    if (errors.length || attempts !== 2) throw new Error(JSON.stringify({ errors, attempts }));
    results.push({ width, overflow, attempts, pageErrors: errors, files });
    await page.close();
  }
  writeFileSync(join(output, "captures.json"), JSON.stringify({ synthetic: true, productionFlag: false, results }, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2));
} finally { await browser?.close(); server.close(); }
