import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const [logPath] = process.argv.slice(2);
assert.ok(logPath, "provide the completed full-local Vitest log");
const log = (await readFile(logPath, "utf8")).replace(/\u001b\[[0-9;]*m/g, "");
const files = /^\s*Test Files\s+(.+)$/m.exec(log)?.[1];
const tests = /^\s*Tests\s+(.+)$/m.exec(log)?.[1];
const durationSeconds = /^\s*Duration\s+([\d.]+)s/m.exec(log)?.[1];
const failures = [...log.matchAll(/^ FAIL\s+([^\n]+)$/gm)].map(match => match[1].trim());
assert.ok(files && tests && durationSeconds);
assert.equal(failures.length, 2);
assert.match(files, /2 failed \| 736 passed \| 5 skipped \(743\)/);
assert.match(tests, /2 failed \| 7750 passed \| 18 skipped \(7770\)/);
const unchangedPaths = ["scripts/classifyCiChange.test.ts", "server/referrerStepUp.test.ts"];
for (const path of unchangedPaths) execFileSync("git", ["diff", "--exit-code", "origin/main", "--", path]);
const result = {
  task: "D-048-K-inplace",
  command: "LANG=en_US.UTF-8 pnpm vitest run --maxWorkers=1",
  startedSource: "83fe7c261",
  completedSource: "cc823debb025571651d7f8eca5abd48a1bd12ca1",
  result: "failed",
  exitCode: 1,
  testFiles: { failed: 2, passed: 736, skipped: 5, total: 743 },
  tests: { failed: 2, passed: 7750, skipped: 18, total: 7770 },
  durationSeconds: Number(durationSeconds),
  failures,
  observedError: "Both final failure blocks report: Error: Test timed out in 20000ms.",
  unchangedFailingTestPaths: unchangedPaths,
  limitations: [
    "No failed test was rerun, skipped or changed; no timeout was increased.",
    "Unchanged test files do not prove the failures are pre-existing, harmless or caused by machine load. Cause is not established by this result.",
    "The separate earlier focused timeout, successful 12-test run, compiler, builds and synthetic parity are distinct outcomes; none turns this full-local result green.",
    "Required exact-head CI and canonical acceptance are not supplied by this local receipt.",
  ],
};
await writeFile("docs/evidence/D-048-K-inplace/local-gate.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ result: result.result, files, tests, durationSeconds: result.durationSeconds }));
