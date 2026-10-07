#!/usr/bin/env node
/**
 * Screen-coverage ratchet for the kit v4 screen program.
 *
 *   node scripts/screen-coverage.mjs [--json]
 *
 * `screens/web/*.png` is the PDF's per-screen capture set, so it is the
 * authoritative list of screens that must exist. This script maps every
 * designed route onto a live route in client/src/App.tsx and reports the gap.
 *
 * WHY A RATCHET AND NOT AN ASSERTION: 42 screens are designed and most are not
 * built yet. A guard that simply failed on the gap would turn CI red for weeks,
 * which is how this repository previously hid a real failure behind exclusions.
 * So it asserts only that coverage never goes BACKWARDS: implemented routes must
 * not drop below BASELINE, no designed route may lose its mapping, and a new
 * designed route must arrive with a mapping (even if that mapping is null).
 * Raise BASELINE in the same commit that implements a screen.
 *
 * Exit 0 = at or above baseline, 1 = regression or unmapped designed route.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const screensDir = path.join(root, "screens", "web");
const appTsx = path.join(root, "client", "src", "App.tsx");

/**
 * Designed route -> live route. `null` means "designed, not built yet".
 * Paths differ where the kit renamed a screen; those renames keep the live URL
 * working with a redirect rather than replacing it (kit rule: existing URLs
 * keep working).
 */
export const DESIGNED_ROUTES = {
  "admin": null,                          // kit console index; live has /admin/* consoles only
  "admin-review": "/admin/approvals",     // kit queue -> live approval queue
  "alerts": "/notifications",             // kit rename
  "app-states": null,                     // PWA install/offline gallery
  "approve": null,                        // assistant approval sheet
  "ask": "/request",                      // kit rename
  "assistants": null,
  "billing": null,
  "connect-assistant": null,
  "developer-console": null,
  "developers": null,
  "emails": null,
  "employer": "/employer",
  "explore": null,
  "explore-skipwait": null,               // company detail (/explore/:slug)
  "for-companies": null,
  "forgot-password": null,
  "guidelines": "/guidelines",
  "help": "/help",                        // kit help centre; /support stays as triage
  "inbox": "/inbox",
  "invite": "/share",
  "landed": null,
  "onboarding": "/start",                 // kit rename
  "p-asha": null,                         // public profile (/p/:handle)
  "plans": "/plans",
  "privacy": "/privacy",
  "profile": null,
  "referrer": "/referrer",
  "referrer-home": "/referrer/impact",
  "referrer-setup": null,
  "report": "/report",                    // built: d7506a7a
  "requests": "/requests",
  "reset-password": null,
  "safety": "/safety",
  "settings": "/settings",
  "sign-in": null,
  "suggest-company": null,
  "terms": "/terms",
  "thread": "/conversation/:requestId",   // kit rename
  "verify": "/verify",                    // built: 5fb6395d
  "work": null,
  "x": "*",                               // 404 catch-all
};

/** Implemented count as of this commit. Raise it; never lower it. */
export const BASELINE_IMPLEMENTED = 21;

const designedSlugs = fs.existsSync(screensDir)
  ? [...new Set(fs.readdirSync(screensDir).filter(name => name.endsWith(".png")).map(name => name.replace(/__.*$/, "").replace(/^\d+_/, "")))].sort()
  : [];

const livePaths = new Set([...fs.readFileSync(appTsx, "utf8").matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]));
// The 404 screen is a pathless catch-all (`<Route component={NotFound}/>`), so
// it never appears in the path scan above and has to be detected separately.
const hasCatchAll = /<Route\s+component=\{NotFound\}/.test(fs.readFileSync(appTsx, "utf8"));
const isLive = (live) => (live === "*" ? hasCatchAll : livePaths.has(live));

const unmapped = designedSlugs.filter(slug => !(slug in DESIGNED_ROUTES));
const mapped = designedSlugs.filter(slug => slug in DESIGNED_ROUTES);
const covered = mapped.filter(slug => DESIGNED_ROUTES[slug] !== null && isLive(DESIGNED_ROUTES[slug]));
// A mapping that points at a route App.tsx no longer declares is a broken
// pointer, not progress -- it reads as covered while the screen 404s.
const dangling = mapped.filter(slug => DESIGNED_ROUTES[slug] !== null && !isLive(DESIGNED_ROUTES[slug]));
const pending = mapped.filter(slug => DESIGNED_ROUTES[slug] === null);
const implemented = covered;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ designed: designedSlugs.length, implemented: implemented.length, baseline: BASELINE_IMPLEMENTED, pending: pending.map(s => s), unmapped, dangling }, null, 2));
} else {
  console.log(`kit v4 screen coverage: ${implemented.length}/${designedSlugs.length} designed routes reachable (baseline ${BASELINE_IMPLEMENTED})`);
  if (pending.length) console.log(`  pending (${pending.length}): ${pending.join(", ")}`);
  if (dangling.length) console.log(`  broken mappings (${dangling.length}): ${dangling.join(", ")}`);
}

let failed = false;
if (unmapped.length) {
  console.error(`::error::designed route(s) with no mapping in DESIGNED_ROUTES: ${unmapped.join(", ")}`);
  console.error("Add an entry (use null if not built yet) so the gap stays visible.");
  failed = true;
}
if (dangling.length) {
  console.error(`::error::mapping points at a route App.tsx no longer declares: ${dangling.map(slug => `${slug}->${DESIGNED_ROUTES[slug]}`).join(", ")}`);
  failed = true;
}
if (implemented.length < BASELINE_IMPLEMENTED) {
  console.error(`::error::screen coverage regressed: ${implemented.length} < baseline ${BASELINE_IMPLEMENTED}`);
  failed = true;
}
process.exit(failed ? 1 : 0);
