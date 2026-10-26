import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * D-132 review F4: the v2 money paths must narrow values by checking them, never
 * by asserting them. `as unknown as`, a cast to a money type and `value!` all
 * turn a wrong assumption into a credited or charged amount at runtime, so this
 * static check fails when one reappears in the files that decide money.
 */

const CHECKED = [
  { label: "`as unknown as` double assertion", pattern: /as\s+unknown\s+as/ },
  { label: "non-null assertion", pattern: /[\w\])]!(?=[\s.,;)\]])/ },
  { label: "cast to a money type", pattern: /as\s+(?:BillingCurrency|PlanCreditRung|"INR"\s*\|\s*"USD"|"fast_track"\s*\|\s*"insider")/ },
];

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `start marker not found: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `end marker not found: ${end}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

function uncheckedAssertions(source: string): string[] {
  const findings: string[] = [];
  source.split("\n").forEach((line, index) => {
    const code = line.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
    for (const check of CHECKED) {
      if (check.pattern.test(line)) findings.push(`${index + 1}: ${check.label}: ${code}`);
    }
  });
  return findings;
}

describe("v2 money paths carry no unchecked assertions (D-132 review F4)", () => {
  it("shared/planFamilyBilling.ts", () => {
    expect(uncheckedAssertions(read("../shared/planFamilyBilling.ts"))).toEqual([]);
  });

  it("server/v2Checkout.ts", () => {
    expect(uncheckedAssertions(read("./v2Checkout.ts"))).toEqual([]);
  });

  it("server/db.ts grantV2PaidCredits and its replay", () => {
    const source = sliceBetween(read("./db.ts"), "export async function grantV2PaidCredits(", "export async function listRequiresReviewPayments(");
    expect(uncheckedAssertions(source)).toEqual([]);
  });

  it("server/db.ts v2 subscription arm", () => {
    const source = sliceBetween(read("./db.ts"), "if (input.planFamily) {", "// A pass's term is part of what was bought");
    expect(uncheckedAssertions(source)).toEqual([]);
  });
});
