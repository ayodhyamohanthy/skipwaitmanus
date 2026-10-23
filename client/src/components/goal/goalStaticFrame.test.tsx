// D-048-F-static-frame: the frame fetches nothing, renders its children, and
// carries the goal frame's header/footer text (packet §7).
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalStaticFrame } from "./GoalStaticFrame";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GoalStaticFrame", () => {
  it("fetches nothing while rendering", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(
      <GoalStaticFrame status="Free to read">
        <h1>Know your rights.</h1>
      </GoalStaticFrame>,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).toContain("Know your rights.");
  });

  it("renders the goal frame chrome: wordmark, nav, status dot+text, policy footer", () => {
    const html = renderToStaticMarkup(
      <GoalStaticFrame status="Free to read">
        <p>body</p>
      </GoalStaticFrame>,
    );
    expect(html).toContain('alt="skipwait.me"');
    expect(html).toContain("Explore companies");
    expect(html).toContain("Sign in");
    expect(html).toContain("Free to read");
    for (const label of ["Terms", "Privacy", "Refunds", "Cancellations", "Shipping", "About", "Contact", "Support", "Guidelines"]) {
      expect(html).toContain(label);
    }
    // No credits pill, no auth affordances beyond the sign-in link.
    expect(html).not.toContain("goal-credits-pill");
  });

  it("uses goal tokens only (no hex literals in the frame source)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(__dirname, "GoalStaticFrame.tsx"), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
