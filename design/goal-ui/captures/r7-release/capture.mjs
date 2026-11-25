#!/usr/bin/env node
// D-048-R7-prep evidence driver (packet docs/plans/D-048-R7-prep.md): synthetic local captures for the existing R7
// public surfaces (policy, system, links). Serves the built dist/public with SPA fallback, answers every /api call
// at the network layer, and writes <route>-<width>.png plus manifest-all.json beside this file. Nothing reaches a
// backend, no real link token or private data is used. It flips no flag: run it after
// `VITE_GOAL_SURFACES=policy,system,links pnpm build`.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(path.join(here, "..", "..", "..", "..", "dist", "public"));

const ROUTES = [
  { slug: "privacy", route: "/privacy", note: "policy: longest legal reading column" },
  { slug: "terms", route: "/terms", note: "policy: acceptance clause" },
  { slug: "guidelines", route: "/guidelines", note: "policy: guide layout" },
  { slug: "offline", route: "/offline", note: "system: offline state" },
  { slug: "app-states", route: "/app-states", note: "system: app states gallery" },
  { slug: "emails", route: "/emails", note: "system: template gallery (first template selected)" },
  { slug: "not-found", route: "/definitely-not-a-skipwait-route", note: "system: 404" },
  { slug: "fast-invalid", route: "/fast/not-a-real-token", note: "links: invalid fast-track token" },
  { slug: "refer-invalid", route: "/refer/synthetic-corp/not-a-real-alias", note: "links: invalid vanity refer link" },
  { slug: "share-card-missing", route: "/share-card/not-a-real-token", note: "links: missing share card" },
];

const WIDTHS = [1280, 390];

// Interactive states the packet names explicitly ("Emails template interactions", "app states"): each button in the
// page's own control group is selected and captured, so a gallery screenshot never stands in for its panels.
const VARIANTS = [
  { route: "/emails", group: '[aria-label="Templates"] button, main button[type="button"]', prefix: "emails" },
  { route: "/app-states", group: '[aria-label="Screen"] button', prefix: "app-state" },
];


const api = (url) => {
  if (url.includes("/api/health")) return { ok: true, state: "ready", service: "skipwait-api" };
  if (url.includes("/api/companies")) return { companies: [], openCount: 0 };
  return { ok: false, error: "synthetic fixture" };
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(api(url.pathname)));
    return;
  }
  const candidate = path.join(dist, url.pathname);
  try {
    const body = await readFile(candidate);
    res.writeHead(200, { "content-type": candidate.endsWith(".js") ? "text/javascript" : candidate.endsWith(".css") ? "text/css" : candidate.endsWith(".svg") ? "image/svg+xml" : "text/html" });
    res.end(body);
    return;
  } catch {
    try {
      const html = await readFile(path.join(dist, "index.html"));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    } catch {
      res.writeHead(404).end("not found");
    }
  }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
if (dirty) console.warn("warning: working tree is not clean; record the source commit with care");

const browser = await chromium.launch();
const results = [];
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error).slice(0, 200)));
  for (const entry of ROUTES) {
    await page.goto(`http://127.0.0.1:${port}${entry.route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({
      goalPage: document.querySelector("[data-goal-page]")?.getAttribute("data-goal-page") ?? null,
      kitScreen: document.querySelector("[data-skipwait-screen]")?.getAttribute("data-skipwait-screen") ?? null,
      h1: document.querySelector("h1")?.textContent?.trim().slice(0, 80) ?? null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    const file = `${entry.slug}-${width}.png`;
    await page.screenshot({ path: path.join(here, file), fullPage: true });
    results.push({ file, route: entry.route, note: entry.note, viewport: width, ...info, errors: errors.splice(0) });
    console.log(`${file.padEnd(28)} goal=${info.goalPage ?? "-"} kit=${info.kitScreen ?? "-"} overflow=${info.overflow} h1="${info.h1 ?? "-"}"`);
  }
  await page.close();
}
// Sequence variants: a panel's own sub-dialog reached by clicking inside it (the last unverified state my earlier
// entry listed), so a gallery screenshot never stands in for the dismissed prompt.
const SEQUENCES = [
  { route: "/app-states", clicks: ["Install (Android)", "Not now"], prefix: "app-state-install-android-dismissed" },
  { route: "/app-states", clicks: ["Install (iPhone)", "Got it"], prefix: "app-state-install-iphone-dismissed" },
];

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  for (const sequence of SEQUENCES) {
    await page.goto(`http://127.0.0.1:${port}${sequence.route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(900);
    let ok = true;
    for (const label of sequence.clicks) {
      try { await page.getByRole("button", { name: label, exact: true }).first().click({ timeout: 4000 }); } catch { ok = false; break; }
      await page.waitForTimeout(400);
    }
    if (!ok) { console.warn(`sequence skipped: ${sequence.prefix}-${width} (${sequence.clicks.join(" > ")})`); continue; }
    const file = `${sequence.prefix}-${width}.png`;
    await page.screenshot({ path: path.join(here, file), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    results.push({ file, route: sequence.route, note: `sequence: ${sequence.clicks.join(" > ")}`, viewport: width, goalPage: null, kitScreen: null, h1: sequence.clicks.at(-1), overflow, errors: [] });
    console.log(`${file.padEnd(44)} sequence="${sequence.clicks.join(" > ")}" overflow=${overflow}`);
  }
  await page.close();
}

// Interactive variants: select every control in the page's own group, capture that state, then reload.
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  for (const variant of VARIANTS) {
    await page.goto(`http://127.0.0.1:${port}${variant.route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1000);
    const labels = await page.$$eval(variant.group, nodes => nodes.map(node => (node.textContent ?? "").trim()).filter(Boolean));
    const unique = Array.from(new Set(labels)).slice(0, 14);
    for (const label of unique) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      const target = page.locator(variant.group, { hasText: label }).first();
      try { await target.click({ timeout: 4000 }); } catch { continue; }
      await page.waitForTimeout(400);
      const slug = `${variant.prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 60);
      const file = `${slug}-${width}.png`;
      await page.screenshot({ path: path.join(here, file), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ file, route: variant.route, note: `variant: ${label}`, viewport: width, goalPage: null, kitScreen: null, h1: label, overflow, errors: [] });
      console.log(`${file.padEnd(40)} variant="${label}" overflow=${overflow}`);
    }
  }
  await page.close();
}

await browser.close();
server.close();

await mkdir(here, { recursive: true });
await writeFile(
  path.join(here, "manifest-all.json"),
  JSON.stringify({
    source,
    surfaces: "policy,system,links",
    command: "VITE_GOAL_SURFACES=policy,system,links pnpm build && node design/goal-ui/captures/r7-release/capture.mjs",
    synthetic: true,
    covered: results.length,
    unverified: [
      "link sign-in return (needs an authenticated session; this driver must not fake one)",
      "share-card privacy state behind an authenticated session",
    ],
    results,
  }, null, 2) + "\n",
);
console.log(`manifest: ${results.length} captures from ${source.slice(0, 8)}`);
