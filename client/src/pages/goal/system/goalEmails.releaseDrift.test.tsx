// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

// R7 prep, second property: switching the `policy` surface changes chrome only. The shell hands the goal page the
// SAME title, intro, summary, sections and children, so every legal word a reader sees must be identical in both
// modes; this renders the shell twice against one synthetic policy body and compares the words.
describe("R7 prep: the policy shell never changes a legal word when the surface is on", () => {
  const LEGAL_TITLE = "Synthetic policy heading.";
  const LEGAL_INTRO = "Synthetic intro paragraph for the R7 prep equality check.";
  const LEGAL_BODY = "Synthetic clause one. Synthetic clause two stays identical in both modes.";
  const LEGAL_FOOTNOTE = "Synthetic footnote.";
  const renderShell = async (surfaces: string) => {
    vi.stubEnv("VITE_GOAL_SURFACES", surfaces);
    const { PolicyPageShell } = await import("@/components/PolicyPageShell");
    const { container } = render(
      <PolicyPageShell screen="privacy" eyebrow="Legal" title={LEGAL_TITLE} intro={LEGAL_INTRO} updated="2026-01-01" sections={[{ id: "s1", label: "One" }]} footnote={LEGAL_FOOTNOTE}>
        <p>{LEGAL_BODY}</p>
      </PolicyPageShell>,
    );
    return (container.textContent ?? "").replace(/\s+/g, " ");
  };

  it("renders the same legal words with the surface off and on", async () => {
    const off = await renderShell("");
    cleanup();
    const on = await renderShell("policy");
    cleanup();
    for (const text of [LEGAL_TITLE.replace(/\.$/, ""), LEGAL_INTRO, LEGAL_BODY, LEGAL_FOOTNOTE]) {
      expect(off, `kit mode lost "${text}"`).toContain(text);
      expect(on, `goal mode lost "${text}"`).toContain(text);
    }
  });
});
