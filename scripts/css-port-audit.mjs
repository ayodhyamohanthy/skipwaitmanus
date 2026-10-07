#!/usr/bin/env node
/**
 * CSS port audit: did every selector from the kit's stylesheet actually arrive?
 *
 *   node scripts/css-port-audit.mjs <keyword...>
 *   node scripts/css-port-audit.mjs launch hero- referrer-band journey
 *
 * WHY THIS EXISTS. Porting a kit screen's CSS by guessing line numbers in
 * app/src/styles.css silently drops rules -- the first homepage port missed 13
 * of them (.launch-page h1/h2, .launch-footer a, the whole mobile-audit media
 * block) and looked "close but not the same", which is the hardest kind of
 * wrong to spot by eye. This turns "I ported it" into a count.
 *
 * Exit 0 = every matching kit selector is present in the live stylesheet.
 * Exit 1 = list the gaps.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const kit = fs.readFileSync(path.join(root, "app", "src", "styles.css"), "utf8");
const live = fs.readFileSync(path.join(root, "client", "src", "index.css"), "utf8");

const keywords = process.argv.slice(2);
if (keywords.length === 0) {
  console.error("usage: node scripts/css-port-audit.mjs <selector-keyword...>");
  process.exit(2);
}

/** Every `.class` selector appearing before a `{`, split on selector lists. */
function selectors(css) {
  const found = new Set();
  for (const selectorList of css.matchAll(/([^{}]+)\{/g)) {
    for (const part of selectorList[1].split(",")) {
      const selector = part.trim();
      if (selector.startsWith(".") && keywords.some(keyword => selector.includes(keyword))) {
        found.add(selector);
      }
    }
  }
  return found;
}

const kitSelectors = selectors(kit);
const liveSelectors = selectors(live);
const present = [...kitSelectors].filter(selector => liveSelectors.has(selector));
const missing = [...kitSelectors].filter(selector => !liveSelectors.has(selector)).sort();

// A selector can be absent from the set but still present in the file when a
// comment or a preceding rule boundary defeats the scan, so confirm each gap
// against the raw text before reporting it.
const realGaps = missing.filter(selector => !live.includes(`${selector}{`) && !live.includes(`${selector},`) && !live.includes(`${selector} `));

console.log(`css-port-audit [${keywords.join(", ")}]: ${present.length}/${kitSelectors.size} kit selectors present in client/src/index.css`);
if (realGaps.length) {
  console.error(`::error::missing ${realGaps.length} selector(s):`);
  for (const selector of realGaps) console.error(`  - ${selector}`);
  process.exit(1);
}
if (missing.length) console.log(`  (${missing.length} not in the selector set but confirmed present in the file: ${missing.join(", ")})`);
