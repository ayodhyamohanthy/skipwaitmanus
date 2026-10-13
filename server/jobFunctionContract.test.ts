import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { jobs } from "../drizzle/schema";
import {
  JOB_FUNCTION_SOURCES,
  JOB_FUNCTIONS,
  JOB_LEVELS,
  REFERRER_AREAS,
  askJobFunctionInputSchema,
  displayJobFunction,
  functionEyebrow,
  jobFunctionFieldSchema,
  jobFunctionSchema,
  parseJobFunction,
  parseReferrerAreas,
  referrerAreasInputSchema,
  referrerLevelsInputSchema,
  withParsedJobFunction,
} from "../shared/jobFunctions";
import { DESIRED_COLUMNS, DESIRED_INDEXES } from "./schemaReconcile";

const migration = readFileSync(join(__dirname, "..", "drizzle", "deploy", "0077_job_function.sql"), "utf8");

describe("job function taxonomy contract", () => {
  it("is the kit list plus an explicit Other, each once", () => {
    expect(JOB_FUNCTIONS).toEqual(["Engineering", "Product", "Design", "Data", "Marketing", "Operations", "Sales", "Finance", "HR", "Other"]);
    expect(new Set(JOB_FUNCTIONS).size).toBe(JOB_FUNCTIONS.length);
    expect(REFERRER_AREAS).toEqual(JOB_FUNCTIONS.filter(item => item !== "Other"));
    expect(JOB_LEVELS).toEqual(["Intern", "Early career", "Mid-level", "Senior", "Lead+"]);
  });

  it("accepts only listed, exactly spelled functions", () => {
    expect(jobFunctionSchema.safeParse("Design").success).toBe(true);
    for (const bad of ["design", "DESIGN", " Design", "Astrology", "", 3, null, ["Design"]]) expect(jobFunctionSchema.safeParse(bad).success).toBe(false);
    expect(askJobFunctionInputSchema.safeParse(undefined).success).toBe(true);
    expect(askJobFunctionInputSchema.safeParse(null).success).toBe(true);
    expect(askJobFunctionInputSchema.safeParse("Other").success).toBe(true);
    expect(askJobFunctionInputSchema.safeParse("Ops").success).toBe(false);
  });

  it("reads stored and received values leniently: unknown becomes null", () => {
    expect(parseJobFunction("Data")).toBe("Data");
    expect(parseJobFunction("data")).toBeNull();
    expect(parseJobFunction(null)).toBeNull();
    expect(parseJobFunction(undefined)).toBeNull();
    expect(jobFunctionFieldSchema.parse("Sales")).toBe("Sales");
    expect(jobFunctionFieldSchema.parse("Growth hacking")).toBeNull();
    expect(jobFunctionFieldSchema.parse(undefined)).toBeNull();
  });

  it("gives every response row a normalized jobFunction key", () => {
    expect(withParsedJobFunction({ id: 1, jobFunction: "Design" })).toEqual({ id: 1, jobFunction: "Design" });
    expect(withParsedJobFunction({ id: 2, jobFunction: "Astrology" })).toEqual({ id: 2, jobFunction: null });
    expect(withParsedJobFunction({ id: 3, jobFunction: 7 })).toEqual({ id: 3, jobFunction: null });
    expect(withParsedJobFunction({ id: 4 })).toEqual({ id: 4, jobFunction: null });
  });

  it("validates referrer areas and levels as unique listed values", () => {
    expect(referrerAreasInputSchema.safeParse([]).success).toBe(true);
    expect(referrerAreasInputSchema.safeParse(["Design", "Data"]).success).toBe(true);
    expect(referrerAreasInputSchema.safeParse([...REFERRER_AREAS]).success).toBe(true);
    for (const bad of ["Design", ["Design", "Design"], ["Other"], ["design"], ["Design", 4], null]) expect(referrerAreasInputSchema.safeParse(bad).success).toBe(false);
    expect(referrerLevelsInputSchema.safeParse(["Senior", "Lead+"]).success).toBe(true);
    for (const bad of ["Senior", ["Senior", "Senior"], ["Principal"]]) expect(referrerLevelsInputSchema.safeParse(bad).success).toBe(false);
    expect(parseReferrerAreas(["Design", "Other", "Astrology", "Design", "Data"])).toEqual(["Design", "Data"]);
  });

  it("names the function before the company, and never shows Other", () => {
    expect(functionEyebrow("Design", "Wipro")).toBe("Design · Wipro");
    expect(functionEyebrow(null, "Wipro")).toBe("Wipro");
    expect(functionEyebrow(undefined, "acme.io")).toBe("acme.io");
    expect(functionEyebrow("Other", "Wipro")).toBe("Wipro");
    expect(displayJobFunction("Data")).toBe("Data");
    expect(displayJobFunction("Other")).toBeNull();
    expect(displayJobFunction(null)).toBeNull();
  });
});

describe("jobs.jobFunction persistence contract (0077)", () => {
  it("declares the columns and index in drizzle/schema.ts", () => {
    expect(jobs.jobFunction.columnType).toBe("MySqlVarChar");
    expect(jobs.jobFunction.notNull).toBe(false);
    expect(Math.max(...JOB_FUNCTIONS.map(item => item.length))).toBeLessThanOrEqual(32);
    expect(jobs.jobFunctionSource.enumValues).toEqual([...JOB_FUNCTION_SOURCES]);
    expect(jobs.jobFunctionSource.notNull).toBe(false);
    const index = getTableConfig(jobs).indexes.find(item => item.config.name === "jobs_company_function_idx");
    expect(index?.config.columns.map(column => ("name" in column ? column.name : ""))).toEqual(["company", "jobFunction"]);
  });

  it("adds them in the deploy migration, guarded and additive", () => {
    expect(migration).toContain("ADD COLUMN `jobFunction` VARCHAR(32) NULL");
    expect(migration).toContain(`ADD COLUMN \`jobFunctionSource\` ENUM(${JOB_FUNCTION_SOURCES.map(value => `''${value}''`).join(",")}) NULL`);
    expect(migration).toContain("CREATE INDEX `jobs_company_function_idx` ON `jobs` (`company`, `jobFunction`)");
    expect(migration.replace(/--.*$/gm, "").match(/information_schema/g)).toHaveLength(3);
    expect(migration.replace(/--.*$/gm, "")).not.toMatch(/\b(UPDATE|INSERT|DELETE|DROP)\b/i);
  });

  it("is required by boot validation exactly as the migration creates it", () => {
    expect(DESIRED_COLUMNS).toContainEqual({ table: "jobs", column: "jobFunction", definition: "VARCHAR(32) NULL" });
    expect(DESIRED_COLUMNS).toContainEqual({ table: "jobs", column: "jobFunctionSource", definition: `ENUM(${JOB_FUNCTION_SOURCES.map(value => `'${value}'`).join(",")}) NULL` });
    expect(DESIRED_INDEXES).toContainEqual({ table: "jobs", name: "jobs_company_function_idx", columns: "`company`,`jobFunction`", nonUnique: true });
  });
});
