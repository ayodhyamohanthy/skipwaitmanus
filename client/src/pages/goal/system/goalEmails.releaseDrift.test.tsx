// @vitest-environment jsdom
// D-048-R7-prep: rendered drift controls for the system surface and the policy chrome. The source-level
// comparison lives in scripts/r7ReleaseAcceptance.test.ts; this file proves the *rendered* goal twin repeats the
// kit page's verified sender words, carries the corrected referral labels (D-173/D-180, landed 934a6bfc), and
// that the policy shell changes chrome only — never a legal word — when the `policy` surface is on. It flips no
// flag and stubs the env per test.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import GoalEmails from "./GoalEmails";

vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const root = path.resolve(__dirname, "../../../../..");
const readKit = () => readFileSync(path.join(root, "client/src/pages/Emails.tsx"), "utf8");
const readGoal = () => readFileSync(path.join(root, "client/src/pages/goal/system/GoalEmails.tsx"), "utf8");

const entryScope = (source: string, name: string): string => {
  const start = source.indexOf(`name: "${name}"`);
  if (start < 0) return "";
  const rest = source.slice(start);
  const next = rest.indexOf('name: "', 1);
  return next > 0 ? rest.slice(0, next) : rest;
};
const field = (scope: string, key: string): string | undefined => {
  const match = new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(scope);
  return match?.[1];
};
const kitTemplate = (name: string) => {
  const scope = entryScope(readKit(), name);
  const body = /body:\s*\[((?:[^\]])*)\]/.exec(scope);
  return {
    subject: field(scope, "subject"),
    body: body ? Array.from(body[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)).map(m => m[1]) : [],
    cta: field(scope, "cta"),
  };
};
const goalTrigger = (name: string) => field(entryScope(readGoal(), name), "trigger") ?? "";

const TEMPLATE_NAMES = [
  "Work-email code",
  "Password reset",
  "Welcome",
  "Request claimed",
  "Referral accepted",
  "Referral passed",
  "New message",
  "Payment receipt / failed",
];

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("R7 prep: GoalEmails renders the kit page's verified words", () => {
  it("carries every template the kit page lists, with its verified sender words rendered once selected", () => {
    render(<GoalEmails />);
    for (const name of TEMPLATE_NAMES) {
      fireEvent.click(screen.getByRole("button", { name }));
      const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
      // The verified sender fields (subject, body, CTA) must appear verbatim. The trigger is a description the
      // goal page renders behind a "Fired when:" prefix (or as the body when the template has no sender body),
      // so it is checked against the goal page's own corrected description instead of the kit's retired noun.
      const kit = kitTemplate(name);
      const senderWords = [kit.subject, ...kit.body, kit.cta].filter(
        (value): value is string => typeof value === "string" && value.length > 25,
      );
      for (const literal of senderWords) {
        expect(text, `${name}: "${literal}" is missing from the rendered goal page`).toContain(literal.replace(/\s+/g, " "));
      }
      expect(text, `${name}: its own description is missing from the rendered goal page`).toContain(
        goalTrigger(name).replace(/^Sent when /, "").replace(/\s+/g, " "),
      );
    }
  });

  it("pins the referral labels and keeps the retired nouns off the rendered page", () => {
    const { container } = render(<GoalEmails />);
    const text = container.textContent ?? "";
    expect(text).toContain("Referral accepted");
    expect(text).toContain("Referral passed");
    expect(text).not.toMatch(/Ask accepted|Ask passed/);
    fireEvent.click(screen.getByRole("button", { name: "Payment receipt / failed" }));
    expect(document.body.textContent ?? "").not.toMatch(/credit purchase/i);
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
