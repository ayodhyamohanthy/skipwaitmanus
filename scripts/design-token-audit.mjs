#!/usr/bin/env node
/**
 * Design-token audit for the pending screens (docs/design/pending-screens-handoff.md).
 *
 *   node scripts/design-token-audit.mjs [paths...]
 *
 * The approved palette is DESIGN.md ("Moving Parts"): the tokens below are the
 * only hexes allowed in the pending-screen surface. Everything else must be
 * classified as an intentional third-party brand colour (WhatsApp/Telegram/
 * LinkedIn) or it fails the audit.
 *
 * Why this exists: the pending screens were authored in the earlier Takram /
 * warm-paper palette (#191713, #F5F4EF, #E2DDD2, #E8F0FE, #ECE8DD, #D5CFC0,
 * #BFDBFE, #DBEAFE, #625D52, #3F3B33, #2E2B25) and only rendered correctly
 * because client/src/index.css carried a `!important` compatibility shim. Any
 * utility variant missing from that shim (border-[#ECE8DD], bg-[#eef3fc],
 * border-[#f3c1bc], bg-[#FEF3F2] ...) silently leaked the old palette. The
 * screens are now authored in the approved tokens, so legacy hexes are dead.
 *
 * Exit code 0 = clean, 1 = legacy token found.
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PATHS = [
  "client/src/pages/MyRequests.tsx",
  "client/src/pages/MyCompanyInbox.tsx",
  "client/src/pages/AdminApprovalQueue.tsx",
  "client/src/pages/AdminApprovalRecord.tsx",
  "client/src/components/LoadingSkeleton.tsx",
  "client/src/components/ActionErrorCard.tsx",
  "client/src/components/RequestStatusTimeline.tsx",
  "client/src/components/AdminNav.tsx",
  "client/src/components/SeekerCreditsCard.tsx",
  "client/src/components/ReferrerCreditsCard.tsx",
  "client/src/components/ReferrerFastTrackCard.tsx",
  "client/src/components/ReferralProgress.tsx",
  "client/src/components/AccountMenu.tsx",
  "client/src/components/NotificationBell.tsx",
  "client/src/components/ZeroActivityShareCard.tsx",
  "client/src/components/OneTapShareActions.tsx",
];

/** DESIGN.md palette — the only colours allowed here. */
const APPROVED = new Set([
  "#ffffff", "#000000", // canvas / ink
  "#0000ff", "#0000cc", "#000099", // primary action blue (+ hover/pressed)
  "#ededff", "#c2c2ff", "#e0e0ff", // pale-blue tint, line, track
  "#fffc52", "#121212", // accent yellow, dark section
  "#505050", "#767676", "#e5e5e5", "#cfcfcf", "#f0f0f0", "#f5f5f5", // greys
  "#15803d", "#b45309", "#b91c1c", // functional success / pending / error
]);

/** Deliberate third-party brand colours (share targets). */
const THIRD_PARTY = new Set(["#25d366", "#229ed9", "#0a66c2"]);

function expand(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target)
    .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map(name => path.join(target, name));
}

const targets = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PATHS).flatMap(expand);
const findings = [];
let approvedCount = 0;
let thirdPartyCount = 0;

for (const file of targets) {
  const source = fs.readFileSync(file, "utf8");
  // Tailwind arbitrary-value class tokens, e.g. `bg-[#ededff]`, `hover:border-[#0000ff]`.
  const tokens = source.match(/[a-z-]*\[#[0-9A-Fa-f]{6}\](\/[0-9]{1,3})?/g) ?? [];
  for (const token of tokens) {
    const hex = token.match(/#[0-9A-Fa-f]{6}/)[0].toLowerCase();
    if (APPROVED.has(hex)) { approvedCount++; continue; }
    if (THIRD_PARTY.has(hex)) { thirdPartyCount++; continue; }
    findings.push({ file, token });
  }
}

console.log(`design-token-audit: ${targets.length} files · ${approvedCount} approved tokens · ${thirdPartyCount} third-party brand tokens`);
if (findings.length === 0) {
  console.log("OK — no legacy or off-brand hexes in the pending-screen surface.");
  process.exit(0);
}
console.error(`\nFAIL — ${findings.length} off-brand token(s):`);
for (const { file, token } of findings) console.error(`  ${file}: ${token}`);
process.exit(1);