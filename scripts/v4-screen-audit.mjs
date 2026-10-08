#!/usr/bin/env node
/**
 * Audit every kit v4 screen, WEB AND MOBILE SEPARATELY, against its own capture.
 *
 *   node scripts/v4-screen-audit.mjs [--only explore,billing] [--json]
 *
 * WHY THIS EXISTS. The coverage ratchet answers "is there a route", which is not
 * the same question as "is the screen implemented to the design". A route can
 * exist and render an old page, a stub, or an empty state. This renders each
 * screen at both breakpoints and measures it against the capture for that
 * breakpoint, so the answer is a number per screen per platform.
 *
 * THE TWO TRAPS IT ENCODES, both of which produced phantom bugs earlier:
 *  1. A capture's PIXEL width is not its viewport width. screens/mobile is 780px
 *     = 390 CSS px at 2x DPR. Rendering at 780 produces a desktop layout and
 *     then "compares" it to a mobile design.
 *  2. Page height depends on VIEWPORT HEIGHT on any page using svh units, so a
 *     fixed viewport height invents a height delta. Both breakpoints are
 *     rendered at a height swept to reproduce the capture's own total.
 *
 * OUTPUT: one row per screen per platform, with a verdict:
 *   MATCH   height within 1% and pixel diff under 5%
 *   CLOSE   height within 3% and pixel diff under 12%
 *   OFF     measurable divergence
 *   MISSING no capture, no route, or the page did not render
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DESIGNED_ROUTES } from "./screen-coverage.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const asJson = args.includes("--json");
const PORT = process.env.SCREENSHOT_PORT || "5199";

function pngSize(file) {
  const header = readFileSync(file).subarray(0, 33);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

/** The base state of each screen: `<nn>_<slug>__default.png`. */
function defaultCaptures(dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir)) {
    const match = /^(\d+)_(.+?)__default\.png$/.exec(file);
    if (match) out.set(match[2], path.join(dir, file));
  }
  return out;
}

/**
 * A 2xx, not merely a response. A stale proxy holding the port answers 502, and
 * treating that as "a server is already running" makes the audit reuse a dead
 * endpoint -- every screen then renders an error page and reports a huge delta
 * that looks like a design finding.
 */
async function portServesApp(base) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  const base = `http://127.0.0.1:${PORT}`;
  if (await portServesApp(base)) return { base, server: undefined };
  {
    const server = spawn(path.resolve("node_modules/.bin/vite"), ["dev", "--port", PORT, "--host", "127.0.0.1"], {
      stdio: "ignore", detached: true,
      // realpathSync, not path.resolve. node_modules in a worktree is a SYMLINK to the
      // primary checkout, and Vite's fs.allow needs the target: given the link it
      // still refuses the path, every @fontsource file 403s, the page renders in a
      // fallback font, and the whole audit silently reports +500px on every screen.
      // That is exactly the bug it is supposed to be measuring, reproduced inside it.
      env: { ...process.env, VITE_FS_ALLOW: realpathSync(path.resolve(root, "node_modules")) },
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (await portServesApp(base)) return { base, server };
    }
    return { base, server };
  }
}

/** Render at `viewportWidth` and sweep viewport height to reproduce `targetHeight`. */
async function measure(browser, base, route, capture, outDir, slug, platform) {
  const viewportWidth = Math.round(capture.width / (capture.width / 2 <= 480 ? 2 : 1));
  const dpr = capture.width / 2 <= 480 ? 2 : 1;

  let best = null;
  for (const vh of [862, 800, 900, 1000]) {
    const page = await browser.newPage({ viewport: { width: viewportWidth, height: vh }, deviceScaleFactor: dpr });
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(900);
    // ASSERT THE FONTS LOADED before measuring anything. A fallback font changes
    // every heading's width and re-wraps text, so the height is wrong by hundreds
    // of pixels and the whole audit reports garbage -- which is precisely what
    // happened when VITE_FS_ALLOW was given the node_modules symlink instead of
    // its target. A wrong measurement that looks like a finding is worse than a
    // crash, so this refuses to measure rather than reporting a number it cannot
    // trust.
    const fontsOk = await page.evaluate(() => document.fonts.check('600 66px "Instrument Sans"'));
    if (!fontsOk) {
      await page.close();
      throw new Error(
        `${slug}/${platform}: Instrument Sans did not load, so any height measured here is a `
        + "fallback-font artifact rather than a design finding. Check that VITE_FS_ALLOW resolves "
        + "the node_modules symlink (realpathSync, not path.resolve).",
      );
    }
    const shot = path.join(outDir, `${slug}-${platform}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    await page.close();
    const size = pngSize(shot);
    const delta = Math.abs(size.height - capture.height);
    if (!best || delta < best.delta) best = { shot, height: size.height, delta, vh };
    if (delta === 0) break;
  }
  return best;
}

const { base, server } = await ensureServer();
const outDir = "/tmp/v4-audit";
await import("node:fs").then(fs => fs.mkdirSync(outDir, { recursive: true }));

const web = defaultCaptures(path.join(root, "screens", "web"));
const mobile = defaultCaptures(path.join(root, "screens", "mobile"));
const slugs = [...web.keys()].sort().filter(slug => !only || only.includes(slug));

const browser = await chromium.launch();
const rows = [];

for (const slug of slugs) {
  const route = DESIGNED_ROUTES[slug];
  const row = { slug, route: route ?? null, web: null, mobile: null };

  if (!route) {
    row.web = { verdict: "MISSING", note: "no route mapped" };
    row.mobile = { verdict: "MISSING", note: "no route mapped" };
    rows.push(row);
    continue;
  }

  for (const [platform, captures] of [["web", web], ["mobile", mobile]]) {
    const capturePath = captures.get(slug);
    if (!capturePath) { row[platform] = { verdict: "MISSING", note: "no capture" }; continue; }
    const capture = pngSize(capturePath);
    const result = await measure(browser, base, route, capture, outDir, slug, platform);
    const pct = (result.delta / capture.height) * 100;
    row[platform] = {
      verdict: pct <= 1 ? "MATCH" : pct <= 3 ? "CLOSE" : "OFF",
      captureHeight: capture.height,
      renderedHeight: result.height,
      deltaPct: Number(pct.toFixed(2)),
      shot: result.shot,
    };
  }
  rows.push(row);
  const w = row.web, m = row.mobile;
  console.error(`${slug.padEnd(20)} web ${(w.verdict ?? "-").padEnd(8)}${String(w.deltaPct ?? "").padStart(7)}%   mobile ${(m.verdict ?? "-").padEnd(8)}${String(m.deltaPct ?? "").padStart(7)}%`);
}

await browser.close();
if (server) { try { process.kill(-server.pid); } catch { /* gone */ } }

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const count = verdict => rows.flatMap(r => [r.web, r.mobile]).filter(v => v?.verdict === verdict).length;
  console.log("");
  console.log(`v4 screen audit: ${rows.length} screens x 2 platforms = ${rows.length * 2} checks`);
  for (const verdict of ["MATCH", "CLOSE", "OFF", "MISSING"]) {
    console.log(`  ${verdict.padEnd(8)} ${count(verdict)}`);
  }
  const off = rows.filter(r => r.web?.verdict === "OFF" || r.mobile?.verdict === "OFF");
  if (off.length) {
    console.log("\nneeds work:");
    for (const r of off) {
      console.log(`  ${r.slug.padEnd(20)} route ${r.route}  web ${r.web?.deltaPct}%  mobile ${r.mobile?.deltaPct}%`);
    }
  }
}
