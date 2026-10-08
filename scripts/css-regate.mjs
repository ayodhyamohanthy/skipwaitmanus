#!/usr/bin/env node
/**
 * Re-gate kit rules that were ported without their @media wrapper.
 *
 *   node scripts/css-regate.mjs [--dry]
 *
 * WHY: a rule the kit wraps in `@media (max-width:...)` that lands at TOP LEVEL
 * applies at EVERY viewport width. The whole responsive shell then breaks --
 * the mobile bottom tab bar, the sidebar, the topbar actions all render on
 * desktop -- while braces balance, the CSS parses, every selector resolves, and
 * nothing reports an error. It just looks wrong at large widths.
 *
 * MATCHING IS POSITIONAL. A selector normally appears several times: a base rule
 * plus one rule per breakpoint. So the kit's ordered gate list is zipped against
 * our ordered occurrences, and occurrence N is wrapped in gate N. Wrapping
 * "the first ungated one" instead would attach the wrong breakpoint to the wrong
 * rule and silently change behaviour at the wrong width.
 *
 * Idempotent: an occurrence already inside the matching @media is left alone.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dry = process.argv.includes("--dry");
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, " ");

/** Ordered gate list per selector, in source order, with declarations. */
function gateSequences(css) {
  const seq = new Map();
  const stack = [];
  let buffer = "";
  const rule = { selector: "", body: "" };
  for (let k = 0; k < css.length; k += 1) {
    const ch = css[k];
    if (ch === "{") {
      const selector = buffer.trim();
      buffer = "";
      stack.push(selector);
      if (!selector.startsWith("@")) {
        const media = stack.filter(s => s.startsWith("@media"));
        const gate = media.length ? media[media.length - 1] : "(top)";
        // Capture the declaration body so occurrences can be matched by content
        // rather than by position.
        const end = css.indexOf("}", k);
        const body = end === -1 ? "" : css.slice(k + 1, end);
        for (const part of selector.split(",")) {
          const s = part.trim();
          if (s.startsWith(".")) {
            if (!seq.has(s)) seq.set(s, []);
            seq.get(s).push({ gate, body: body.replace(/\s+/g, "") });
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

const kitCss = strip(fs.readFileSync(path.join(root, "app", "src", "styles.css"), "utf8"));
let live = fs.readFileSync(path.join(root, "client", "src", "index.css"), "utf8");
const kitSeq = gateSequences(kitCss);
const liveSeq = gateSequences(strip(live));

// Selectors whose responsive overrides lost their gate.
const leaking = [];
for (const [selector, seq] of kitSeq) {
  const live = liveSeq.get(selector);
  if (!live) continue;
  const kitGated = seq.filter(r => r.gate !== "(top)").length;
  if (kitGated === 0) continue;
  if (live.filter(r => r.gate !== "(top)").length < kitGated) leaking.push(selector);
}

let wrapped = 0;
let appended = 0;
const unresolved = [];

for (const selector of leaking) {
  const kitRules = kitSeq.get(selector);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const occurrences = [...live.matchAll(new RegExp("(?:/\\*[^*]*\\*/\\s*)?" + escaped + "\\{[^}]*\\}", "g"))];
  const replacements = [];

  // Pass 1: match each gated kit rule to the live occurrence carrying the SAME
  // DECLARATIONS. Order-independent, so it survives reordering.
  const used = new Set();
  const place = (kitRule, index) => {
    if (kitRule.gate === "(top)") return;
    let match = occurrences.find(o => {
      if (o[0].includes("@media") || used.has(o.index)) return false;
      const body = o[0].slice(o[0].indexOf("{") + 1, o[0].lastIndexOf("}"));
      return body.replace(/\s+/g, "") === kitRule.body;
    });
    // Pass 2: fall back to position. Declarations are often EDITED when ported
    // (e.g. the kit's `.page-heading h1{font-size:32px;margin:9px 0 10px;}`
    // became `{font-size:32px;}`), so an exact-body match cannot always be found
    // even though the rule is plainly the same one.
    if (!match && occurrences[index] && !occurrences[index][0].includes("@media") && !used.has(occurrences[index].index)) {
      match = occurrences[index];
    }
    if (!match) return;
    used.add(match.index);
    replacements.push({ at: match.index, text: match[0], gate: kitRule.gate });
  };

  kitRules.forEach((kitRule, index) => place(kitRule, index));

  if (replacements.length === 0) { unresolved.push(selector); continue; }

  // Apply from the end so earlier offsets stay valid.
  for (const r of replacements.reverse()) {
    live = live.slice(0, r.at) + r.gate + "{" + r.text + "}" + live.slice(r.at + r.text.length);
    wrapped += 1;
  }
}

// SECOND PASS: some gated kit rules were never ported at all -- our stylesheet
// has the base rule and nothing for the breakpoint. Those cannot be "re-gated"
// because there is nothing to wrap, so they are appended verbatim, wrapped.
// Appending inside @media is safe: a media-gated rule cannot override a base
// rule outside its range.
const additions = [];
for (const selector of leaking) {
  const live = liveSeq.get(selector) || [];
  const liveBodies = new Set(live.map(r => r.body));
  const liveGates = new Set(live.map(r => r.gate));
  for (const kitRule of kitSeq.get(selector)) {
    if (kitRule.gate === "(top)") continue;
    // Already present with this declaration?
    if (liveBodies.has(kitRule.body)) continue;
    // Count how many rules we already have under this gate for this selector.
    if (liveGates.has(kitRule.gate) && live.filter(r => r.gate === kitRule.gate).length >=
        kitSeq.get(selector).filter(r => r.gate === kitRule.gate).length) continue;
    additions.push({ selector, gate: kitRule.gate, body: kitRule.body });
  }
}

if (additions.length) {
  let block = "\n/* Breakpoint rules the port dropped entirely, restored from\n"
    + " * app/src/styles.css by scripts/css-regate.mjs. Without these the shell's\n"
    + " * responsive behaviour is missing rather than wrong, which looks the same\n"
    + " * from the source and only shows up when rendered at the other width. */\n";
  for (const a of additions) {
    block += a.gate + "{" + a.selector + "{" + a.body + "}}\n";
    appended += 1;
  }
  live += block;
}

if (!dry) fs.writeFileSync(path.join(root, "client", "src", "index.css"), live);
console.log(`css-regate${dry ? " (dry run)" : ""}: ${leaking.length} leaking selectors, ${wrapped} wrapped, ${appended} appended`);
if (unresolved.length) {
  console.log(`  could not place ${unresolved.length}: ${unresolved.slice(0, 10).join(", ")}`);
}
