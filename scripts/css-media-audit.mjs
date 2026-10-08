#!/usr/bin/env node
/**
 * Are the kit's MOBILE-ONLY rules still mobile-only in our stylesheet?
 *
 *   node scripts/css-media-audit.mjs launch hero- referrer-band
 *
 * "Mobile design showing on web" has one mechanical cause: a rule the kit wraps
 * in `@media (max-width:...)` ended up OUTSIDE that wrapper when it was ported,
 * so it applies at every viewport width. Balanced braces do not catch this -- a
 * block can be perfectly well-formed and still be in the wrong place.
 *
 * So this walks both stylesheets tracking @media nesting, and for every matching
 * selector reports whether it is gated in the kit and whether it is gated here.
 * A selector that is gated in the kit but ungated here is a leak.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const keywords = process.argv.slice(2);
if (keywords.length === 0) {
  console.error("usage: node scripts/css-media-audit.mjs <selector-keyword...>");
  process.exit(2);
}

/**
 * Map each selector to the media condition it sits under ("" = ungated).
 *
 * Braces nest strictly, so every "}" closes exactly one "{". An earlier version
 * popped only when the pending buffer was empty; that desynced on minified CSS
 * and reported five mobile rules as leaking onto desktop when their gating was
 * in fact byte-identical to the kit's. A guard that cries wolf is worse than no
 * guard, so this tracks depth unconditionally.
 */
function gateMap(css) {
  const gates = new Map();
  const stack = [];
  let buffer = "";
  for (const ch of css) {
    if (ch === "{") {
      const selector = buffer.trim();
      buffer = "";
      stack.push(selector);
      if (selector.startsWith("@")) continue;
      const media = stack.slice(0, -1).filter(s => s.startsWith("@media")).join(" and ");
      for (const part of selector.split(",")) {
        const s = part.trim();
        if (s.startsWith(".") && keywords.some(k => s.includes(k))) {
          if (!gates.has(s)) gates.set(s, media);
        }
      }
    } else if (ch === "}") {
      buffer = "";
      stack.pop();
    } else {
      buffer += ch;
    }
  }
  return gates;
}

const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, " ");
const kit = gateMap(strip(fs.readFileSync(path.join(root, "app", "src", "styles.css"), "utf8")));
const live = gateMap(strip(fs.readFileSync(path.join(root, "client", "src", "index.css"), "utf8")));

const leaks = [];
const missing = [];
for (const [selector, kitGate] of kit) {
  if (!live.has(selector)) { missing.push(selector); continue; }
  const liveGate = live.get(selector);
  const norm = g => (g || "").replace(/\s+/g, "").toLowerCase();
  if (kitGate && norm(kitGate) !== norm(liveGate)) leaks.push({ selector, kitGate, liveGate });
}

console.log(`css-media-audit [${keywords.join(", ")}]: ${kit.size} kit selectors`);
console.log(`  gated in the kit: ${[...kit.values()].filter(Boolean).length}`);
console.log(`  missing from live: ${missing.length}`);
console.log(`  MEDIA LEAKS (mobile-only in the kit, ungated here): ${leaks.length}`);
for (const l of leaks.slice(0, 20)) console.log(`    ! ${l.selector}\n        kit:  ${l.kitGate}\n        live: ${l.liveGate ?? "(no media)"}`);
process.exit(leaks.length ? 1 : 0);
