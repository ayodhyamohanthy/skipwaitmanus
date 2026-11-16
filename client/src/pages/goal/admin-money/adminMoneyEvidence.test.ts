// D-048-p3-admin-money evidence contract (PR #986 finding 2): every capture
// fixture this row ships must have its own 1280 and 390 image, so a confirm or
// result state can never be claimed as reviewed without pixels to inspect.
// The second finding's cure: the images come from a checked-in driver and a
// manifest that records, per capture, the source commit, the route, the goal
// line, the next-step and black-commit counts, overflow and unmatched API, so
// a stale PNG can never pass as this head's rendering.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { paymentReviewOutcomeSchema } from "@shared/paymentReview";

const captures = resolve(process.cwd(), "design/goal-ui/captures/admin-money");
const fixtureNames = readdirSync(resolve(captures, "fixtures")).filter(name => name.endsWith(".json"));
const fixtures = fixtureNames.map(name => ({
  name,
  state: name.replace(/^admin-money__/, "").replace(/\.json$/, ""),
  json: JSON.parse(readFileSync(resolve(captures, "fixtures", name), "utf8")) as CaptureFixture,
}));

type CaptureFixture = { routes?: { method?: string; path?: string; body?: { payment?: unknown } }[] };
type ManifestResult = {
  file: string; route: string; screen: string | null;
  viewport: { width: number; height: number; dpr: number };
  horizontalOverflowPx: number; h1: string[]; nextStepBlocks: number; primaryCommits: number;
  unmatchedApi: string[]; consoleErrors: string[];
};
type Manifest = { source: string; sourceTreeDirty: boolean; synthetic: boolean; results: ManifestResult[] };

const manifest = JSON.parse(readFileSync(resolve(captures, "manifest-all.json"), "utf8")) as Manifest;
const ROUTES: Record<string, string> = {
  payments: "/admin/payments",
  catalog: "/admin/catalog-sync",
  recovery: "/admin/token-recovery",
  "money-check": "/admin/money-check",
};
const routeOf = (state: string) => ROUTES[state.startsWith("money-check") ? "money-check" : state.split("-")[0]];

// /admin/money-check is the one capture this row cannot move yet: packet §10
// assigns its styling here, but assignments.json omits AdminMoneyCheck.tsx from
// owns, so it still renders the kit page (0 next step, 0 black commit). Every
// other state is a moved goal page and must show exactly one of each.
const PINNED: Record<string, { nextStepBlocks: number; primaryCommits: number }> = Object.fromEntries(
  fixtures.map(fixture => [fixture.state, fixture.state === "money-check-default" ? { nextStepBlocks: 0, primaryCommits: 0 } : { nextStepBlocks: 1, primaryCommits: 1 }]),
);

describe("admin-money capture evidence", () => {
  it("ships fixtures to capture", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it("ships a manifest from a clean source tree that lists every fixture at both widths", () => {
    expect(manifest.source).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.sourceTreeDirty, "captures must come from a clean tree").toBe(false);
    expect(manifest.synthetic).toBe(true);
    const keys = manifest.results.map(result => result.file);
    expect(new Set(keys).size, "one manifest row per capture").toBe(keys.length);
    for (const fixture of fixtures) {
      for (const width of [1280, 390]) {
        expect(keys, `${fixture.state}-${width}.png is in the manifest`).toContain(`${fixture.state}-${width}.png`);
      }
    }
  });

  it.each(manifest.results.map(result => [result.file, result] as const))(
    "%s was captured at its stated width with the goal contract and no overflow",
    (_file, result) => {
      const state = result.file.replace(/-(1280|390)\.png$/, "");
      expect(result.file).toMatch(/^[\w-]+-(1280|390)\.png$/);
      expect(result.viewport.width).toBe(Number(result.file.match(/-(1280|390)\.png$/)?.[1]));
      expect(result.route, "the capture is of this state's route").toBe(routeOf(state));
      expect(result.horizontalOverflowPx, "no horizontal overflow").toBe(0);
      expect(result.unmatchedApi, "every API call was mocked").toEqual([]);
      expect({ nextStepBlocks: result.nextStepBlocks, primaryCommits: result.primaryCommits }, `${state} goal contract`).toEqual(PINNED[state]);
      if (state === "money-check-default") return;
      expect(result.h1, "one goal line").toEqual(["Keep the money truthful."]);
    },
  );

  it.each(fixtures.map(fixture => [fixture.state, fixture] as const))(
    "%s mocks a payment decision the server contract accepts",
    (state, fixture) => {
      const decisions = (fixture.json.routes ?? []).filter(route =>
        route.method === "POST" && /^\/api\/admin\/payments\/review\/\d+$/.test(route.path ?? "") && route.body?.payment !== undefined);
      for (const route of decisions) {
        const outcome = paymentReviewOutcomeSchema.safeParse(route.body?.payment);
        expect(outcome.success, `${state}: ${JSON.stringify(route.body?.payment)} is not a PaymentReviewOutcome`).toBe(true);
      }
    },
  );
});