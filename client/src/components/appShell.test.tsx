// @vitest-environment jsdom
// W0 (D-048 phase 3): the app frame renders inside GoalShell - one navigation
// (Find, My asks, Inbox, + Referral queue for a verified referrer), the credits
// count on every signed-in route (D-222), the account menu carried over unchanged.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AppShell } from "./AppShell";

const { state } = vi.hoisted(() => ({
  state: {
    path: "/requests",
    signedIn: true,
    referrer: "unverified" as "unverified" | "verified" | "checking",
    credits: { state: "ready", count: 9 } as { state: "ready"; count: number } | { state: "error"; onRetry: () => void } | { state: "loading" } | null,
  },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, getToken: async () => "tok" }),
  useUser: () => ({ user: state.signedIn ? { fullName: "Ada Lovelace", firstName: "Ada", primaryEmailAddress: { emailAddress: "ada@example.com" } } : null }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => ({ status: state.referrer, access: { verified: state.referrer === "verified" } }),
}));
// AppShell no longer queries inline (F-credits): the one balance query is the
// hook; the mock honours its enabled contract (disabled -> null, no fetch).
vi.mock("@/hooks/useCreditBalance", () => ({
  useCreditBalance: (enabled: boolean) => (enabled ? state.credits : null),
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div data-testid="account-menu">account menu</div> }));
vi.mock("wouter", () => ({
  useLocation: () => [state.path],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

describe("AppShell on GoalShell (W0)", () => {
  afterEach(() => { cleanup(); state.path = "/requests"; state.signedIn = true; state.referrer = "unverified"; state.credits = { state: "ready", count: 9 }; });

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

  it("shows the live referrals-left count on seeker pages and never 0 on a failed load", () => {
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByTestId("goal-credits-pill")[0].textContent).toContain("9 referrals left");
    cleanup();
    state.credits = { state: "error", onRetry: vi.fn() };
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByText("Balance didn't load").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\b0 referrals?\b/)).toBeNull();
    expect(screen.queryByText(/0 credits/)).toBeNull();
  });

  it("shows the count on referrer surfaces too, as plain text (D-222, superseding the D-055 hide)", () => {
    state.path = "/queue"; state.referrer = "verified";
    render(<AppShell><p>page</p></AppShell>);
    const pills = screen.getAllByTestId("goal-credits-pill");
    expect(pills.length).toBeGreaterThan(0);
    for (const pill of pills) expect(pill.tagName).not.toBe("A");
  });

  it("shows the count on the four referrer routes the old pattern missed, and on a seeker route (F-credits, D-222)", () => {
    for (const route of ["/referrer-home", "/referrer-setup", "/verify", "/post-opportunity"]) {
      state.path = route;
      const { unmount } = render(<AppShell><p>page</p></AppShell>);
      expect(screen.getAllByTestId("goal-credits-pill").length).toBeGreaterThan(0);
      unmount();
    }
    // And the pill still shows on a seeker route.
    state.path = "/requests";
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByTestId("goal-credits-pill").length).toBeGreaterThan(0);
  });

  it("carries the account menu unchanged for a signed-in user and offers Sign in when signed out", () => {
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByTestId("account-menu").length).toBeGreaterThan(0);
    cleanup();
    state.signedIn = false;
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByRole("link", { name: "Sign in" })[0].getAttribute("href")).toBe("/sign-in");
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

  it("sets only the count numeral in mono, the referral unit in sans", () => {
    state.path = "/requests"; state.signedIn = true;
    state.credits = { state: "ready", count: 9 };
    render(<AppShell><p>page</p></AppShell>);
    const pills = screen.getAllByTestId("goal-credits-pill");
    for (const pill of pills) {
      expect(pill.className).toContain("g-hit");
      // Only the numeral is mono; the unit stays sans (comp: button.credits).
      expect(pill.querySelector(".g-num")?.textContent).toBe("9");
    }
    expect(pills.map(pill => pill.textContent)).toEqual(expect.arrayContaining(["9 referrals left", "9 referrals"]));
    // The phone pill keeps its unit: never a bare number (D-344).
    expect(pills.map(pill => pill.textContent)).not.toContain("9");
  });
});

// D-222 (owner, Oct 27): the signed-in person's own remaining-referral count stays
// visible on every signed-in shell route. On referrer routes it is plain text: no
// link, no plan or purchase path (D-055). Honest states only, never "credits", no
// money glyph (docs/plans/D-222-referral-count.md).
describe("D-222: the person's own referrals-left count on every signed-in shell route", () => {
  const REFERRER_ROUTES = ["/queue", "/referrer", "/referrer/impact", "/referrer-home", "/referrer-setup", "/verify", "/post-opportunity"];
  afterEach(() => { cleanup(); state.path = "/requests"; state.signedIn = true; state.referrer = "unverified"; state.credits = { state: "ready", count: 9 }; });

  it("on every referrer route the count is plain text with no link, no /plans path and no purchase affordance", () => {
    state.referrer = "verified";
    for (const route of REFERRER_ROUTES) {
      state.path = route;
      const { unmount } = render(<AppShell><p>page</p></AppShell>);
      const pills = screen.getAllByTestId("goal-credits-pill");
      expect(pills.length, route).toBe(2);
      for (const pill of pills) {
        expect(pill.tagName, route).toBe("SPAN");
        expect(pill.getAttribute("href"), route).toBeNull();
        expect(pill.closest("a"), route).toBeNull();
        expect(pill.querySelector("a, button"), route).toBeNull();
        expect(pill.outerHTML, route).not.toMatch(/plans|pricing|premium|upgrade|buy/i);
        expect(pill.textContent, route).toBe("9 referrals left");
      }
      unmount();
    }
  });

  it("a referrer who is still being checked, or not verified, sees the same plain count on a referrer route", () => {
    for (const referrer of ["checking", "unverified"] as const) {
      state.referrer = referrer; state.path = "/verify";
      const { unmount } = render(<AppShell><p>page</p></AppShell>);
      const pills = screen.getAllByTestId("goal-credits-pill");
      expect(pills.length).toBe(2);
      for (const pill of pills) expect(pill.tagName).toBe("SPAN");
      unmount();
    }
  });

  it("the phone form keeps the unit and its accessible text still says left, on both route kinds", () => {
    state.referrer = "verified"; state.path = "/queue";
    render(<AppShell><p>page</p></AppShell>);
    const plain = screen.getAllByTestId("goal-credits-pill");
    // Desktop and phone pills: both read the full words to assistive tech.
    expect(plain.map(pill => pill.textContent)).toEqual(["9 referrals left", "9 referrals left"]);
    const compactVisible = plain[1].querySelector("[aria-hidden='true']");
    expect(compactVisible).toBeNull();
    expect(plain[1].querySelector(".sr-only")?.textContent).toBe(" left");
    cleanup();
    state.referrer = "unverified"; state.path = "/requests";
    render(<AppShell><p>page</p></AppShell>);
    const linked = screen.getAllByTestId("goal-credits-pill");
    for (const pill of linked) expect(pill.getAttribute("aria-label")).toBe("9 referrals left. Open plan details");
  });

  it("says 1 referral left in the singular", () => {
    state.credits = { state: "ready", count: 1 };
    for (const path of ["/requests", "/queue"]) {
      state.path = path; state.referrer = path === "/queue" ? "verified" : "unverified";
      const { unmount } = render(<AppShell><p>page</p></AppShell>);
      expect(screen.getAllByTestId("goal-credits-pill")[0].textContent).toBe("1 referral left");
      unmount();
    }
  });

  it("shows an honest 0 referrals left at zero on seeker and referrer routes, never a bare numeral", () => {
    state.credits = { state: "ready", count: 0 };
    for (const path of ["/requests", "/verify"]) {
      state.path = path; state.referrer = path === "/verify" ? "verified" : "unverified";
      const { unmount } = render(<AppShell><p>page</p></AppShell>);
      const pills = screen.getAllByTestId("goal-credits-pill");
      expect(pills[0].textContent, path).toBe("0 referrals left");
      for (const pill of pills) expect(pill.textContent, path).not.toBe("0");
      unmount();
    }
  });

  it("shows Balance didn't load with Retry on a referrer route, never a false zero", () => {
    const onRetry = vi.fn();
    state.credits = { state: "error", onRetry };
    state.path = "/referrer-home"; state.referrer = "verified";
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getAllByText("Balance didn't load").length).toBeGreaterThan(0);
    screen.getAllByRole("button", { name: "Retry" })[0].click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/\b0 referrals?\b/)).toBeNull();
  });

  it("shows loading as a busy placeholder with no numeral on both route kinds", () => {
    state.credits = { state: "loading" };
    for (const path of ["/requests", "/queue"]) {
      state.path = path; state.referrer = path === "/queue" ? "verified" : "unverified";
      const { unmount } = render(<AppShell><p>page</p></AppShell>);
      const pills = screen.getAllByTestId("goal-credits-pill");
      for (const pill of pills) {
        expect(pill.getAttribute("aria-busy"), path).toBe("true");
        expect(pill.textContent, path).not.toMatch(/\d/);
      }
      unmount();
    }
  });

  it("renders no count signed out, on a seeker or a referrer route", () => {
    state.signedIn = false;
    for (const path of ["/requests", "/queue", "/verify"]) {
      state.path = path;
      const { unmount } = render(<AppShell><p>page</p></AppShell>);
      expect(screen.queryByTestId("goal-credits-pill"), path).toBeNull();
      unmount();
    }
  });

  it("keeps the count's header pinned at the top while the page scrolls", () => {
    state.credits = { state: "error", onRetry: vi.fn() };
    render(<AppShell><p>page</p></AppShell>);
    const header = screen.getByRole("banner");
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
    expect(header.className).toContain("self-start");
    expect(header.className).toContain("max-gdesk:h-[72px]");
  });

  it("never says credit and carries no icon or money glyph, in any state, on either route kind", () => {
    const states = [{ state: "ready", count: 9 }, { state: "ready", count: 0 }, { state: "loading" }, { state: "error", onRetry: vi.fn() }] as const;
    for (const credits of states) {
      for (const path of ["/requests", "/queue"]) {
        state.credits = credits; state.path = path; state.referrer = path === "/queue" ? "verified" : "unverified";
        const { unmount } = render(<AppShell><p>page</p></AppShell>);
        for (const pill of screen.getAllByTestId("goal-credits-pill")) {
          expect(`${pill.textContent} ${pill.getAttribute("aria-label") ?? ""}`, `${credits.state} ${path}`).not.toMatch(/credit/i);
          expect(pill.querySelector("svg"), `${credits.state} ${path}`).toBeNull();
          expect(pill.textContent ?? "", `${credits.state} ${path}`).not.toMatch(/[$₹€£¥]/);
        }
        unmount();
      }
    }
  });
});
