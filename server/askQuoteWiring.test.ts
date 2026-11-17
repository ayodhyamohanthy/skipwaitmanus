import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * D-132-item3 ruling 8 / GAP 1: the live quote route reads `acceptedCost` from
 * the `previewAskCost` dependency, and production is the only caller that can
 * supply it. A route test cannot see server/_core/index.ts, so this test pins
 * the one registration call from the source: a preview that exists but is
 * never wired is a mock-only quote, not what a seeker's composer sees.
 */

/** The `registerPrivateReferralRoutes(app, { ... })` call in `source`, with its object literal whole. */
function registrationCall(source: string): string {
  const start = source.indexOf("registerPrivateReferralRoutes(");
  expect(start).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  expect(open).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error("registerPrivateReferralRoutes call has no closing brace");
}

describe("D-132-item3 production wiring: the quote's previewAskCost", () => {
  it("passes previewAskCost beside getCreditSummary to the private referral routes", () => {
    const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    const call = registrationCall(source);
    expect(call).toContain("previewAskCost: db.previewAskCost");
    expect(call).toContain("getCreditSummary: db.getTokenWallet");
  });
});
