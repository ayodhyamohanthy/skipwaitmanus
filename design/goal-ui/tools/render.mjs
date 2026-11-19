#!/usr/bin/env node
// Renders static design comps to PNG at the two review widths (1280 desktop, 390 mobile).
// Usage: node design/goal-ui/tools/render.mjs <file.html> [more.html ...]
// Writes <name>.desktop.png and <name>.mobile.png next to each file; full-page captures.
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../package.json"));
const { chromium } = require("playwright");
const files = process.argv.slice(2);
if (!files.length) { console.error("usage: render.mjs <file.html> ..."); process.exit(2); }
const browser = await chromium.launch();
try {
  for (const file of files) {
    const abs = path.resolve(file);
    for (const [label, width, height] of [["desktop", 1280, 820], ["mobile", 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(`file://${abs}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const out = abs.replace(/\.html$/, `.${label}.png`);
      await page.screenshot({ path: out, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${out}${overflow > 0 ? `  WARNING horizontal overflow ${overflow}px` : ""}${errors.length ? `  ERRORS ${errors.join(" | ")}` : ""}`);
      await page.close();
    }
  }
} finally { await browser.close(); }
