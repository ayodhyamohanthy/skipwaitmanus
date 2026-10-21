// @vitest-environment jsdom
// Goal-first landing (D-120): pins the migration-spec acceptance checklist -
// goal line opens the screen, exactly one black commit, no kit/yellow-blue
// classes, fair rules + honest copy from shared moneyCopy, footer legal links.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GoalLanding from "./GoalLanding";
import { ASK_COST_SENTENCE, REFERRING_FREE_LINE } from "@shared/moneyCopy";

afterEach(cleanup);

describe("GoalLanding (D-120)", () => {
  it("mounts the cookie consent banner when no choice is stored", () => {
    window.localStorage.removeItem("skipwait:cookie-consent");
    render(<GoalLanding />);
    expect(screen.getByRole("dialog", { name: /cookie choices/i })).toBeTruthy();
  });


  it("opens with the user's goal, not a welcome or a tagline", () => {
    render(<GoalLanding />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Get referred.");
  });

  it("has exactly one black commit action: Find your company -> /explore", () => {
    render(<GoalLanding />);
    const primaries = document.querySelectorAll('[data-g-primary="true"]');
    expect(primaries.length).toBe(1);
    const commit = primaries[0];
    expect(commit.textContent).toContain("Find your company");
    expect(commit.getAttribute("href")).toBe("/explore");
  });

  it("shows the next-step block and the explore-before-sign-in honesty note", () => {
    render(<GoalLanding />);
    // v7 warm hero: the next step is the single black pill commit + honesty note.
    const next = screen.getByTestId("goal-next-step");
    expect(next.querySelector('[data-g-primary="true"]')?.textContent).toContain("Find your company");
    expect(screen.getByText(/Explore before signing in/)).toBeTruthy();
  });

  it("teaches the 3 steps with the real cost before any ask", () => {
    render(<GoalLanding />);
    const section = screen.getByRole("heading", { name: "Three steps. No noise." }).closest("section")!;
    const steps = section.querySelector("ol")!;
    expect(steps.textContent).toContain("Find your company");
    expect(steps.textContent).toContain("Send one thoughtful ask");
    expect(steps.textContent).toContain("They decide");
    expect(steps.textContent).toContain(ASK_COST_SENTENCE);
    expect(steps.textContent).toContain("Every ask costs the same.");
  });

  it("states the fair rules from shared money copy - no invented claims", () => {
    render(<GoalLanding />);
    expect(screen.getByText(REFERRING_FREE_LINE)).toBeTruthy();
    expect(screen.getByText(/Every ask costs the same: 1 credit/)).toBeTruthy();
    expect(screen.getByText(/not an interview or a job/)).toBeTruthy();
    expect(screen.getByText(/hidden until a referrer accepts/)).toBeTruthy();
  });

  it("links to referrer onboarding as a plain link, not a second commit", () => {
    render(<GoalLanding />);
    const link = screen.getAllByText("Join as a referrer").pop()!.closest("a")!;
    expect(link.getAttribute("href")).toBe("/referrer");
    expect(link.getAttribute("data-g-primary")).toBeNull();
  });

  it("carries no kit launch classes (yellow/blue language retired)", () => {
    const { container } = render(<GoalLanding />);
    expect(container.querySelector('[class*="launch-"]')).toBeNull();
    expect(container.querySelector(".brand-dot")).toBeNull();
  });

  it("shows the beta badge + honest beta line from one config (owner Oct 21)", () => {
    render(<GoalLanding />);
    expect(screen.getByTestId("beta-badge").textContent).toBe("Beta");
    const line = screen.getByTestId("beta-notice-line");
    expect(line.textContent).toContain("skipwait.me is in beta");
    expect(line.textContent).toContain("feedback shapes it");
    expect(within(line).getByRole("link", { name: "feedback" }).getAttribute("href")).toBe("/help");
  });

  it("keeps the legal footer links", () => {
    render(<GoalLanding />);
    for (const [href, label] of [["/terms", "Terms"], ["/privacy", "Privacy"], ["/refunds", "Refunds"], ["/contact", "Contact"]]) {
      const link = document.querySelector(`footer a[href="${href}"]`);
      expect(link?.textContent).toBe(label);
    }
  });
});
