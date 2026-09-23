// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Home from "./Home";

vi.mock("@/_core/auth", () => ({
  SignedIn: ({ children }: { children?: React.ReactNode }) => null,
  SignedOut: ({ children }: { children?: React.ReactNode }) => children,
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("wouter", () => ({
  useLocation: () => ["/", go],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

describe("Home mobile navigation", () => {
  afterEach(() => { cleanup(); go.mockReset(); vi.unstubAllGlobals(); });

  it("keeps public navigation behind one hamburger menu on mobile", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    const menu = within(screen.getByRole("dialog", { name: "Menu" }));
    expect(menu.getByText("How it works")).toBeTruthy();
    expect(menu.getByText("Privacy")).toBeTruthy();
  });

  it("keeps the two role entry points prominent and routed to their flows", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /I need a referral/i }));
    expect(go).toHaveBeenCalledWith("/start");

    go.mockReset();
    fireEvent.click(screen.getByRole("button", { name: /I can refer someone/i }));
    expect(go).toHaveBeenCalledWith("/referrer");
  });

  it("shows only a truthful aggregate referral-impact indicator, never named or queue-based activity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ acceptedReferrals: 17 }) })));
    render(<Home />);
    await waitFor(() => expect(screen.getByText("17 referral requests accepted on skipwait.me · participants stay private.")).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/sarah|netflix|minutes ago|fast-tracked|queue|rank/i);
  });
});
