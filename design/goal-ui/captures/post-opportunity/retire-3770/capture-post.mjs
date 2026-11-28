// Captures /post-opportunity from a built dist/public with synthetic API responses only.
// usage: node capture-post.mjs <dist/public dir> <out dir> <port>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");

const [rootArg, out, port = "4173"] = process.argv.slice(2);
const root = path.resolve(rootArg);
fs.mkdirSync(out, { recursive: true });
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(Number(port));

const USER = { id: 12, openId: "synthetic", name: "Sam Referrer", email: "sam@acme.com", role: "user", loginMethod: "otp", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSignedIn: new Date().toISOString() };
const VERIFIED = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "AC" };

async function run(viewport, state) {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const posts = [];
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.route("**/*", async route => {
    const u = new URL(route.request().url());
    if (u.origin !== `http://127.0.0.1:${port}`) return route.fulfill({ status: 204, body: "" });
    if (!u.pathname.startsWith("/api/")) return route.continue();
    if (u.pathname.startsWith("/api/trpc")) {
      const procs = u.pathname.slice("/api/trpc/".length).split(",");
      const body = procs.map(p => ({ result: { data: { json: p === "auth.me" ? (state === "signed-out" ? null : USER) : null } } }));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (u.pathname === "/api/company-referrals/access") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state === "unverified" ? { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null } : VERIFIED) });
    if (u.pathname === "/api/opportunities" && route.request().method() === "POST") { posts.push(route.request().postData()); return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ opportunity: { companyDomain: "acme.com", roleTitle: "Product Designer" } }) }); }
    if (u.pathname === "/api/notifications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notifications: [], unreadCount: 0 }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto(`http://127.0.0.1:${port}/post-opportunity`, { waitUntil: "networkidle" });
  const tag = `${state}-${viewport.width}`;
  const shots = [];
  const shot = async name => { await page.waitForTimeout(400); const p = path.join(out, `${name}-${viewport.width}.png`); await page.screenshot({ path: p, fullPage: false }); shots.push(p); };
  if (state === "verified") {
    await page.getByLabel("Role or job title").waitFor();
    await shot("wizard");
    await page.getByLabel("Role or job title").fill("Product Designer");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText("Add useful details.").waitFor();
    await page.getByRole("button", { name: /Publish privately/ }).click();
    await page.waitForTimeout(300);
    await shot("hiring-now-link-required");
    const blankPosts = posts.length;
    await page.getByLabel("Public job link").fill("careers.acme.com/jobs/design");
    await page.getByLabel("Public job link").blur();
    await page.getByRole("button", { name: /Publish privately/ }).click();
    await page.getByText("Your opportunity is live.").waitFor();
    await shot("hiring-now-published");
    console.log(JSON.stringify({ tag, blankPosts, posts, errors, overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) }));
  } else {
    await page.getByText("Verify your work email first.").waitFor();
    await shot(`gate-${state}`);
    console.log(JSON.stringify({ tag, href: await page.getByRole("link", { name: "Verify work email" }).getAttribute("href"), errors }));
  }
  await browser.close();
}
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    for (const state of ["verified", "unverified", "signed-out"]) await run(viewport, state);
  }
} finally { server.close(); }
