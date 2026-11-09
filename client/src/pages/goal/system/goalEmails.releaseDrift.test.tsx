// @vitest-environment jsdom
// D-048-R7-prep: the goal /emails twin must quote the copy skipwait.me actually
// sends, verbatim, with dynamic parts in ⟨angle brackets⟩. Every expected
// string below is copied from the live sender at the prep head; a sender change
// that is not ported here fails this test, and the page may never invent copy.
//
// Sender sources verified at the prep head (7dcc2cc5):
//   server/workEmailOtp.ts            otpEmailMessage()          — subject leads with the code
//   server/passwordResetRoutes.ts     sendResetEmail()            — reset subject/body
//   server/privateReferralRoutes.ts   notifyEmail / notifyInApp   — claimed, accepted, passed
//   server/reengagementMessaging.ts   slotOpened / referrerReview — slot opened, review ready
//   server/referrerReviewEmail.ts     review-ready email text     — the decision line
//   server/db.ts                      safety-report notice        — report outcome
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GoalEmails from "./GoalEmails";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

type Pinned = { subject: string; body: string[]; cta?: string; push?: string };

const PINNED: Record<string, Pinned> = {
  "Work-email code": {
    subject: "⟨6-digit code⟩ is your skipwait.me verification code",
    body: [
      "Your skipwait.me verification code is ⟨6-digit code⟩. It expires in 10 minutes and works once.",
      "If you did not request it, ignore this email - nothing changes.",
    ],
  },
  "Password reset": {
    subject: "Reset your skipwait.me password",
    body: [
      "You asked to reset your skipwait.me password. This link works for 1 hour, once: ⟨reset link⟩",
      "If you did not ask for this, ignore this email — nothing changes. Passwords are managed through secure sign-in; you can also continue with email from the sign-in page.",
    ],
    cta: "Reset link (in the email body)",
  },
  "Request claimed": {
    subject: "Your referral request was claimed — ⟨company⟩",
    body: ["A verified employee at ⟨company⟩ claimed your private referral request."],
  },
  "Ask accepted": {
    subject: "Your referral was accepted — ⟨company⟩",
    body: ["A verified employee at ⟨company⟩ accepted your private referral request."],
    cta: "Open conversation",
  },
  "Ask passed": {
    subject: "Update on your referral request — ⟨company⟩",
    body: ["Your request at ⟨company⟩ remains visible to other verified employees."],
    cta: "Find another referrer",
  },
  "Slot opened": {
    subject: "Private referral review available at ⟨company⟩",
    body: [
      "A referral review is now available at ⟨company⟩",
      "A verified employee opened review capacity for your private request. This does not guarantee an introduction, interview, or hiring outcome.",
    ],
    cta: "View private request",
  },
  "Review ready": {
    subject: "Private referral review at ⟨company⟩",
    body: [
      "A private review is ready at ⟨company⟩",
      "Reviewing is optional and never costs you anything. Sign in with your verified company email before any decision is recorded.",
      "Open the private review page to inspect and confirm a decision. Opening this link never records a decision.",
    ],
    cta: "Open private review",
  },
  "Report outcome": {
    subject: "Report outcome",
    body: ["Our safety team reviewed your report and took action. Thank you for flagging it."],
    push: "Update on your report",
  },
};

function open(name: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("article", { name });
}

describe("goal /emails release drift", () => {
  it.each(Object.keys(PINNED))("%s quotes the live sender verbatim", name => {
    render(<GoalEmails />);
    const pinned = PINNED[name];
    const article = open(name);
    expect(article.textContent).toContain(pinned.subject);
    for (const line of pinned.body) expect(article.textContent).toContain(line);
    if (pinned.cta) expect(article.textContent).toContain(pinned.cta);
    if (pinned.push) expect(screen.getByText(pinned.push)).toBeTruthy();
  });

  it("leads the work-email code subject with the masked code, as the sender does", () => {
    render(<GoalEmails />);
    const article = open("Work-email code");
    const subject = Array.from(article.querySelectorAll("p")).find(p => p.textContent?.includes("verification code"));
    expect(subject?.textContent).toBe("⟨6-digit code⟩ is your skipwait.me verification code");
    expect(screen.getByRole("img", { name: "Six-digit code" }).textContent).not.toMatch(/\d/);
  });

  it("never renders copy no sender sends", () => {
    render(<GoalEmails />);
    for (const name of Object.keys(PINNED)) {
      const text = open(name).textContent ?? "";
      // The paraphrased decision line the kit twin carried is not what the sender writes.
      expect(text).not.toContain("Review and confirm on skipwait.me.");
      // The unlanded #324 password copy is not sent by current main; porting it early would lie.
      expect(text).not.toContain("Set or reset your skipwait.me password");
      expect(text).not.toContain("Finish signing in to skipwait.me");
    }
  });
});


// Canonical-branch controls retained for comparison; red evidence is not release clearance.
// D-048-R7-prep: rendered drift controls for the system surface and the policy chrome. The source-level
// comparison lives in scripts/r7ReleaseAcceptance.test.ts; this file proves the *rendered* goal twin repeats the
// kit page's verified words, and that the policy shell changes chrome only — never a legal word — when the
// `policy` surface is on. It flips no flag and stubs the env per test.



const root = path.resolve(__dirname, "../../../../..");
const kitLiterals = (name: string): string[] => {
  const source = readFileSync(path.join(root, "client/src/pages/Emails.tsx"), "utf8");
  const after = source.split(`name: "${name}"`)[1] ?? "";
  const cuts = [after.indexOf('name: "'), after.indexOf("];")].filter(index => index >= 0);
  const scope = after.slice(0, cuts.length ? Math.min(...cuts) : after.length);
  return Array.from(scope.matchAll(/"((?:[^"\\]|\\.)*)"/g)).map(m => m[1]).filter(value => value !== "");
};



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
