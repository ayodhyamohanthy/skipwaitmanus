// @vitest-environment jsdom
// D-048-R7-prep: rendered drift controls for the system surface and the policy chrome. The source-level
// comparison lives in scripts/r7ReleaseAcceptance.test.ts; this file proves the *rendered* goal twin repeats the
// kit page's verified words, and that the policy shell changes chrome only — never a legal word — when the
// `policy` surface is on. It flips no flag and stubs the env per test.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import GoalEmails from "./GoalEmails";

vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const root = path.resolve(__dirname, "../../../../..");
const kitLiterals = (name: string): string[] => {
  const source = readFileSync(path.join(root, "client/src/pages/Emails.tsx"), "utf8");
  const after = source.split(`name: "${name}"`)[1] ?? "";
  const cuts = [after.indexOf('name: "'), after.indexOf("];")].filter(index => index >= 0);
  const scope = after.slice(0, cuts.length ? Math.min(...cuts) : after.length);
  return Array.from(scope.matchAll(/"((?:[^"\\]|\\.)*)"/g)).map(m => m[1]).filter(value => value !== "");
};

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("R7 prep: GoalEmails renders the kit page's verified words", () => {
  it("carries every template the kit page lists, with its verified words rendered once selected", async () => {
    render(<GoalEmails />);
    for (const name of ["Work-email code", "Password reset", "Welcome", "Request claimed", "New message", "Payment receipt / failed"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
      // The verified fields (subject, body, CTA) must appear verbatim; the trigger is a description, and the
      // goal page renders it behind a "Fired when:" prefix, so its substance is checked without the prefix.
      const literals = kitLiterals(name);
      const trigger = literals.find(value => value.startsWith("Sent when "));
      for (const literal of literals.filter(value => value.length > 25 && value !== trigger)) {
        expect(text, `${name}: "${literal}" is missing from the rendered goal page`).toContain(literal.replace(/\s+/g, " "));
      }
      if (trigger) {
        expect(text, `${name}: the trigger description is missing`).toContain(trigger.replace(/^Sent when /, "").replace(/\s+/g, " "));
      }
    }
  });

  it("never promises sending: the page is a reference, not a sender", () => {
    const { container } = render(<GoalEmails />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/we (have )?sent|we will send|delivered to your inbox/i);
  });
});

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
