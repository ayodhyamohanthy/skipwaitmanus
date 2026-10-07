#!/usr/bin/env node
/**
 * Design-token audit for the whole client surface (DESIGN.md palette guard).
 *
 *   node scripts/design-token-audit.mjs [paths...]
 *
 * The approved palette is DESIGN.md ("Scoreboard"): paper, ink, one signal red,
 * and the neutral rail the shipping surfaces use. Client surfaces are authored
 * with Tailwind arbitrary hex values, so this scan over `client/src` is what
 * keeps a retired token from leaking back in after a rebrand — the retired
 * "Moving Parts" family (#0000ff with #ededff/#c2c2ff/#e0e0ff/#fffc52) and the
 * even older Takram / warm-paper family (#191713, #F5F4EF, #E2DDD2, #E8F0FE,
 * #ECE8DD, #D5CFC0, #BFDBFE, #DBEAFE, #625D52, #3F3B33, #2E2B25) both fail here.
 * The legacy `!important` compatibility shim that once masked palette drift is
 * retired: every product surface is re-authored in the approved tokens.
 *
 * Exit code 0 = clean, 1 = retired or off-brand token found.
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOTS = ["client/src"];

/** Surfaces allowed to use third-party/demo styling, excluded from the audit. */
const EXCLUDED = new Set([
  "client/src/pages/ComponentShowcase.tsx", // dev-only shadcn/widget gallery
]);

/** DESIGN.md palette — the only colours allowed here. */
const APPROVED = new Set([
  "#f4f4f1", "#e9e9e2", "#fbfbf8", // paper, paper-dim, lifted plate
  "#131311", "#2a2a25", // ink, hover ink-soft
  "#e8442e", "#c2351f", "#fbe0da", "#f0b4a8", // signal (+ deep, tint, line)
  "#d9d9d1", "#deded6", "#c4c4ba", // ring, track, input line
  "#5f5f58", "#7a7a72", "#dcdcd4", // fog, faint, rule
  "#e5e5e5", "#cfcfcf", "#f0f0f0", "#f5f5f5", "#e0e0e0", // neutral rail still in the field
  "#505050", "#767676", // legacy secondary text / icons (existing surfaces)
  "#1d6b3c", "#8a5a0b", "#b02318", // functional success / pending / error
  "#15803d", "#b45309", "#b91c1c", // legacy functional tones still referenced
]);

/** Deliberate third-party brand colours (share targets). */
const THIRD_PARTY = new Set(["#25d366", "#229ed9", "#0a66c2"]);

function expand(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const name of fs.readdirSync(target)) {
    const p = path.join(target, name);
    if (fs.statSync(p).isDirectory()) {
      out.push(...expand(p));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const targets = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROOTS)
  .flatMap(expand)
  .filter(f => !EXCLUDED.has(f.split(path.sep).join("/")));
const findings = [];
let approvedCount = 0;
let thirdPartyCount = 0;

for (const file of targets) {
  const source = fs.readFileSync(file, "utf8");
  // Tailwind arbitrary-value class tokens, e.g. `bg-[#ededff]`, `hover:border-[#0000ff]`.
  const tokens = source.match(/[a-z-]*\[#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\](?:\/[0-9]{1,3})?/g) ?? [];
  for (const token of tokens) {
    const hex = token.match(/#[0-9A-Fa-f]{3,6}/)[0].toLowerCase();
    if (APPROVED.has(hex)) { approvedCount++; continue; }
    if (THIRD_PARTY.has(hex)) { thirdPartyCount++; continue; }
    findings.push({ file, token });
  }
}

console.log(`design-token-audit: ${targets.length} files · ${approvedCount} approved tokens · ${thirdPartyCount} third-party brand tokens`);
if (findings.length === 0) {
  console.log("OK — no retired or off-brand hexes in the client surface.");
  process.exit(0);
}
console.error(`\nFAIL — ${findings.length} off-brand token(s):`);
for (const { file, token } of findings) console.error(`  ${file}: ${token}`);
process.exit(1);
