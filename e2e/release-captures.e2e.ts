// GATE-release-captures (D-346 (6), docs/plans/D-344-unblock.md row 4): the
// release-row captures CI takes instead of a session taking them by hand
// (AGENTS.md rule 8). For each goal surface named in RELEASE_CAPTURE_IDS it
// opens every route that surface owns, as the person who meets it, at 1280x900
// and at 390x844 at scale 2, and saves a full-page PNG under
// e2e/.results/release-captures/<id>/ (uploaded as `release-captures-<id>`).
//
// The routes and personas come from scripts/release-captures.mjs, which reads
// client/src/lib/goalSurfaces.ts itself. Sign-in uses the existing harness only
// (./fixtures): visitors get a fresh signed-out context, seekers a fresh dev-plane
// seeker (devSignIn), the referrer the seeded, stepped-up referrer (referrerPage),
// and the admin the seeded test_seed admin session that scripts/e2e-server.mjs
// wrote to e2e/.auth/seed.json. Synthetic data only: route parameters are fixed
// placeholder values and no real account, file or payment is touched.
//
// With RELEASE_CAPTURE_IDS unset (the `e2e journeys` job, a local `pnpm e2e`)
// this file declares no test.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "playwright/test";
import { capturePlan, VIEWPORTS } from "../scripts/release-captures.mjs";
import { devSignIn, expect, test } from "./fixtures";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.RELEASE_CAPTURE_DIR || join(here, ".results", "release-captures");
/** The admin scripts/seed-test-accounts.ts seeds (role admin, loginMethod test_seed). */
const SEEDED_ADMIN_EMAIL = "qa.admin@example.com";

type Shot = { id: string; persona: "visitor" | "seeker" | "referrer" | "admin"; pattern: string; path: string; file: string };
type Viewport = { name: string; width: number; height: number; deviceScaleFactor: number };

const ids = (process.env.RELEASE_CAPTURE_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
const shots = capturePlan(ids) as Shot[];

function seededAdminCookie(): string {
  const seed = JSON.parse(readFileSync(join(here, ".auth", "seed.json"), "utf8")) as { accounts: Record<string, string> };
  const cookie = seed.accounts[SEEDED_ADMIN_EMAIL];
  if (!cookie) throw new Error(`no seeded session for ${SEEDED_ADMIN_EMAIL}; run node scripts/e2e-server.mjs start`);
  return cookie;
}

async function capture(page: Page, shot: Shot, viewport: Viewport) {
  const response = await page.goto(shot.path, { waitUntil: "load" });
  // Let the page's own queries settle; a page that keeps polling is captured anyway.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  const status = response?.status() ?? 0;
  expect(status, `${shot.path} answered ${status}`).toBeLessThan(500);
  await expect(page.locator("#root")).not.toBeEmpty();
  const dir = join(OUT, shot.id);
  mkdirSync(dir, { recursive: true });
  const file = `${shot.file}@${viewport.width}.png`;
  await page.screenshot({ path: join(dir, file), fullPage: true, animations: "disabled" });
  const finalPath = new URL(page.url()).pathname;
  appendFileSync(join(dir, "manifest.jsonl"), `${JSON.stringify({ id: shot.id, persona: shot.persona, route: shot.pattern, path: shot.path, finalPath, status, viewport: `${viewport.width}x${viewport.height}@${viewport.deviceScaleFactor}x`, file })}\n`);
  test.info().annotations.push({ type: "capture", description: `${shot.id}/${file} (${shot.path} -> ${finalPath}, ${status})` });
}

for (const viewport of VIEWPORTS as readonly Viewport[]) {
  test.describe(`release captures at ${viewport.width}x${viewport.height}`, () => {
    // newContext (and referrerPage, which opens through it) spreads contextOptions.
    test.use({ contextOptions: { viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor } });

    for (const shot of shots) {
      const title = `${shot.id} ${shot.path} @${viewport.width} as ${shot.persona}`;
      if (shot.persona === "referrer") {
        test(title, async ({ referrerPage }) => {
          await capture(referrerPage, shot, viewport);
        });
        continue;
      }
      test(title, async ({ newContext, baseURL }) => {
        const context: BrowserContext = await newContext();
        if (shot.persona === "seeker") await devSignIn(context, "Release Capture Seeker");
        if (shot.persona === "admin") await context.addCookies([{ name: "app_session_id", value: seededAdminCookie(), url: baseURL! }]);
        await capture(await context.newPage(), shot, viewport);
      });
    }
  });
}
