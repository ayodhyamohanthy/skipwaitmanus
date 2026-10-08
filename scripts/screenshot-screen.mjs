#!/usr/bin/env node
/**
 * Render a screen and screenshot it, so a design port can be CHECKED instead of
 * assumed.
 *
 *   node scripts/screenshot-screen.mjs <route> <capture.png> [out.png]
 *
 * Why this exists: porting CSS and confirming the selectors are present is not
 * the same as confirming the page renders correctly. The homepage port reported
 * "96/97 selectors present" while never having been looked at. The first time it
 * was actually rendered it matched -- but that was luck, not verification, and
 * the same method had already produced three wrong screens (the shell, the
 * shared components, and the --accent value swap).
 *
 * The capture's own width is used as the viewport, and the rendered height is
 * printed next to the capture's, so a mismatch is a number rather than an
 * impression.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const [route, capturePath, outPath, vhArg] = process.argv.slice(2);
if (!route || !capturePath) {
  console.error("usage: node scripts/screenshot-screen.mjs <route> <capture.png> [out.png]");
  process.exit(2);
}

/** PNG dimensions, read straight from the IHDR chunk. */
function pngSize(file) {
  const header = readFileSync(file).subarray(0, 33);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

const capture = pngSize(capturePath);
const port = process.env.SCREENSHOT_PORT || "5199";
const base = `http://localhost:${port}`;

// Start a dev server only if one is not already answering.
let server;
try {
  await fetch(base, { signal: AbortSignal.timeout(1500) });
} catch {
  server = spawn(path.resolve("node_modules/.bin/vite"), ["dev", "--port", port], { stdio: "ignore", detached: true });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try { await fetch(base, { signal: AbortSignal.timeout(1000) }); break; } catch { /* keep waiting */ }
  }
}

const out = outPath || `/tmp/${path.basename(capturePath, ".png")}-actual.png`;
const browser = await chromium.launch();
// VIEWPORT HEIGHT MATTERS. The kit's .launch-hero is
  // `height: min(740px, calc(100svh - 170px))`, so the page's total height is a
  // function of the viewport height. Measuring at a fixed 900px reported the
  // homepage as 3889px against a 3851px capture -- a phantom "+38px bug" that
  // was purely the screenshot viewport. Pass the height the capture was taken
  // at (4th arg), or sweep a few values to find the one that reproduces the
  // capture's total height before concluding anything from the delta.
  const viewportHeight = Number(vhArg) || Number(process.env.SCREENSHOT_VH) || 900;
  const page = await browser.newPage({ viewport: { width: capture.width, height: viewportHeight }, deviceScaleFactor: 1 });
await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();

const actual = pngSize(out);
const delta = actual.height - capture.height;
console.log(`capture : ${capture.width}x${capture.height}`);
console.log(`rendered: ${actual.width}x${actual.height}  (${delta >= 0 ? "+" : ""}${delta}px height, ${((delta / capture.height) * 100).toFixed(1)}%)`);
console.log(`wrote   : ${out}`);
console.log(delta === 0 ? "height matches exactly" : "height differs -- open both images and compare before claiming a match");

if (server) { try { process.kill(-server.pid); } catch { /* already gone */ } }
