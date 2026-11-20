import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../..");
const retired = ["RequestRow", "RequestSummary"] as const;
const read = (path: string) => readFileSync(join(src, path), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe("D-048-K-inplace: retire unreachable Kit components only", () => {
  it.each(retired)("removes the unused %s component", name => {
    expect(existsSync(join(here, `${name}.tsx`))).toBe(false);
  });

  it("leaves no source import, re-export or dynamic import of either retired module", () => {
    const dangling = sourceFiles(src).flatMap(path => {
      const text = readFileSync(path, "utf8");
      const imports = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["']([^"']+)["']/g)];
      return imports.flatMap(match => retired.some(name => new RegExp(`(?:^|/)${name}(?:\\.[jt]sx?)?$`).test(match[1])) ? [`${path}: ${match[1]}`] : []);
    });
    expect(dangling).toEqual([]);
  });

  it("keeps shared request state components and their active landed-page consumer", () => {
    expect(read("pages/goal/seeker-small/GoalLanded.tsx")).toContain('import { RequestsAlert, RequestsLoading } from "@/components/requests/RequestStates"');
    expect(read("components/requests/RequestStates.tsx")).toContain("export function RequestsLoading");
    expect(read("components/requests/RequestStates.tsx")).toContain("export function RequestsAlert");
    for (const module of ["requestModel.ts", "requestsApi.ts"]) {
      expect(existsSync(join(here, module))).toBe(true);
    }
  });

  it("keeps the company dashboard's response-signal view and its behavioral tests", () => {
    expect(read("pages/CompanyClaim.tsx")).toContain('import { CompanyResponseSignalView } from "@/components/explore/CompanyResponseSignal"');
    expect(read("components/explore/CompanyResponseSignal.tsx")).toContain("export function CompanyResponseSignalView");
    expect(existsSync(join(src, "components/explore/companyResponseSignal.test.tsx"))).toBe(true);
  });
});
