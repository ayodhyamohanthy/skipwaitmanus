import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function lint(files: Record<string, string>): number {
  const dir = mkdtempSync(join(tmpdir(), "deploy-migrations-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  try { execFileSync("bash", ["scripts/lint-deploy-migrations.sh", dir], { stdio: "pipe" }); return 0; }
  catch (error) { return (error as { status: number }).status; }
}

describe("deploy-time migration gate", () => {
  it("accepts the repository's pending migrations", () => {
    expect(() => execFileSync("bash", ["scripts/lint-deploy-migrations.sh"], { stdio: "pipe" })).not.toThrow();
  });
  it("accepts guarded, idempotent SQL", () => {
    expect(lint({ "0100_ok.sql": "CREATE TABLE IF NOT EXISTS `a` (id int);\nSET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_NAME='a' AND COLUMN_NAME='b')=0, 'ALTER TABLE `a` ADD COLUMN `b` int', 'SELECT 1');\nPREPARE st FROM @s; EXECUTE st;\n" })).toBe(0);
  });
  it.each([
    ["0101_create.sql", "CREATE TABLE `a` (id int);"],
    ["0102_alter.sql", "ALTER TABLE `a` ADD COLUMN `b` int;"],
    ["0103_index.sql", "CREATE INDEX `i` ON `a` (`b`);"],
    ["0104_drop.sql", "DROP TABLE IF EXISTS `a`;"],
    ["0105_delete.sql", "DELETE FROM `a`;"],
    ["bad-name.sql", "SELECT 1;"],
  ])("rejects %s", (name, body) => {
    expect(lint({ [name]: body })).toBe(1);
  });
  it("runs before the API deploy and blocks it on failure", () => {
    const workflow = readFileSync(".github/workflows/deploy-api.yml", "utf8");
    expect(workflow).toMatch(/migrate-db:\n[\s\S]*apply-deploy-migrations\.sh/);
    expect(workflow).toMatch(/deploy:\n    needs: migrate-db/);
    expect(workflow).toContain("secrets.SKIPWAIT_DB_PASSWORD");
  });
});
