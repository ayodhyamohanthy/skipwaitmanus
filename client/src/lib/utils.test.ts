// The merge helper must keep the goal-UI type tokens and colour tokens apart
// (DESIGN.md type scale). tailwind-merge treats every unknown `text-*` as a
// colour, so without the goal font-size group a primitive that paired
// `text-g-label` with `text-g-ink` silently lost its type size — the goal kit
// rendered at 16px instead of 14px. This pins the fix.
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a goal type token and a goal colour token together", () => {
    const classes = cn("text-g-label font-medium text-g-ink-2");
    expect(classes).toContain("text-g-label");
    expect(classes).toContain("text-g-ink-2");
  });

  it("still merges two goal colour tokens, last one wins", () => {
    expect(cn("text-g-ink-2 text-g-ink")).toBe("text-g-ink");
  });

  it("still merges two font sizes, last one wins", () => {
    expect(cn("text-sm text-lg")).toBe("text-lg");
  });

  it("keeps Kit v4 behaviour untouched", () => {
    expect(cn("px-2 px-4")).toBe("px-4");
    expect(cn("text-sm text-white")).toBe("text-sm text-white");
  });
});
