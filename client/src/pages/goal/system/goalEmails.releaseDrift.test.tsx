// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

// Retirement keeps the same supplied words on the released frame even when an
// old surface override is present. The two renders retain every original word assertion.
describe("the retired policy switch cannot change the supplied legal words", () => {
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
    expect(container.querySelector('[data-testid="goal-policy"]')).not.toBeNull();
    return (container.textContent ?? "").replace(/\s+/g, " ");
  };

  it("renders the same legal words with or without the retired override", async () => {
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
