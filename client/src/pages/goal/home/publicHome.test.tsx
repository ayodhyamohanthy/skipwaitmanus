// @vitest-environment jsdom
// D-048-K-home ports public Home contracts to the already-released landing.
// Kit-only layout assertions are accounted for in the PR's Ported assertions table.
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOAL_LANDING_H1, GOAL_LANDING_QUOTE, goalLandingFairRules, goalLandingSteps } from "@shared/landingContent";
import { askCostLanding } from "@shared/moneyCopy";
import Home from "../../Home";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/", navigate],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => {
  navigate.mockReset();
  window.localStorage.setItem("skipwait:cookie-consent", "essential");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe("released public Home contracts", () => {
  it("opens with the approved goal headline and brand", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(GOAL_LANDING_H1);
    expect(within(screen.getByRole("banner")).getByRole("img", { name: /skipwait.me/i })).toBeTruthy();
  });

  it("keeps header sign-in on the local sign-in page", () => {
    render(<Home />);
    const entries = within(screen.getByRole("banner")).getAllByRole("link", { name: /^Sign in$/ });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const link of entries) expect(link.getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByRole("navigation", { name: "Your workspace" })).toBeNull();
    expect(screen.queryByRole("button", { name: /My requests|My company inbox|Internal openings/i })).toBeNull();
  });

  it("keeps goal navigation for exploring companies, reading the rules and joining as a referrer", () => {
    render(<Home />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "How it goes" }).getAttribute("href")).toBe("#how");
    expect(within(header).getByRole("link", { name: "Fair rules" }).getAttribute("href")).toBe("#rules");
    expect(within(header).getByRole("link", { name: "Join as a referrer" }).getAttribute("href")).toBe("/sign-in?intent=referrer");
    const exploreLink = screen.getAllByRole("link").find(link => link.textContent?.trim() === "Explore companies");
    expect(exploreLink?.getAttribute("href")).toBe("/explore");
  });

  it("keeps referrer entries on their existing flows", () => {
    render(<Home />);
    const links = screen.getAllByRole("link", { name: "Join as a referrer" });
    expect(links.map(link => link.getAttribute("href"))).toEqual(["/sign-in?intent=referrer", "/referrer", "/referrer"]);
  });

  it("searches the company directory with the entered company name", () => {
    render(<Home />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search companies" }), { target: { value: "  Acme & Sons  " } });
    fireEvent.click(screen.getByRole("button", { name: /Find your company/ }));
    expect(navigate).toHaveBeenCalledWith("/explore?q=Acme%20%26%20Sons");
  });

  it("opens the directory when search is empty", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Find your company/ }));
    expect(navigate).toHaveBeenCalledWith("/explore");
    expect(screen.getByText("Explore before signing in.")).toBeTruthy();
  });

  it("keeps public product, employee, contact and legal footer links", () => {
    const { container } = render(<Home />);
    const links = Array.from(container.querySelectorAll("footer a")).map(link => link.getAttribute("href"));
    expect(links).toEqual(["/explore", "/jobs", "/pricing", "/plans", "/referrer", "/help", "/contact", "/terms", "/privacy", "/refunds", "/cancellations"]);
  });

  it("states the shared cost, privacy, voluntary-referral and no-outcome-promise rules", () => {
    const { container } = render(<Home />);
    const cost = askCostLanding(false);
    for (const rule of goalLandingFairRules(cost)) expect(container.textContent).toContain(rule);
    expect(container.textContent).toContain(GOAL_LANDING_QUOTE);
    // D-055 keeps referring free; the seeker cost assurance must remain qualified.
    expect(container.querySelector("#how")?.textContent).not.toMatch(/Referrals are free|free\.\s*Always|always free|Free job referrals/i);
    expect(container.textContent).toContain("Referring is always free - and referrers are never paid");
    expect(container.textContent).not.toMatch(/candidates placed|hires|success stories|testimonials|referral requests accepted/i);
  });

  it("keeps the three steps and their real cost without interactive kit selectors", () => {
    const { container } = render(<Home />);
    const steps = container.querySelector("#how ol");
    expect(steps?.querySelectorAll("li")).toHaveLength(3);
    expect(Array.from(steps?.querySelectorAll("li > div > span") ?? []).map(node => node.textContent)).toEqual(["01", "02", "03"]);
    for (const step of goalLandingSteps(askCostLanding(false))) {
      expect(steps?.textContent).toContain(step.title);
      expect(steps?.textContent).toContain(step.body);
    }
  });

  it("renders no retired launch layout or FAQ and makes no data request", () => {
    const { container } = render(<Home />);
    expect(container.querySelector('[class*="launch-"]')).toBeNull();
    expect(container.querySelector(".brand-dot")).toBeNull();
    expect(container.querySelector("#faq-0")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
