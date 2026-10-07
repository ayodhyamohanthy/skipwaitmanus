import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/screen-coverage.mjs";

const run = (file = SCRIPT) => {
  try {
    const out = execFileSync("node", [file], { stdio: "pipe" }).toString();
    return { status: 0, out };
  } catch (error) {
    const failure = error as { status: number; stdout?: Buffer; stderr?: Buffer };
    return { status: failure.status, out: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
};

/**
 * Writes a mutated copy of the guard and returns its path.
 *
 * The `expect(mutated).not.toBe(source)` assertion matters: a mutation that
 * silently fails to apply would run the UNCHANGED guard, see it pass, and
 * report the guard as "working" when nothing was tested at all.
 */
const mutate = (from: string, to: string) => {
  const source = readFileSync(SCRIPT, "utf8");
  const mutated = source.replace(from, to);
  expect(mutated, `mutation did not apply: ${from}`).not.toBe(source);
  const file = `scripts/.screen-coverage.mutation-${Math.random().toString(36).slice(2)}.mjs`;
  writeFileSync(file, mutated);
  return file;
};

const withMutation = (from: string, to: string, assertion: (result: { status: number; out: string }) => void) => {
  const file = mutate(from, to);
  try {
    assertion(run(file));
  } finally {
    unlinkSync(file);
  }
};

describe("kit v4 screen coverage ratchet", () => {
  it("passes at the committed baseline", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.out).toMatch(/kit v4 screen coverage: \d+\/42 designed routes reachable/);
  });

  it("accounts for every designed screen: none unmapped, none dangling", () => {
    const parsed = JSON.parse(execFileSync("node", [SCRIPT, "--json"], { stdio: "pipe" }).toString());
    expect(parsed.designed).toBe(42);
    expect(parsed.unmapped).toEqual([]);
    expect(parsed.dangling).toEqual([]);
    expect(parsed.implemented).toBeGreaterThanOrEqual(parsed.baseline);
  });

  it("fails when coverage drops below the baseline", () => {
    // Mutation: demand more coverage than exists, which is what a deleted
    // screen would look like.
    withMutation("export const BASELINE_IMPLEMENTED = 29;", "export const BASELINE_IMPLEMENTED = 999;", result => {
      expect(result.status).toBe(1);
      expect(result.out).toMatch(/coverage regressed/);
    });
  });

  it("fails when a mapping points at a route that does not exist", () => {
    // Mutation: break a live pointer. Without the dangling check this would
    // read as covered while the screen 404s.
    withMutation('"report": "/report",', '"report": "/report-that-does-not-exist",', result => {
      expect(result.status).toBe(1);
      expect(result.out).toMatch(/no longer declares/);
    });
  });

  it("fails when a designed route loses its mapping entirely", () => {
    // Mutation: drop a designed route from the table. New kit screens must not
    // be able to arrive unnoticed.
    withMutation('"verify": "/verify",', '"verify-renamed-in-kit": "/verify",', result => {
      expect(result.status).toBe(1);
      expect(result.out).toMatch(/no mapping in DESIGNED_ROUTES/);
    });
  });
});
