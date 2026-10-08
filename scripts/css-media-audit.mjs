#!/usr/bin/env node
/**
 * Are the kit's media-gated rules still media-gated in our stylesheet?
 *
 *   node scripts/css-media-audit.mjs            # audit every kit selector
 *   node scripts/css-media-audit.mjs app-sidebar mobile-tabs
 *
 * WHY: a rule the kit wraps in `@media (max-width:...)` that lands at TOP LEVEL
 * applies at every viewport width. The whole responsive shell then breaks --
 * mobile chrome renders on desktop -- while braces balance, the CSS parses,
 * every selector resolves, and nothing reports an error.
 *
 * THE SUBTLETY THAT MADE AN EARLIER VERSION USELESS: a selector usually appears
 * several times -- a base rule at top level plus responsive overrides. Comparing
 * only the FIRST occurrence per selector therefore compares base against base,
 * matches, and reports a clean bill of health while every override is ungated.
 * That is exactly how `.mobile-tabs`, `.app-sidebar` and `.topbar-actions` all
 * passed. This compares the full SEQUENCE of gates per selector instead.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const keywords = process.argv.slice(2);
const auditAll = keywords.length === 0;

const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, " ");

/** Map each selector to the ORDERED list of media conditions it appears under. */
function gateSequences(css) {
  const seq = new Map();
  const stack = [];
  let buffer = "";
  for (let k = 0; k < css.length; k += 1) {
    const ch = css[k];
    if (ch === "{") {
      const selector = buffer.trim();
      buffer = "";
      stack.push(selector);
      if (!selector.startsWith("@")) {
        const media = stack.filter(s => s.startsWith("@media"));
        const gate = media.length ? media[media.length - 1] : "(top)";
        for (const part of selector.split(",")) {
          const s = part.trim();
          if (s.startsWith(".") && (auditAll || keywords.some(x => s.includes(x)))) {
            if (!seq.has(s)) seq.set(s, []);
            seq.get(s).push(gate);
          }
        }
      }
    } else if (ch === "}") {
      buffer = "";
      stack.pop();
    } else {
      buffer += ch;
    }
  }
  return seq;
}

const norm = g => g.replace(/\s+/g, "").toLowerCase();
const kit = gateSequences(strip(fs.readFileSync(path.join(root, "app", "src", "styles.css"), "utf8")));
const live = gateSequences(strip(fs.readFileSync(path.join(root, "client", "src", "index.css"), "utf8")));

const leaks = [];
const absent = [];
for (const [selector, kitSeq] of kit) {
  const liveSeq = live.get(selector);
  if (!liveSeq) { absent.push(selector); continue; }
  const gatedInKit = kitSeq.filter(g => g !== "(top)").length;
  if (gatedInKit === 0) continue;
  const liveGated = liveSeq.filter(g => g !== "(top)").length;
  if (liveGated < gatedInKit) {
    leaks.push({ selector, kitSeq, liveSeq });
  }
}

console.log(`css-media-audit [${auditAll ? "ALL" : keywords.join(", ")}]`);
console.log(`  kit selectors: ${kit.size}`);
console.log(`  with a media gate in the kit: ${[...kit.values()].filter(s => s.some(g => g !== "(top)")).length}`);
console.log(`  absent from our stylesheet: ${absent.length}`);
console.log(`  LEAKS (gated in the kit, ungated here): ${leaks.length}`);
for (const l of leaks.slice(0, 25)) {
  console.log(`    ! ${l.selector}`);
  console.log(`        kit:  ${l.kitSeq.join(" , ")}`);
  console.log(`        live: ${l.liveSeq.join(" , ")}`);
}
process.exit(leaks.length ? 1 : 0);
