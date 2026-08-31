// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Home from "./Home";

vi.mock("@clerk/react", () => ({ SignedIn: ({ children }) => null, SignedOut: ({ children }) => children }));

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("wouter", () => ({
  useLocation: () => ["/", go],
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

describe("Home mobile navigation", () => {
  afterEach(() => { cleanup(); go.mockReset(); vi.unstubAllGlobals(); });

  it("keeps public navigation behind one hamburger menu on mobile", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I give referrals" }));
    expect(go).toHaveBeenCalledWith("/referrer");
  });

  it("keeps the supplied mobile-first referral choices prominent and routed to their role flows", () => {
    render(<Home />);

    expect(screen.getByText("Choose your referral path.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /I need a referral/i }));
    expect(go).toHaveBeenCalledWith("/start");

    go.mockReset();
    const referrerChoice = screen.getAllByRole("button", { name: /I give referrals/i }).find((element) => element.className.includes("rounded-2xl"));
    expect(referrerChoice).toBeTruthy();
    fireEvent.click(referrerChoice!);
    expect(go).toHaveBeenCalledWith("/referrer");
  });

  it("shows only a truthful aggregate referral-impact indicator, never named or queue-based activity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ acceptedReferrals: 17 }) })));
    render(<Home />);
    await waitFor(() => expect(screen.getByText("17 referrals accepted")).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/sarah|stripe|minutes ago|fast-tracked|queue|rank/i);
  });
});
