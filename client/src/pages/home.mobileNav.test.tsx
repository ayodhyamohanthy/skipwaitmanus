// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("opens the kit navigation menu with the public destinations", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const nav = screen.getByRole("navigation", { name: "Website navigation" });
    expect(within(nav).getByText("Explore companies")).toBeTruthy();
    expect(within(nav).getByText("For referrers")).toBeTruthy();
    expect(within(nav).getByText("Help & safety")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(screen.getByRole("navigation", { name: "Website navigation" }).className).not.toContain("open");
  });

  it("routes the hero entries to explore and the referrer flow", () => {
    render(<Home />);
    const ctas = screen.getAllByRole("link", { name: /Explore companies/ });
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    expect(ctas[0].getAttribute("href")).toBe("/explore");
    expect(screen.getAllByRole("link", { name: /Become a referrer/ }).every(link => link.getAttribute("href") === "/referrer")).toBe(true);
  });

  it("closes with the money sentence only: no activity counts and no data fetch on the landing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);
    const final = screen.getByText("3 free referrals every month; extra asks use credits. Referrers are never paid and never ask you for money.").closest("section") as HTMLElement;
    expect(final.className).toBe("launch-final");
    expect(final.querySelectorAll("p")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/referral requests accepted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
