#!/usr/bin/env node
// Kit v4 screen fidelity harness.
//
// Captures a live route at the same viewports the kit reference PNGs in
// screens/{web,mobile}/ were taken at (web 1280px @1x, mobile 390px @2x),
// then writes side-by-side slices (reference | live) for visual review.
//
// Signed-in and data-driven states are rendered from a fixture file that
// mocks the API at the network layer (Playwright page.route), so no local
// database or provider keys are needed and nothing reaches a real backend.
//
// Usage:
//   node scripts/kit-screens/capture.mjs --route /explore --name 01_explore__default
//     [--fixture scripts/kit-screens/fixtures/explore.json]
//     [--base http://localhost:3000] [--out .kit-screens] [--viewport web|mobile|both]
//
// Fixture (JSON): {
//   "signedIn": { "id": 1, "name": "Asha Rao", "email": "asha@example.com", "role": "user" } | false,
//   "trpc": { "<procedure>": <data> },
//   "routes": [{ "method": "GET", "path": "/api/x", "match": "prefix|exact", "status": 200, "body": {} }],
//   "localStorage": { "key": "value" },
//   "actions": [{ "click": "text=Continue" }, { "fill": ["#email", "a@b.co"] }, { "wait": 300 }, { "press": "Enter" }],
//   "actionsWeb": [...], "actionsMobile": [...]   // optional viewport-specific overrides
// }
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = { base: process.env.KIT_SCREENS_BASE || "http://localhost:3000", out: ".kit-screens", viewport: "both" };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  if (!args.route || !args.name) {
    console.error("Required: --route <path> --name <screen file stem, e.g. 08_thread__default>");
    process.exit(2);
  }
  return args;
}

const VIEWPORTS = {
  web: { width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, slice: 900 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, slice: 1688 },
};

async function loadFixture(file) {
  if (!file) return {};
  return JSON.parse(await readFile(file, "utf8"));
}

function trpcBody(procedures, fixture, signedIn) {
  return procedures.map(name => {
    if (name === "auth.me") return { result: { data: { json: signedIn || null } } };
    if (fixture.trpc && name in fixture.trpc) return { result: { data: { json: fixture.trpc[name] } } };
    return { result: { data: { json: null } } };
  });
}

async function installMocks(page, fixture, unmatched) {
  const signedIn = fixture.signedIn
    ? { openId: "fixture", loginMethod: "fixture", role: "user", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastSignedIn: "2026-10-08T00:00:00.000Z", ...fixture.signedIn }
    : null;
  const routes = fixture.routes || [];
  await page.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.startsWith("/api/trpc/")) {
      const procedures = url.pathname.slice("/api/trpc/".length).split(",");
      const body = trpcBody(procedures, fixture, signedIn);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.get("batch") ? body : body[0]) });
    }
    if (url.pathname === "/api/dev-auth/session") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(signedIn ? { signedIn: true, account: signedIn } : { signedIn: false }) });
    }
    const hit = routes.find(r => (r.method || "GET").toUpperCase() === method && (r.match === "prefix" ? url.pathname.startsWith(r.path) : url.pathname === r.path));
    if (hit) {
      return route.fulfill({ status: hit.status || 200, contentType: "application/json", body: JSON.stringify(hit.body ?? {}) });
    }
    unmatched.add(`${method} ${url.pathname}`);
    // Deterministic default: signed-out pages see 401, everything else an empty 404.
    return route.fulfill({ status: signedIn ? 404 : 401, contentType: "application/json", body: JSON.stringify({ error: "not mocked" }) });
  });
}

async function runActions(page, actions) {
  for (const action of actions || []) {
    if (action.click) await page.locator(action.click).first().click();
    else if (action.fill) await page.locator(action.fill[0]).first().fill(action.fill[1]);
    else if (action.press) await page.keyboard.press(action.press);
    else if (action.check) await page.locator(action.check).first().check();
    else if (action.wait) await page.waitForTimeout(action.wait);
    else if (action.waitFor) await page.locator(action.waitFor).first().waitFor({ timeout: 8000 });
    else if (action.scroll) await page.locator(action.scroll).first().scrollIntoViewIfNeeded();
  }
}

async function labelSvg(width, text) {
  const safe = text.replace(/[<&>]/g, "");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28"><rect width="100%" height="100%" fill="#141414"/><text x="10" y="19" font-family="Helvetica" font-size="15" fill="#ffffff">${safe}</text></svg>`);
}

async function compare(referencePath, livePath, outDir, name, sliceHeight) {
  const live = sharp(livePath);
  const liveMeta = await live.metadata();
  const hasRef = existsSync(referencePath);
  const refMeta = hasRef ? await sharp(referencePath).metadata() : { width: liveMeta.width, height: 0 };
  const width = refMeta.width;
  // Normalize live to the reference width so slices line up pixel for pixel.
  const liveBuf = liveMeta.width === width ? await live.png().toBuffer() : await live.resize({ width }).png().toBuffer();
  const liveHeight = (await sharp(liveBuf).metadata()).height;
  const total = Math.max(refMeta.height, liveHeight);
  const slices = Math.ceil(total / sliceHeight);
  const results = [];
  for (let i = 0; i < slices; i++) {
    const top = i * sliceHeight;
    const blank = { create: { width, height: sliceHeight, channels: 4, background: "#f0f0f0" } };
    const cut = async (buf, h) => {
      if (top >= h) return sharp(blank).png().toBuffer();
      const height = Math.min(sliceHeight, h - top);
      return sharp(buf).extract({ left: 0, top, width, height }).extend({ bottom: sliceHeight - height, background: "#f0f0f0" }).png().toBuffer();
    };
    const refSlice = hasRef ? await cut(await readFile(referencePath), refMeta.height) : await sharp(blank).png().toBuffer();
    const liveSlice = await cut(liveBuf, liveHeight);
    const [a, b] = await Promise.all([sharp(refSlice).removeAlpha().raw().toBuffer(), sharp(liveSlice).removeAlpha().raw().toBuffer()]);
    let diff = 0;
    for (let p = 0; p < a.length; p += 3) diff += (Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2])) > 60 ? 1 : 0;
    const mismatch = Math.round((diff / (a.length / 3)) * 1000) / 10;
    const gap = 16;
    const file = path.join(outDir, `${name}--${String(i + 1).padStart(2, "0")}.png`);
    await sharp({ create: { width: width * 2 + gap, height: sliceHeight + 28, channels: 4, background: "#ffffff" } })
      .composite([
        { input: await labelSvg(width, `REFERENCE ${name} [${i + 1}/${slices}]`), left: 0, top: 0 },
        { input: await labelSvg(width, `LIVE  mismatch ${mismatch}%`), left: width + gap, top: 0 },
        { input: refSlice, left: 0, top: 28 },
        { input: liveSlice, left: width + gap, top: 28 },
      ])
      .png()
      .toFile(file);
    results.push({ file, mismatch });
  }
  return { reference: hasRef ? referencePath : null, refHeight: refMeta.height, liveHeight, slices: results };
}

async function main() {
  const args = parseArgs(process.argv);
  const fixture = await loadFixture(args.fixture);
  const viewports = args.viewport === "both" ? ["web", "mobile"] : [args.viewport];
  const browser = await chromium.launch();
  const report = { route: args.route, name: args.name, viewports: {} };
  try {
    for (const vp of viewports) {
      const spec = VIEWPORTS[vp];
      const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.deviceScaleFactor, isMobile: spec.isMobile, hasTouch: spec.hasTouch, reducedMotion: "reduce", colorScheme: "light", locale: "en-US", timezoneId: "Asia/Kolkata" });
      if (fixture.localStorage) {
        await context.addInitScript(entries => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); }, fixture.localStorage);
      }
      // Fix the clock so relative times ("2h ago") render deterministically.
      await context.addInitScript(() => { const fixed = new Date("2026-10-08T10:00:00+05:30").getTime(); const RealDate = Date; class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } } globalThis.Date = FixedDate; });
      const page = await context.newPage();
      const unmatched = new Set();
      const consoleErrors = [];
      page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 240)); });
      page.on("pageerror", err => consoleErrors.push(`pageerror: ${String(err).slice(0, 240)}`));
      await installMocks(page, fixture, unmatched);
      await page.goto(new URL(args.route, args.base).href, { waitUntil: "networkidle", timeout: 45000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await runActions(page, (vp === "web" ? fixture.actionsWeb : fixture.actionsMobile) || fixture.actions);
      await page.waitForTimeout(400);
      // The kit captures were taken with the viewport stretched to the full
      // document height, so fixed chrome (sidebar bottom, phone tab bar) sits
      // at the page end. Stretch the same way before capturing.
      for (let pass = 0; pass < 3; pass++) {
        const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
        if (height <= page.viewportSize().height) break;
        await page.setViewportSize({ width: spec.width, height });
        await page.waitForTimeout(250);
      }
      const liveDir = path.join(args.out, "live", vp);
      const cmpDir = path.join(args.out, "compare", vp);
      await mkdir(liveDir, { recursive: true });
      await mkdir(cmpDir, { recursive: true });
      const livePath = path.join(liveDir, `${args.name}.png`);
      await page.screenshot({ path: livePath, fullPage: true, animations: "disabled" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const cmp = await compare(path.join("screens", vp, `${args.name}.png`), livePath, cmpDir, args.name, spec.slice);
      report.viewports[vp] = { live: livePath, horizontalOverflowPx: overflow, unmatchedApi: [...unmatched], consoleErrors: consoleErrors.slice(0, 10), ...cmp };
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
