// @vitest-environment jsdom
// D-048-p3-pricing (packet docs/plans/D-048-money.md §7 "Pricing"): the goal
// /pricing page. Public and fetch-free (it is prerendered, so no auth, no
// query, no router state), the goal page contract (one goal line, one "Your
// next step" block holding the one black commit, which goes to /plans), the
// kit page's price claims kept exactly (sourced from shared/planFamily.ts and
// shared/moneyCopy.ts, never retyped), referral-only wording (D-173, D-180),
// and the one switch in Pricing.tsx. The kit page's own pins stay in
// pricing.test.tsx and policyPages.test.tsx, unchanged.
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Pricing from "./Pricing";
import { assertGoalPage } from "@/test/goalPageContract";
import { money } from "@/components/plans/format";
import { PLAN_FAMILY, planFeeMinor } from "@shared/planFamily";
import { ASK_COST_SENTENCE, CREDIT_RULE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { firstPackClaim } from "@shared/planCatalog";

// Independent oracle for the goal line (packet §4), not GOAL_PAGE imported as its own proof.
const GOAL_LINE = "Know what a referral request costs.";

const { flag } = vi.hoisted(() => ({ flag: { on: true, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return {
    ...actual,
    goalSurfaceOn: (id: string) => {
      flag.asked.push(id);
      return id === "pricing" && flag.on;
    },
  };
});
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/pricing", vi.fn()],
}));

const fetchSpy = vi.fn(() => { throw new Error("/pricing must not fetch"); });

beforeEach(() => {
  flag.on = true;
  flag.asked = [];
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const nextStep = () => screen.getByRole("heading", { name: "Your next step" }).closest("section") as HTMLElement;
const pageText = () => document.body.textContent ?? "";

const GOAL_DIR = join(__dirname, "goal", "pricing");
const goalSources = () => readdirSync(GOAL_DIR)
  .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map(name => ({ name, source: readFileSync(join(GOAL_DIR, name), "utf8") }));

describe("goal /pricing (D-048-p3-pricing)", () => {
  it("meets the goal page contract: one goal line, one next step, one black commit to /plans", () => {
    const { container } = render(<Pricing />);
    expect(() => assertGoalPage(container, { goalLine: GOAL_LINE })).not.toThrow();
    const commit = within(nextStep()).getByRole("link", { name: /See plans and prices/ });
    expect(commit.getAttribute("href")).toBe("/plans");
    expect(commit.hasAttribute("data-g-primary")).toBe(true);
    expect(container.querySelector("[data-goal-page='pricing']")).toBeTruthy();
    // The kit body is not what the goal page renders.
    expect(container.querySelector(".brand-button")).toBeNull();
    expect(flag.asked).toContain("pricing");
  });

  it("exports GOAL_PAGE with the goal line", async () => {
    // A variable specifier, so the red-first run fails on this assertion, not at transform time.
    const modulePath = "./goal/pricing/GoalPricing";
    const goal = (await import(/* @vite-ignore */ modulePath).catch(() => ({}))) as { GOAL_PAGE?: unknown };
    expect(goal.GOAL_PAGE).toEqual({ goalLine: GOAL_LINE });
  });

  it("keeps every frozen founding price, sourced from shared/planFamily.ts", () => {
    render(<Pricing />);
    for (const plan of PLAN_FAMILY) {
      const card = screen.getByRole("heading", { name: plan.label }).closest("article") as HTMLElement;
      expect(card).toBeTruthy();
      expect(within(card).getByText(money(planFeeMinor(plan.id, "INR"), "INR"))).toBeTruthy();
      expect(within(card).getByText(money(planFeeMinor(plan.id, "USD"), "USD"))).toBeTruthy();
    }
    // Retired prices and plans stay gone; the paused packs are never priced here.
    const text = pageText();
    for (const retired of ["₹599", "$7/month", "$15/month", "Pro", "Max"]) expect(text).not.toContain(retired);
    expect(text).not.toContain(firstPackClaim("INR") ?? "unreachable");
    expect(text).not.toContain(firstPackClaim("USD") ?? "unreachable");
  });

  it("keeps the kit page's free line, money sentence, pause, provider and employer facts", () => {
    render(<Pricing />);
    const text = pageText();
    expect(text).toContain("3 free referrals a month at any level with a verified card; no carry-forward.");
    expect(text).toContain(REFERRER_MONEY_SENTENCE);
    expect(text).toContain("Prices are in Indian rupees (INR) for India and US dollars (USD) everywhere else. The price you pay is shown before checkout.");
    expect(text).toMatch(/Extra referrals are priced per referrer level with volume discounts/);
    expect(text).toMatch(/Checkout is not switched on yet/);
    expect(text).toMatch(/paused/);
    for (const provider of ["Razorpay", "PayPal", "Chargebee"]) expect(text).toContain(provider);
    expect(screen.getByRole("link", { name: "Shipping & delivery" }).getAttribute("href")).toBe("/shipping");
    expect(screen.getByRole("link", { name: "Hire on skipwait.me" }).getAttribute("href")).toBe("/employer");
  });

  it("shows the shared cost sentence and charge/refund rule without retyping them", () => {
    render(<Pricing />);
    expect(pageText()).toContain(ASK_COST_SENTENCE);
    expect(pageText()).toContain(CREDIT_RULE);
    const rules = screen.getByRole("region", { name: "How referral requests use your balance" });
    expect(within(rules).getByText(CREDIT_RULE)).toBeTruthy();
  });

  it("says referrals, never credits or the noun ask (D-173, D-180)", () => {
    render(<Pricing />);
    const text = pageText();
    expect(text).not.toMatch(/\bcredits?\b/i);
    expect(text).not.toMatch(/\basks\b/i);
    expect(text).not.toMatch(/\b(?:an|the|your|each|one|every) ask\b/i);
    // A bought balance is never a guaranteed or completed referral.
    expect(text).not.toMatch(/guarantee/i);
  });

  it("offers no purchase on this page: no checkout, no pack, no pass, one commit only", () => {
    const { container } = render(<Pricing />);
    expect(container.querySelectorAll("[data-g-primary]").length).toBe(1);
    const hrefs = Array.from(container.querySelectorAll("a")).map(link => link.getAttribute("href") ?? "");
    expect(hrefs.some(href => href.startsWith("/premium") || href.includes("checkout"))).toBe(false);
    expect(screen.queryByRole("button", { name: /buy|pay|subscribe|checkout/i })).toBeNull();
  });

  it("is public and fetch-free: renders without auth or query providers and calls no API", () => {
    render(<Pricing />);
    expect(screen.getByRole("heading", { level: 1, name: GOAL_LINE })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prerenders to static HTML with the goal line, a breadcrumb trail and every price", () => {
    const html = renderToStaticMarkup(<Pricing />);
    expect(html).toContain(GOAL_LINE);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/plans"');
    for (const plan of PLAN_FAMILY) {
      expect(html).toContain(money(planFeeMinor(plan.id, "INR"), "INR"));
      expect(html).toContain(money(planFeeMinor(plan.id, "USD"), "USD"));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sets the /pricing title and canonical from the public route registry", () => {
    render(<Pricing />);
    expect(document.title).toMatch(/^Pricing/);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://skipwait.me/pricing");
  });

  it("keeps the kit page when the goal flag is off", () => {
    flag.on = false;
    const { container } = render(<Pricing />);
    expect(container.querySelector("[data-goal-page='pricing']")).toBeNull();
    expect(container.querySelector("[data-skipwait-screen='pricing']")).toBeTruthy();
    expect(screen.getByRole("link", { name: /see plans and prices/i }).getAttribute("href")).toBe("/plans");
  });
});

describe("goal /pricing money boundary (packet §7)", () => {
  it("retypes no price, pack or money-rule string in goal source", () => {
    for (const { name, source } of goalSources()) {
      expect(source, `${name} retypes a rupee price`).not.toMatch(/₹\s?\d/);
      expect(source, `${name} retypes a dollar price`).not.toMatch(/\$\s?\d/);
      expect(source, `${name} retypes the referrer money sentence`).not.toContain("never ask you for money");
    }
    const page = goalSources().find(file => file.name === "GoalPricing.tsx")?.source ?? "";
    expect(page).toMatch(/from "@shared\/planFamily"/);
    expect(page).toMatch(/from "@shared\/moneyCopy"/);
  });

  it("imports no kit, ui, auth, query or router module and touches no pricing flag", () => {
    for (const { name, source } of goalSources()) {
      expect(source, `${name} imports the kit`).not.toMatch(/components\/(?:kit|ui)\//);
      expect(source, `${name} imports auth`).not.toMatch(/_core\/auth/);
      expect(source, `${name} imports react-query`).not.toMatch(/@tanstack\/react-query/);
      expect(source, `${name} imports the router`).not.toMatch(/from "wouter"/);
      expect(source, `${name} touches a pricing flag`).not.toMatch(/PLAN_FAMILY_V2|VITE_PLAN_FAMILY|CREDIT_PACKS_ON_SALE|PASS_SALES_ENABLED|VITE_ASK_LEVEL_COST/);
    }
  });

  it("changes Pricing.tsx by the switch only (at most 12 lines)", () => {
    const source = readFileSync(join(__dirname, "Pricing.tsx"), "utf8");
    expect(source).toMatch(/goalSurfaceOn\("pricing"\)/);
    const switchLines = source.split("\n").filter(line => /GoalPricing|goalSurfaceOn|D-048-p3-pricing/.test(line));
    expect(switchLines.length).toBeGreaterThan(0);
    expect(switchLines.length).toBeLessThanOrEqual(12);
  });
});
