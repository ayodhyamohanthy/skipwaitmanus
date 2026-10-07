#!/usr/bin/env node
/**
 * Design-token audit for the whole client surface (DESIGN.md palette guard).
 *
 *   node scripts/design-token-audit.mjs [paths...]
 *
 * The approved palette is DESIGN.md ("Moving Parts"): the tokens below are the
 * only hexes allowed anywhere in client/src (ui primitives included). Third-
 * party share-brand colours (WhatsApp/Telegram/LinkedIn) are classified
 * separately. Everything else fails the audit.
 *
 * Why this exists: the pending screens were authored in the earlier Takram /
 * warm-paper palette (#191713, #F5F4EF, #E2DDD2, #E8F0FE, #ECE8DD, #D5CFC0,
 * #BFDBFE, #DBEAFE, #625D52, #3F3B33, #2E2B25) and only rendered correctly
 * because client/src/index.css carried a `!important` compatibility shim. That
 * shim has since been retired: every product surface is re-authored in the
 * approved tokens and the audit guards the whole tree so the legacy palette
 * cannot leak back in (a missing shim entry used to be invisible in review).
 *
 * Exit code 0 = clean, 1 = legacy token found.
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOTS = ["client/src"];

/** Surfaces allowed to use third-party/demo styling, excluded from the audit. */
const EXCLUDED = new Set([
  "client/src/pages/Home.tsx",              // approved reference surface (already on-palette)
  "client/src/pages/ComponentShowcase.tsx", // dev-only shadcn/widget gallery
]);

/** Kit v4 palette (owner override, Oct 2026) + legacy DESIGN.md palette.
 *
 * MIGRATION UNION: kit v4 is the visual contract going forward, but converted
 * pages land batch by batch. Until the last screen batch removes the final
 * legacy hex, both sets pass so CI stays green throughout the migration.
 * Each screen batch must convert its files to kit tokens (oklch utilities,
 * no hardcoded hexes); the batch that removes the last legacy hex tightens
 * this set back to kit-only and deletes this comment.
 */
const APPROVED = new Set([
  "#ffffff", "#000000", // canvas / ink (legacy; converges to kit foreground)
  "#141414", // kit ink
  "#0000ff", "#0000cc", "#000099", // primary action blue (+ hover/pressed)
  "#ededff", "#c2c2ff", "#e0e0ff", // pale-blue tint, line, track
  "#fffc52", "#121212", // accent yellow, dark section
  "#505050", "#767676", "#e5e5e5", "#cfcfcf", "#f0f0f0", "#f5f5f5", "#e0e0e0", // greys (incl. disabled block)
  "#15803d", "#b45309", "#b91c1c", // functional success / pending / error
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
  const tokens = source.match(/[a-z-]*\[#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\](\/[0-9]{1,3})?/g) ?? [];
  for (const token of tokens) {
    const hex = token.match(/#[0-9A-Fa-f]{3,6}/)[0].toLowerCase();
    if (APPROVED.has(hex)) { approvedCount++; continue; }
    if (THIRD_PARTY.has(hex)) { thirdPartyCount++; continue; }
    findings.push({ file, token });
  }
}

console.log(`design-token-audit: ${targets.length} files · ${approvedCount} approved tokens · ${thirdPartyCount} third-party brand tokens`);
if (findings.length === 0) {
  console.log("OK — no legacy or off-brand hexes in the client surface.");
  process.exit(0);
}
console.error(`\nFAIL — ${findings.length} off-brand token(s):`);
for (const { file, token } of findings) console.error(`  ${file}: ${token}`);
process.exit(1);