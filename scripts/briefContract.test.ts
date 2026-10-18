// @vitest-environment node
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-073: docs/BRIEF.md is the first read for every AI model, so it must stay
 * small enough for a small context window, and every agent entry doc must send
 * a model there before anything else. A brief that grows past the cap, or an
 * entry doc that drops the pointer, fails here instead of silently drifting.
 */
const root = path.resolve(__dirname, "..");
const BRIEF = "docs/BRIEF.md";
const BRIEF_MAX_BYTES = 10 * 1024;
const ENTRY_DOCS = [
  "CLAUDE.md", "AGENTS.md", "GEMINI.md", ".github/copilot-instructions.md",
  "COLLABORATION.md", "README.md", "DESIGN.md", "PRICING.md",
];

describe("the one-page brief for AI models (D-073)", () => {
  it("stays under 10 KB", () => {
    expect(statSync(path.join(root, BRIEF)).size).toBeLessThanOrEqual(BRIEF_MAX_BYTES);
  });

  it("names its sources of truth and the rule that they win", () => {
    const brief = readFileSync(path.join(root, BRIEF), "utf8");
    for (const source of ["docs/DECISIONS.md", "AGENTS.md", "docs/KIT_V4_BUILD_PLAN.md"]) expect(brief).toContain(source);
    expect(brief).toMatch(/they win/);
  });

  it.each(ENTRY_DOCS)("%s points to the brief within its first lines", file => {
    const head = readFileSync(path.join(root, file), "utf8").split("\n").slice(0, 8).join("\n");
    expect(head).toContain("docs/BRIEF.md");
  });
});
