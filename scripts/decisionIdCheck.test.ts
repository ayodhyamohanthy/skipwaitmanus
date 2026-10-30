import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decisionIdViolations, decisionRows } from "./decision-id-check.mjs";

// PROCESS-id-check (D-166, docs/plans/PROCESS-gates.md): a decision ID or a deploy migration
// number never lands twice. D-155/D-156 collided twice and 0108 three times on Oct 23.
const HEADER = "| ID | Date | Decision |\n|---|---|---|\n";
const row = (id: string, text: string) => `| ${id} | 2026-10-30 | ${text} |`;
const register = (...rows: string[]) => `# Decisions\n\n${HEADER}${rows.join("\n")}\n`;

const D1 = row("D-001", "**The first decision.**");
const D2 = row("D-002", "**The second decision.**");
const D3 = row("D-003", "**A third decision landed on main, long enough that its first hundred and twenty characters end inside the text.** Detail.");
const D3_OTHER = row("D-003", "**A different third decision on this branch.**");

const MAIN_MIGRATIONS = ["drizzle/deploy/0001_init.sql", "drizzle/deploy/0002_users.sql"];

const check = (over: Partial<Parameters<typeof decisionIdViolations>[0]> = {}) => decisionIdViolations({
  base: register(D1, D2),
  main: register(D1, D2),
  head: register(D1, D2),
  baseMigrations: MAIN_MIGRATIONS,
  mainMigrations: MAIN_MIGRATIONS,
  headMigrations: MAIN_MIGRATIONS,
  ...over,
});

describe("PROCESS-id-check", () => {
  it("reads only the IDs that open a table row", () => {
    const text = register(D1, D2) + "\nSee D-003 in prose, and | not D-004 | mid-line.\n";
    expect(decisionRows(text).map(r => r.id)).toEqual(["D-001", "D-002"]);
  });

  it("passes a clean addition of the next ID", () => {
    expect(check({ head: register(D1, D2, D3) })).toEqual([]);
  });

  it("fails when the head has an ID twice, and names the next free ID on main", () => {
    const violations = check({ head: register(D1, D2, row("D-002", "**A second D-002.**")) });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("D-002");
    expect(violations[0]).toContain("D-003");
  });

  it("fails on a collision: an ID the branch adds is already on main with different text", () => {
    const violations = check({ main: register(D1, D2, D3), head: register(D1, D2, D3_OTHER) });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("D-003");
    expect(violations[0]).toContain("D-004");
  });

  it("passes the same row merged twice (same first 120 characters on main and the head)", () => {
    const sameStart = `${D3.slice(0, 120)} a later wording past the first 120 characters, which may differ. |`;
    expect(check({ main: register(D1, D2, D3), head: register(D1, D2, sameStart) })).toEqual([]);
  });

  it("does not treat an edit of an existing decision as a collision", () => {
    const edited = row("D-002", "**The second decision, amended.**");
    expect(check({ main: register(D1, D2, D3), head: register(D1, edited) })).toEqual([]);
  });

  it("passes a new migration with the next free number", () => {
    expect(check({ headMigrations: [...MAIN_MIGRATIONS, "drizzle/deploy/0003_asks.sql"] })).toEqual([]);
  });

  it("fails a new migration whose number main already uses, and names the next free number", () => {
    const violations = check({
      mainMigrations: [...MAIN_MIGRATIONS, "drizzle/deploy/0003_credits.sql"],
      headMigrations: [...MAIN_MIGRATIONS, "drizzle/deploy/0003_asks.sql"],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("0003");
    expect(violations[0]).toContain("0004");
  });

  it("passes the same migration file already landed on main", () => {
    const landed = [...MAIN_MIGRATIONS, "drizzle/deploy/0003_asks.sql"];
    expect(check({ mainMigrations: landed, headMigrations: landed })).toEqual([]);
  });

  it("main's own register and deploy migrations have no duplicates today", () => {
    const text = readFileSync("docs/DECISIONS.md", "utf8");
    const migrations = readdirSync("drizzle/deploy").map(name => `drizzle/deploy/${name}`);
    expect(decisionRows(text).length).toBeGreaterThan(100);
    expect(decisionIdViolations({ base: text, main: text, head: text, baseMigrations: migrations, mainMigrations: migrations, headMigrations: migrations })).toEqual([]);
  });
});
