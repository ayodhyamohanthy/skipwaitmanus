// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const pages = read(".github/workflows/deploy-pages.yml");

describe("SYNC-LOG-off-main deploy audit trail", () => {
  it("never commits or pushes a deploy log to main", () => {
    expect(pages).not.toMatch(/\bgit\s+(?:push|commit)\b/);
    expect(pages).not.toContain("Commit sync log back to main");
    expect(pages).not.toContain("Append sync log");
  });

  it("records every outcome in the run summary between verification and notification", () => {
    const record = pages.match(
      /^      - name: Record sync status in workflow summary\n(?:(?!^      - ).*\n)*/m,
    )?.[0];
    expect(record).toBeDefined();
    expect(record).toMatch(/^        if: always\(\)$/m);
    expect(record).toContain('>> "$GITHUB_STEP_SUMMARY"');
    for (const value of ["github.workflow", "github.sha", "job.status"]) {
      expect(record).toContain("${{ " + value + " }}");
    }
    const verify = pages.indexOf("- name: Verify live site carries the pushed commit");
    const summary = pages.indexOf("- name: Record sync status in workflow summary");
    const notify = pages.indexOf("- name: Notify sync status");
    expect(verify).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(verify);
    expect(notify).toBeGreaterThan(summary);
  });

  it("grants read-only contents while preserving incident and release permissions", () => {
    expect(pages).not.toMatch(/contents:\s*write/);
    const permissions = pages.match(/^permissions:\n(?:[ \t].*\n|\n)*/m)?.[0];
    expect(permissions).toMatch(/^  contents: read$/m);
    expect(permissions).toMatch(/^  issues: write$/m);
    expect(permissions).toMatch(/^  actions: read$/m);
  });

  it("retires the two advisory-only workflows", () => {
    expect(existsSync(resolve(root, ".github/workflows/sync-guard.yml"))).toBe(false);
    expect(existsSync(resolve(root, ".github/workflows/design-gate.yml"))).toBe(false);
  });

  it("removes the obsolete append script and every workflow caller", () => {
    expect(existsSync(resolve(root, "scripts/append-sync-log.sh"))).toBe(false);
    for (const name of readdirSync(resolve(root, ".github/workflows"))) {
      if (!/\.ya?ml$/.test(name)) continue;
      const workflow = read(".github/workflows/" + name);
      expect(workflow, name).not.toContain("append-sync-log");
      expect(workflow, name).not.toContain("docs/SYNC_LOG.md");
    }
  });

  it("documents the run summary rather than an appended repository log", () => {
    const system = read("docs/SYNC_SYSTEM.md");
    expect(system).not.toContain("append docs/SYNC_LOG.md");
    expect(system).toMatch(/GITHUB_STEP_SUMMARY|run summary/);
  });

  it("preserves the release gate, deploy, live verification and incident notification", () => {
    for (const step of [
      "Require green CI on this exact commit",
      "Deploy to Cloudflare Pages",
      "Verify live site carries the pushed commit",
      "Notify sync status",
    ]) {
      expect(pages).toContain("- name: " + step);
    }
  });
});
