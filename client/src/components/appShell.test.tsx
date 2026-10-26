// @vitest-environment jsdom
// W0 (D-048 phase 3): the app frame renders inside GoalShell - one navigation
// (Find, My asks, Inbox, + Referral queue for a verified referrer), the credits
// pill on seeker pages only (D-055), the account menu carried over unchanged.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { AppShell } from "./AppShell";

const { state } = vi.hoisted(() => ({
  state: {
    path: "/requests",
    signedIn: true,
    referrer: "unverified" as "unverified" | "verified" | "checking",
    credits: { data: { totalAvailable: 9 } as { totalAvailable: number } | undefined, isError: false, refetch: vi.fn() },
  },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, getToken: async () => "tok" }),
  useUser: () => ({ user: state.signedIn ? { fullName: "Ada Lovelace", firstName: "Ada", primaryEmailAddress: { emailAddress: "ada@example.com" } } : null }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => ({ status: state.referrer, access: { verified: state.referrer === "verified" } }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => state.credits,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div data-testid="account-menu">account menu</div> }));
vi.mock("wouter", () => ({
  useLocation: () => [state.path],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

describe("AppShell on GoalShell (W0)", () => {
  afterEach(() => { cleanup(); state.path = "/requests"; state.signedIn = true; state.referrer = "unverified"; state.credits = { data: { totalAvailable: 9 }, isError: false, refetch: vi.fn() }; });

  it("renders the one navigation for a seeker: Find, My asks, Inbox - no Queue", () => {
    render(<AppShell><p>page</p></AppShell>);
    const rail = screen.getAllByRole("navigation", { name: "Primary" })[0];
    for (const [name, href] of [["Find", "/explore"], ["My asks", "/requests"], ["Inbox", "/inbox"]]) {
      expect(within(rail).getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
    expect(within(rail).queryByRole("link", { name: /Queue/ })).toBeNull();
    // A non-referrer gets the quiet Give a referral link (D-070).
    expect(screen.getAllByTestId("goal-give-referral")[0].getAttribute("href")).toContain("intent=referrer");
    // Owner (Oct 21, #402): the beta badge survives in the top bar; the 104px
    // rail cannot hold wordmark + badge without clipping the wordmark.
    expect(within(rail).queryByTestId("beta-badge")).toBeNull();
    expect(within(screen.getByRole("banner")).getAllByTestId("beta-badge").length).toBe(1);
  });

  it("adds Referral queue and drops Give a referral for a verified referrer", () => {
    state.referrer = "verified";
    render(<AppShell><p>page</p></AppShell>);
    const rail = screen.getAllByRole("navigation", { name: "Primary" })[0];
    expect(within(rail).getByRole("link", { name: "Queue" }).getAttribute("href")).toBe("/queue");
    expect(screen.queryByTestId("goal-give-referral")).toBeNull();
  });

  it("marks the current route active with aria-current", () => {
    render(<AppShell><p>page</p></AppShell>);
    const rail = screen.getAllByRole("navigation", { name: "Primary" })[0];
    expect(within(rail).getByRole("link", { name: "My asks" }).getAttribute("aria-current")).toBe("page");
    expect(within(rail).getByRole("link", { name: "Find" }).getAttribute("aria-current")).toBeNull();
  });

  it("shows the live credits count on seeker pages and never 0 on a failed load", () => {
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByTestId("goal-credits-pill")[0].textContent).toContain("9 credits");
    cleanup();
    state.credits = { data: undefined, isError: true, refetch: vi.fn() };
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByText("Balance didn't load").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 credits/)).toBeNull();
  });

  it("shows no credits pill on referrer surfaces (D-055)", () => {
    state.path = "/queue"; state.referrer = "verified";
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.queryByTestId("goal-credits-pill")).toBeNull();
  });

  it("carries the account menu unchanged for a signed-in user and offers Sign in when signed out", () => {
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByTestId("account-menu").length).toBeGreaterThan(0);
    cleanup();
    state.signedIn = false;
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByRole("link", { name: "Sign in" })[0].getAttribute("href")).toBe("/sign-in");
  });

  it("keeps focused fields above the sticky phone bar: html scroll-padding at the phone breakpoint", () => {
    // Regression for the 390px defect where the focused third reason field
    // scrolled under the fixed bottom nav. jsdom cannot evaluate the media
    // query, so this guards the rule's presence and breakpoint exactly.
    const css = readFileSync("client/src/index.css", "utf8");
    const block = css.match(/@media \(width < 40\.0625rem\) \{[^}]*html \{ scroll-padding-bottom: 3\.5rem; \}/);
    expect(block, "index.css must keep scroll-padding-bottom: 3.5rem on html below the gdesk breakpoint").toBeTruthy();
  });

  it("pins the phone bottom bar sticky in view, and drops bar plus track on an opened request", () => {
    state.path = "/explore"; state.referrer = "unverified"; state.signedIn = true;
    const { container } = render(<AppShell><p>page</p></AppShell>);
    const bars = screen.getAllByRole("navigation", { name: "Primary" });
    expect(bars.some(bar => bar.className.includes("sticky") && bar.className.includes("bottom-0"))).toBe(true);
    // The desktop rail stays in view too, so the account/More group is reachable
    // without scrolling to the end of a long directory.
    const rail = bars[0];
    expect(rail.className).toContain("gdesk:sticky");
    expect(rail.className).toContain("gdesk:h-screen");
    // The sticky bar spans rows 2..-1; main must claim phone row 2 explicitly or
    // auto-placement drops it into an implicit fourth row below a blank screen.
    expect(container.querySelector("main")?.className).toContain("max-gdesk:row-start-2");
    cleanup();
    for (const hidden of ["/conversation/req-1", "/thread/req-1", "/messages"]) {
      state.path = hidden;
      const { container, unmount } = render(<AppShell><p>page</p></AppShell>);
      // Only the desktop rail remains (its gdesk:sticky is desktop-only); the
      // phone bar and its third track are gone.
      const navs = screen.getAllByRole("navigation", { name: "Primary" });
      expect(navs.some(bar => bar.className.includes("max-gdesk:sticky"))).toBe(false);
      expect(container.querySelector('[data-testid="goal-shell"]')?.className ?? "").not.toContain("_56px]");
      unmount();
    }
  });

  it("shows the alerts bell only when signed in (signed-out /alerts is a dead end)", () => {
    state.path = "/requests"; state.signedIn = true;
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByRole("link", { name: "Alerts" }).length).toBeGreaterThan(0);
    cleanup();
    state.signedIn = false;
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.queryByRole("link", { name: "Alerts" })).toBeNull();
  });

  it("sets only the credits numeral in mono, the word credits in sans", () => {
    state.path = "/requests"; state.signedIn = true;
    state.credits = { data: { totalAvailable: 9 }, isError: false, refetch: vi.fn() };
    render(<AppShell><p>page</p></AppShell>);
    const pills = screen.getAllByTestId("goal-credits-pill");
    for (const pill of pills) {
      expect(pill.className).toContain("g-hit");
      // Only the numeral is mono; "credits" stays sans (comp: button.credits).
      expect(pill.querySelector(".g-num")?.textContent).toBe("9");
    }
    expect(pills.map(pill => pill.textContent)).toEqual(expect.arrayContaining(["9 credits", "9"]));
  });
});
