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
  "CLAUDE.md", "AGENTS.md", "GEMINI.md", ".github/copilot-instructions.md", "FOR_AI_BUILDERS.md", "LLM_HANDOFF.md",
  "START_HERE.md", "SkipWait-START-HERE.md", "COLLABORATION.md", "README.md", "DESIGN.md", "PRICING.md", "app/docs/handoff/LLM_HANDOFF.md",
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

/**
 * D-083: "build" means the same thing to every agent. Each agent entry doc says,
 * near the top, to run the queue picker and do only the task it prints, so no
 * model picks work on its own.
 */
const AGENT_ENTRY_DOCS = ENTRY_DOCS.filter(file => !["DESIGN.md", "PRICING.md"].includes(file));

describe("the owner's `build` command (D-083)", () => {
  it.each(AGENT_ENTRY_DOCS)("%s tells an agent what `build` means within its first lines", file => {
    const head = readFileSync(path.join(root, file), "utf8").split("\n").slice(0, 8).join("\n");
    expect(head).toContain("`build`");
    expect(head).toContain("node scripts/next-task.mjs --claim");
  });

  it("the brief names the picker and the task list", () => {
    const brief = readFileSync(path.join(root, BRIEF), "utf8");
    expect(brief).toContain("node scripts/next-task.mjs --claim");
    expect(brief).toContain("docs/plans/assignments.json");
  });
});

/**
 * D-085: a claim is free after 2 hours with no push or heartbeat (queue rule 2
 * said 24 hours), and the picker claims on origin, never on `main` first. The
 * old rules must not come back into the brief, the packet index or any agent
 * entry doc, or two agents would follow different rules for the same task.
 */
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const TAKEOVER_DOCS = [BRIEF, "docs/plans/README.md", ...AGENT_ENTRY_DOCS];
const CLAIM_DOCS = [...ENTRY_DOCS, "docs/plans/README.md"];

describe("how agents share the queue (D-085)", () => {
  it.each(TAKEOVER_DOCS)("%s states no 24-hour takeover rule", file => {
    expect(read(file)).not.toMatch(/24 ?h(ours)? (with|pass with) no (new )?commits|until 24 hours pass/i);
  });

  it.each(CLAIM_DOCS)("%s does not send an agent to claim on `main`", file => {
    expect(read(file)).not.toMatch(/on `main` before changing code|pushed to `main`\) before coding|claim it there before coding|old timestamp does not authorize/);
  });

  it("CLAUDE.md gives the CEO its claim name", () => {
    expect(read("CLAUDE.md")).toContain('--claim "Claude Code"');
  });

  it("the hand-over prompt follows the picker over the packet it names", () => {
    expect(read("docs/DELEGATION.md")).toContain("If it prints a different task");
  });
});
