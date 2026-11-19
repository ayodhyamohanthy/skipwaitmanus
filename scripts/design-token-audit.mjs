#!/usr/bin/env node
/**
 * Design-token audit for the whole client surface.
 *
 *   node scripts/design-token-audit.mjs [paths...]
 *
 * Two palettes are guarded at once:
 * - Live surfaces (Kit v4): the APPROVED migration-union hex set below is the
 *   only arbitrary-value hex allowed until the goal-UI move tightens it.
 * - The goal scope (client/src/components/goal/**, D-048 phase 2): no colour
 *   literals at all; only the --g-* system declared in client/src/index.css,
 *   with trust blue reserved for GoalVerifiedMark, status hues internal to
 *   the primitives, and the comp sample data banned tree-wide.
 *
 * The rules live in scripts/designTokenAuditCore.mjs (pure, fixture-tested in
 * scripts/designTokenAudit.test.ts); this wrapper gathers files and prints.
 *
 * Exit code 0 = clean, 1 = a rule fired.
 */
import fs from "node:fs";
import path from "node:path";
import { auditFiles } from "./designTokenAuditCore.mjs";

const DEFAULT_ROOTS = ["client/src"];

/** Surfaces allowed to use third-party/demo styling, excluded from the hex scan only. */
const EXCLUDED = new Set([
  "client/src/pages/Home.tsx",              // approved reference surface (already on-palette)
  "client/src/pages/ComponentShowcase.tsx", // dev-only shadcn/widget gallery
]);

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

function expandCss(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return /\.css$/.test(target) ? [target] : [];
  const out = [];
  for (const name of fs.readdirSync(target)) {
    const p = path.join(target, name);
    if (fs.statSync(p).isDirectory()) out.push(...expandCss(p));
    else if (/\.css$/.test(name)) out.push(p);
  }
  return out;
}

const normalize = (file) => file.split(path.sep).join("/");
const read = (file) => ({ path: normalize(file), source: fs.readFileSync(file, "utf8") });

const allSources = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROOTS).flatMap(expand).map(read);
const scanned = allSources.filter(({ path: file }) => !EXCLUDED.has(file));
const cssFiles = DEFAULT_ROOTS.flatMap(expandCss).map(read);

// R6's comp sample names come from the approved artefacts (design/goal-ui/content.json).
let sampleNames = [];
try {
  const content = JSON.parse(fs.readFileSync("design/goal-ui/content.json", "utf8"));
  const names = new Set();
  for (const company of content.screenA?.companies ?? []) if (company?.name) names.add(company.name);
  for (const ask of content.screenC?.asks ?? []) { if (ask?.company) names.add(ask.company); if (ask?.ref) names.add(ask.ref); }
  if (content.screenB?.detail?.ref) names.add(content.screenB.detail.ref);
  if (content.screenA?.askDrawer?.resume?.fileName) names.add(content.screenA.askDrawer.resume.fileName);
  sampleNames = [...names];
} catch { /* content.json absent: R6 has nothing to pin */ }

const { findings, approvedCount, thirdPartyCount, scannedCount } = auditFiles(scanned, { sampleNames, r6Files: allSources, cssFiles });

console.log(`design-token-audit: ${scannedCount} files · ${approvedCount} approved tokens · ${thirdPartyCount} third-party brand tokens`);
if (findings.length === 0) {
  console.log("OK — no legacy or off-brand hexes in the client surface.");
  process.exit(0);
}
console.error(`\nFAIL — ${findings.length} off-brand token(s):`);
for (const { file, rule, token } of findings) console.error(`  ${file}: [${rule}] ${token}`);
process.exit(1);
