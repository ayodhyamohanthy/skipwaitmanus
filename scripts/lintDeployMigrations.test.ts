// @vitest-environment node
// FIX-migration-lint-bash32 (agent report, Nov 26 2026): the deploy-migration lint must run on macOS Bash 3.2, which
// has no associative arrays, and keep every check it had.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "lint-deploy-migrations.sh");
const GUARDED = "SET @s = IF((SELECT 1), 'SELECT 1', 'SELECT 1'); PREPARE s FROM @s; EXECUTE s;\n";
const lint = (files: Record<string, string>) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mig-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
  const run = spawnSync("bash", [SCRIPT, dir], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

describe("lint-deploy-migrations.sh", () => {
  it("uses no Bash 4 associative array, so macOS Bash 3.2 can run it", () => {
    expect(readFileSync(SCRIPT, "utf8")).not.toMatch(/declare\s+-A/);
  });

  it("passes a clean set", () => {
    const run = lint({ "0001_create_a.sql": "CREATE TABLE IF NOT EXISTS a (id INT);\n", "0002_guard_b.sql": GUARDED });
    expect(run.code).toBe(0);
    expect(run.out).not.toContain("::error::");
  });

  it("fails a duplicate number, naming both files", () => {
    const run = lint({ "0007_one.sql": GUARDED, "0007_two.sql": GUARDED, "0008_three.sql": GUARDED });
    expect(run.code).toBe(1);
    expect(run.out).toContain("duplicate migration number 0007: 0007_two.sql conflicts with 0007_one.sql");
  });

  it.each([
    ["Bad-Name.sql", GUARDED, "must be named NNNN_snake_case.sql"],
    ["0003_drop.sql", "DROP TABLE users;\n", "contains a destructive statement"],
    ["0004_bare.sql", "CREATE TABLE b (id INT);\n", "CREATE TABLE must use IF NOT EXISTS"],
    ["0005_alter.sql", "ALTER TABLE b ADD COLUMN c INT;\n", "must be guarded by information_schema"],
  ])("still fails %s", (name, body, message) => {
    const run = lint({ [name]: body });
    expect(run.code).toBe(1);
    expect(run.out).toContain(message);
  });
});
