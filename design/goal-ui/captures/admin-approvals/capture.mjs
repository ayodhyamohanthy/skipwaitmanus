#!/usr/bin/env node
// D-048-p3-admin-approvals captures: every fixture in ./fixtures at 1280x900 @1x
// and 390x844 @2x, viewport-true (no full-page stitching), from the dev server
// with /api mocked at the network layer (no database, no provider keys).
// Adapted from design/goal-ui/tools/capture-live.mjs. Writes manifest.json with
// sha1, CSS width, DPR, time and HEAD per capture, plus the DOM checks a
// reviewer needs (one h1, exactly one black primary inside the next-step block,
// fonts loaded, horizontal overflow).
//
// Usage (dev server on :3000 started with VITE_GOAL_SURFACES=admin-approvals):
//   PLAYWRIGHT_BROWSERS_PATH=... node design/goal-ui/captures/admin-approvals/capture.mjs
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readdir, readFile, writeFile } from "node:fs/promises";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");
const require = createRequire(path.join(repo, "package.json"));
const { chromium } = require("playwright");
const base = process.env.CAPTURE_BASE || "http://localhost:3000";
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const only = process.argv[2];

const fixtures = (await readdir(path.join(here, "fixtures"))).filter(name => name.endsWith(".json") && (!only || name.includes(only))).sort();
const manifest = [];
const browser = await chromium.launch();
try {
  for (const name of fixtures) {
    const fixture = JSON.parse(await readFile(path.join(here, "fixtures", name), "utf8"));
    const state = name.replace(/^admin-approvals__/, "").replace(/\.json$/, "");
    const signedIn = fixture.signedIn ? { openId: "fixture", loginMethod: "fixture", role: "user", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastSignedIn: "2026-11-05T00:00:00.000Z", ...fixture.signedIn } : null;
    for (const [label, width, height, scale] of [["1280", 1280, 900, 1], ["390", 390, 844, 2]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
      const errors = []; const calls = [];
      page.on("pageerror", error => errors.push(String(error)));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith("/api/trpc/")) {
          const procedures = url.pathname.slice("/api/trpc/".length).split(",");
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(procedures.map(proc => ({ result: { data: { json: proc === "auth.me" ? signedIn : (fixture.trpc?.[proc] ?? null) } } }))) });
        }
        const request = route.request();
        if (url.pathname === "/api/csp-report") return route.fulfill({ status: 204, body: "" });
        calls.push(`${request.method()} ${url.pathname}${url.search}${request.postData() ? ` ${request.postData()}` : ""}`);
        const hit = (fixture.routes || []).find(r => r.method === request.method() && (r.match === "prefix" ? url.pathname.startsWith(r.path) : url.pathname === r.path));
        return route.fulfill({ status: hit?.status ?? 404, contentType: "application/json", body: JSON.stringify(hit?.body ?? { error: "not mocked" }) });
      });
      await page.addInitScript(() => localStorage.setItem("skipwait:cookie-consent", "all"));
      await page.goto(`${base}${fixture.route}`, { waitUntil: "networkidle", timeout: 240_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      for (const click of fixture.clicks || []) {
        await page.getByRole(click.role, { name: click.name, exact: !!click.exact }).click();
        await page.waitForTimeout(800);
      }
      await page.evaluate(() => document.fonts.ready);
      const file = `${state}-${label}.png`;
      const buffer = await page.screenshot({ path: path.join(here, file), fullPage: Boolean(fixture.fullPage) });
      const dom = await page.evaluate(() => {
        const primaries = [...document.querySelectorAll("[data-g-primary]")];
        const regions = [...document.querySelectorAll('section[aria-labelledby="goal-next-step-heading"]')];
        const p0 = primaries[0];
        return {
          innerWidth, innerHeight, devicePixelRatio, docClientWidth: document.documentElement.clientWidth,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          h1: [...document.querySelectorAll("h1")].map(h => h.textContent.trim()),
          goalPage: Boolean(document.querySelector("[data-goal-page]")),
          primaries: primaries.map(e => e.textContent.trim()), nextStepRegions: regions.length,
          primaryInNextStep: p0 ? regions.some(r => r.contains(p0)) : null,
          primaryBg: p0 ? getComputedStyle(p0).backgroundColor : null,
          fontLoaded: document.fonts.check('16px "Instrument Sans"'),
          bodyFont: getComputedStyle(document.body).fontFamily,
          // Where each decision action sits in the document, so a capture can prove
          // Approve/Reject are inside the frame it shows.
          scrollHeight: document.documentElement.scrollHeight,
          actions: [...document.querySelectorAll("button")].filter(b => ["Approve", "Reject"].includes(b.textContent.trim())).map(b => { const r = b.getBoundingClientRect(); return { name: b.textContent.trim(), docTop: Math.round(r.top + scrollY), docBottom: Math.round(r.bottom + scrollY), ariaDisabled: b.getAttribute("aria-disabled") }; }),
        };
      });
      const entry = { file, state, route: fixture.route, cssWidth: width, cssHeight: height, dpr: scale, fullPage: Boolean(fixture.fullPage), sha1: createHash("sha1").update(buffer).digest("hex"), takenAtUtc: new Date().toISOString(), head, fixture: `fixtures/${name}`, ...dom, calls, errors: errors.slice(0, 5) };
      manifest.push(entry);
      console.log(JSON.stringify({ file, sha1: entry.sha1, innerWidth: dom.innerWidth, dpr: dom.devicePixelRatio, overflowX: dom.overflowX, h1: dom.h1, primaries: dom.primaries, primaryInNextStep: dom.primaryInNextStep, primaryBg: dom.primaryBg, fontLoaded: dom.fontLoaded, fullPage: Boolean(fixture.fullPage), scrollHeight: dom.scrollHeight, actions: dom.actions, calls, errors: errors.slice(0, 2) }));
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (!only) await writeFile(path.join(here, "manifest.json"), `${JSON.stringify({ tool: "design/goal-ui/captures/admin-approvals/capture.mjs", base, head, flag: "VITE_GOAL_SURFACES=admin-approvals", captures: manifest }, null, 2)}\n`);
