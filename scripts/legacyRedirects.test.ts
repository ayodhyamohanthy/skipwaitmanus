import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pre-v4 routes that kit v4 replaces must keep working as redirects.
 *
 * This is a source-contract test, the same shape as the middleware route table
 * test: the redirects have to be literal `path="..."` strings so that both
 * `functions/_middleware.ts` and `scripts/screen-coverage.mjs` can see them by
 * scanning source. A `path={expr}` renders fine and is invisible to both, which
 * reads as "this route no longer exists" — that mistake is what this guards.
 */
const appTsx = readFileSync(join(__dirname, "..", "client", "src", "App.tsx"), "utf8");

const REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  ["/premium", "/plans"],
  ["/pricing", "/plans"],
  ["/messages", "/inbox"],
  ["/support", "/help"],
  ["/referrer/impact", "/referrer"],
  ["/wall", "/explore"],
  ["/jobs", "/explore"],
];

describe("pre-v4 route retirement", () => {
  it.each(REDIRECTS)("redirects %s to %s", (from, to) => {
    expect(appTsx).toContain(`<Route path="${from}"><Redirect to="${to}" /></Route>`);
  });

  it("uses literal path strings, not a mapped expression", () => {
    // A `.map(([from, to]) => <Route path={from}>` block renders correctly and
    // is invisible to every source-scanning route table in this repository.
    expect(appTsx).not.toMatch(/path=\{from\}/);
  });

  it("keeps /offline routable — it is the service-worker fallback", () => {
    expect(appTsx).toContain('<Route path="/offline" component={Offline}/>');
    expect(appTsx).not.toContain('<Route path="/offline"><Redirect');
  });

  it("no longer renders any of the retired screens", () => {
    for (const component of ["Premium", "Pricing", "Messages", "Support", "ReferrerImpact", "OpportunityWall", "JobExplorer"]) {
      expect(appTsx).not.toContain(`component={${component}}`);
      expect(appTsx).not.toContain(`import("./pages/${component}")`);
    }
  });
});
