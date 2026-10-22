import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { seekerLevels } from "../drizzle/schema";

describe("seekerLevels (0107, D-148)", () => {
  it("is a standalone additive table with one row per user", () => {
    expect(getTableName(seekerLevels)).toBe("seekerLevels");
    expect(Object.keys(getTableColumns(seekerLevels)).sort()).toEqual(["id", "level", "updatedAt", "userId"]);
  });
  it("migration only creates the table (additive)", () => {
    const sql = readFileSync("drizzle/deploy/0107_seeker_levels.sql", "utf8").replace(/^--.*$/gm, "");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `seekerLevels`/);
    expect(sql).not.toMatch(/\b(ALTER|DROP|INSERT|TRUNCATE)\b/i);
  });
  it("router exposes level and setLevel with a 1-10 bound", () => {
    const src = readFileSync("server/routers.ts", "utf8");
    expect(src).toContain("setLevel: protectedProcedure.input(z.object({ level: z.number().int().min(1).max(10).nullable() }))");
  });
});
