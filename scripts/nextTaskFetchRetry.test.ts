// @vitest-environment node
// PICKER-fetch-retry (D-324, D-321 (11)): the authoritative ref refresh is the run's first
// network step, and one reset there stopped the whole run:
//   next-task: STOP: authoritative ref refresh failed; check origin access and run again
// Replaying the exact fetch by hand succeeded in 11.7 s, so the failure is transport, not
// permission. This suite fails the fetch through a spawnSync shim, so the real picker CLI is
// exercised: one reset must be absorbed, every fetch failing must still stop the run.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { FETCH_ATTEMPTS, fetchAttemptsFor } from "./next-task.mjs";

const CLI = fileURLToPath(new URL("./next-task.mjs", import.meta.url));
const dirs: string[] = [];
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })));

/** A real clone against a bare origin, plus a preload that fails the first `failFirst` fetches. */
function fixture(failFirst: number) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fetch-retry-"));
  dirs.push(dir);
  const work = path.join(dir, "work"), remote = path.join(dir, "origin.git"), mock = path.join(dir, "mock.mjs");
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: "pipe" }).trim();
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("remote", "add", "origin", remote);
  writeFileSync(path.join(work, "docs/plans/test.md"), "# Fixture\n");
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({
    version: 1, repo: "o/r",
    tasks: [{ id: "A", title: "Fixture task", row: "A", packet: "docs/plans/test.md", tier: 2, lane: "a",
      branch: "agent/queue/a", status: "todo", dependsOn: [], syncedTo: "D-001" }],
  }));
  writeFileSync(path.join(work, "docs/DECISIONS.md"), ["# Decisions", "| ID | Date | Decision | Evidence | Notes | Status |",
    "|---|---|---|---|---|---|", "| D-001 | 2026-11-20 | Fixture | e | Affects tasks: none. | adopted |", ""].join("\n"));
  git("add", "docs"); git("commit", "-m", "fixture"); git("push", "-u", "origin", "main");
  writeFileSync(mock, `
import cp from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const real = cp.spawnSync;
let fetches = 0;
cp.spawnSync = (command, args, options) => {
  const list = Array.isArray(args) ? args : [];
  if (command === 'git' && list.includes('fetch')) {
    fetches += 1;
    appendFileSync(${JSON.stringify(path.join(dir, "fetches.log"))}, "fetch\\n");
    if (fetches <= ${failFirst}) {
      return { error: undefined, status: 128, stdout: '', stderr: 'fatal: unable to access remote: Connection reset by peer' };
    }
  }
  return real(command, args, options);
};
// The picker imports spawnSync as a named ESM binding, so the patched property must be re-exported.
syncBuiltinESMExports();
`);
  const fetches = () => {
    try { return readFileSync(path.join(dir, "fetches.log"), "utf8").split("\n").filter(Boolean).length; }
    catch { return 0; }
  };
  const picker = (args: string[]) => spawnSync(process.execPath, ["--import", mock, CLI, ...args], {
    cwd: work, encoding: "utf8", env: { ...process.env, GH_TOKEN: "fixture-not-real", NODE_USE_ENV_PROXY: "1" },
  });
  return { dir, picker, fetches };
}

describe("the authoritative ref refresh survives a dropped fetch", () => {
  it("retries the fetch and finishes the run instead of stopping it", () => {
    const f = fixture(1);
    const res = f.picker(["--as", "Fixture · refs"]);
    const out = `${res.stdout}\n${res.stderr}`;
    expect(out).not.toContain("authoritative ref refresh failed");
    expect(out).toContain("NEXT:");
    // The failure actually happened and the run continued: at least the failed fetch plus a retry.
    expect(f.fetches()).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it("still stops the run when every fetch fails, so unknown stays unknown", () => {
    const f = fixture(99);
    const res = f.picker(["--as", "Fixture · refs"]);
    const out = `${res.stdout}\n${res.stderr}`;
    expect(out).toContain("authoritative ref refresh failed");
    expect(res.status).toBe(2);
    // Bounded: every attempt failed and no further attempt was made.
    expect(f.fetches()).toBe(FETCH_ATTEMPTS);
  }, 120_000);
});

describe("the fetch retry policy", () => {
  it("is bounded, so a real outage cannot spin", () => {
    expect(FETCH_ATTEMPTS).toBe(3);
    expect(fetchAttemptsFor(0, 3)).toBe(1);
    expect(fetchAttemptsFor(1, 3)).toBe(2);
    expect(fetchAttemptsFor(2, 3)).toBe(3);
    expect(fetchAttemptsFor(3, 3)).toBe(3);
    expect(fetchAttemptsFor(Number.POSITIVE_INFINITY, 3)).toBe(3);
  });
});
