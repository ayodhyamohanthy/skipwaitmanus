// D-048-p3-admin-money evidence contract (PR #986 finding 2): every capture
// fixture this row ships must have its own 1280 and 390 image, so a confirm or
// result state can never be claimed as reviewed without pixels to inspect.
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

describe("admin-money capture evidence", () => {
  it("ships fixtures to capture", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map(fixture => [fixture.state, fixture.name] as const))(
    "%s has a 1280 and a 390 capture",
    (state, fixture) => {
      expect(fixture).toMatch(/^admin-money__[\w-]+\.json$/);
      for (const width of [1280, 390]) {
        const file = resolve(captures, `${state}-${width}.png`);
        const header = readFileSync(file).subarray(0, 8);
        expect([...header], `${state}-${width}.png is a PNG`).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(statSync(file).size, `${state}-${width}.png is not empty`).toBeGreaterThan(1024);
      }
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