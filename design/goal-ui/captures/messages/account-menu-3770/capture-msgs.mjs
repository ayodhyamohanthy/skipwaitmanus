// Captures /messages (signed in, menu open; signed out) from a built dist/public with synthetic API answers only.
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const require = createRequire(path.join(process.cwd(), "package.json")); const { chromium } = require("playwright");
const [rootArg, out, port = "4180"] = process.argv.slice(2); const root = path.resolve(rootArg); fs.mkdirSync(out, { recursive: true });
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((req, res) => { const u = new URL(req.url, "http://x"); let f = path.join(root, decodeURIComponent(u.pathname)); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html"); res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); }).listen(Number(port));
const USER = { id: 12, openId: "synthetic", name: "Sam Seeker", email: "sam@example.org", role: "user", loginMethod: "password" };
const results = [];
async function shot(viewport, signedIn) {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const p = await (await b.newContext({ viewport, deviceScaleFactor: 1 })).newPage();
  const errors = []; p.on("pageerror", e => errors.push(String(e).slice(0, 160)));
  await p.route("**/*", async route => {
    const u = new URL(route.request().url());
    if (u.origin !== `http://127.0.0.1:${port}`) return route.fulfill({ status: 204, body: "" });
    if (!u.pathname.startsWith("/api/")) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname.startsWith("/api/trpc")) return json(u.pathname.slice(10).split(",").map(n => ({ result: { data: { json: n === "auth.me" && signedIn ? USER : null } } })));
    if (u.pathname === "/api/notifications") return json({ notifications: [], unreadCount: 0 });
    if (u.pathname.startsWith("/api/dms")) return json({ threads: [], messages: [] });
    return json({});
  });
  await p.goto(`http://127.0.0.1:${port}/messages`, { waitUntil: "networkidle" }); await p.waitForTimeout(600);
  const tag = `${signedIn ? "signed-in" : "signed-out"}-${viewport.width}`;
  await p.screenshot({ path: `${out}/messages-${tag}.png` });
  let menu = null, signOut = 0;
  const btn = p.getByRole("button", { name: "Account menu" });
  const buttons = await btn.count();
  if (signedIn && buttons) {
    await btn.first().click(); await p.waitForTimeout(300);
    signOut = await p.getByRole("menuitem", { name: /Sign out/ }).count() + await p.getByRole("button", { name: /Sign out/ }).count();
    await p.screenshot({ path: `${out}/messages-${tag}-menu.png` }); menu = true;
    await p.keyboard.press("Escape");
  }
  results.push({ tag, accountMenuButtons: buttons, signOutOffered: signOut > 0, mains: await p.locator("main").count(), errors, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
  await b.close();
}
try { for (const v of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) { await shot(v, true); await shot(v, false); } } finally { server.close(); }
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results));
