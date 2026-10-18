#!/usr/bin/env node
/**
 * Design-token audit for the client surface (DESIGN.md "Verification").
 *
 *   node scripts/design-token-audit.mjs
 *
 * The rules live in scripts/designTokenAuditCore.mjs (tested by scripts/designTokenAudit.test.ts):
 * - Unmoved Kit v4 files: only the approved hexes may appear as Tailwind arbitrary colours (migration union until
 *   every screen moves to the goal UI, D-048).
 * - Goal scope (client/src/components/goal, client/src/pages/goal): no colour literal, no Kit v4/shadcn tokens, no
 *   banned effects; trust blue only in GoalVerifiedMark; status hues only in the primitives; no comp sample data.
 * - The goal tokens in client/src/index.css equal DESIGN.md (and the approved comp, except recorded deviations).
 *
 * Exit code 0 = clean, 1 = a finding.
 */
import fs from "node:fs";
import path from "node:path";
import { auditFiles, auditGoalTokens } from "./designTokenAuditCore.mjs";

const ROOT = process.cwd();
/** Approved reference and dev-only surfaces, excluded from the Kit v4 hex rule (never from the goal rules). */
const EXCLUDED = new Set(["client/src/pages/Home.tsx", "client/src/pages/ComponentShowcase.tsx"]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const rel = file => path.relative(ROOT, file).split(path.sep).join("/");
const all = walk(path.join(ROOT, "client/src")).map(rel);

function compSampleNames() {
  const file = path.join(ROOT, "design/goal-ui/content.json");
  if (!fs.existsSync(file)) return [];
  const content = JSON.parse(fs.readFileSync(file, "utf8"));
  const names = new Set();
  for (const company of content.screenA?.companies ?? []) names.add(company.name);
  for (const ask of content.screenC?.asks ?? []) {
    names.add(ask.company);
    if (ask.ref) names.add(ask.ref);
  }
  for (const row of content.screenB?.rows ?? []) if (row.ref) names.add(row.ref);
  if (content.screenB?.detail?.ref) names.add(content.screenB.detail.ref);
  if (content.screenA?.askDrawer?.resume?.fileName) names.add(content.screenA.askDrawer.resume.fileName);
  return [...names].filter(Boolean);
}

const sources = all
  .filter(file => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
  .filter(file => !EXCLUDED.has(file) || file.includes("/goal/"))
  .map(file => ({ path: file, source: fs.readFileSync(path.join(ROOT, file), "utf8") }));
const { findings, approved, thirdParty } = auditFiles(sources, { sampleNames: compSampleNames() });

const compTokens = path.join(ROOT, "design/goal-ui/pick/tokens.css");
const tokenFindings = auditGoalTokens({
  indexCss: fs.readFileSync(path.join(ROOT, "client/src/index.css"), "utf8"),
  compTokensCss: fs.existsSync(compTokens) ? fs.readFileSync(compTokens, "utf8") : null,
  cssFiles: all.filter(file => file.endsWith(".css")).map(file => ({ path: file, source: fs.readFileSync(path.join(ROOT, file), "utf8") })),
});

const goalFiles = sources.filter(file => /^client\/src\/(components|pages)\/goal\//.test(file.path)).length;
console.log(`design-token-audit: ${sources.length} files (${goalFiles} goal) · ${approved} approved tokens · ${thirdParty} third-party brand tokens`);
if (findings.length === 0 && tokenFindings.length === 0) {
  console.log("OK — no off-brand colours, goal tokens match DESIGN.md.");
  process.exit(0);
}
console.error(`\nFAIL — ${findings.length + tokenFindings.length} finding(s):`);
for (const finding of findings) console.error(`  ${finding.rule} ${finding.file}:${finding.line}: ${finding.detail}`);
for (const finding of tokenFindings) console.error(`  ${finding.rule} ${finding.detail}`);
process.exit(1);
