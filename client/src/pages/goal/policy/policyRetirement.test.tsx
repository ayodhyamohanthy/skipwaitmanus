// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import Terms from "@/pages/Terms";
import GuidePage from "@/pages/GuidePage";
import { PolicyPageShell } from "@/components/PolicyPageShell";
import { GUIDES } from "@/content/guides";

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("released policy routes after retirement", () => {
  it("preserves supplied legal words without a surface override", () => {
    window.history.replaceState({}, "", "/terms");
    const legalText = "Synthetic clause retained exactly.";
    const { container } = render(
      <Router ssrPath="/terms">
        <PolicyPageShell screen="terms" eyebrow="Legal" title="Synthetic policy heading." intro="Synthetic intro." updated="2026-01-01" footnote="Synthetic footnote.">
          <p>{legalText}</p>
        </PolicyPageShell>
      </Router>,
    );
    expect(container.querySelector('[data-testid="goal-policy"]')).not.toBeNull();
    const text = container.textContent ?? "";
    for (const phrase of ["Synthetic policy heading", "Synthetic intro.", legalText, "Synthetic footnote."]) {
      expect(text).toContain(phrase);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens a policy on the goal frame without a surface override", () => {
    window.history.replaceState({}, "", "/terms");
    const { container } = render(<Router ssrPath="/terms"><Terms /></Router>);
    expect(container.querySelector('[data-testid="goal-policy"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Know your rights.");
    expect(screen.queryByRole("navigation", { name: "Legal" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens a guide on the goal frame without a surface override", () => {
    const guide = GUIDES[0];
    if (!guide) throw new Error("The guide catalog must contain a route");
    window.history.replaceState({}, "", guide.route);
    const { container } = render(<Router ssrPath={guide.route}><GuidePage /></Router>);
    expect(container.querySelector('[data-testid="goal-policy"]')).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("navigation", { name: "Other guides" })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("removes the policy feature switch from both route entries", () => {
    for (const file of ["client/src/components/PolicyPageShell.tsx", "client/src/pages/GuidePage.tsx"]) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8"), file).not.toContain("goalSurfaceOn");
    }
  });
});
