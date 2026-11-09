// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import ForCompanies, { demoRequestMailto } from "./ForCompanies";
import { EMPLOYER_PLANS, employerPlanPriceLabel } from "@/components/employer/employerPlans";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/for-companies"],
}));

// Launch chips read the server directory (GET /api/companies).
const directory = { companies: LAUNCH_COMPANY_SEED.map(seed => ({ slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true })), openCount: LAUNCH_COMPANY_SEED.length };
const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, url: "", json: async () => directory }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ForCompanies sales page", () => {
  it("renders the kit header, launch companies and fair band without preview scaffolding", async () => {
    render(<ForCompanies />);
    expect(screen.getByText(/Your best hires already/)).toBeTruthy();
    expect(await screen.findByText("Wipro")).toBeTruthy();
    // D-176: the launch-chip label makes no availability claim.
    const chips = screen.getByText("COMPANIES ON SKIPWAIT.ME").closest("section") as HTMLElement;
    expect(screen.queryByText(/OPEN TO REFERRALS/i)).toBeNull();
    expect(Array.from(chips.querySelectorAll(".co-logos span")).map(node => node.textContent)).toEqual(["skipwait.me", "Wipro", "Neutrinos", "TCS", "Merkle"]);
    const nav = screen.getByRole("navigation", { name: "Company navigation" });
    expect(within(nav).getByRole("link", { name: "Plans" }).getAttribute("href")).toBe("/plans");
    expect(within(nav).getByRole("link", { name: "Book a demo" }).getAttribute("href")).toBe("#demo");
    expect(screen.getByRole("link", { name: "See pricing" }).getAttribute("href")).toBe("#pricing");
    expect(screen.getByText("Privacy-first: names shared only on acceptance")).toBeTruthy();
    expect(screen.queryByText(/EXAMPLE PRICING|DESIGN PREVIEW|workspace preview/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Employer workspace" }).getAttribute("href")).toBe("/employer");
  });

  it("prices every plan from the employer catalog, all sales-led through the demo form", () => {
    render(<ForCompanies />);
    for (const plan of EMPLOYER_PLANS) {
      const card = screen.getByRole("heading", { name: plan.name }).closest("article");
      expect(card).toBeTruthy();
      const scope = within(card as HTMLElement);
      expect(scope.getByText(employerPlanPriceLabel(plan.price))).toBeTruthy();
      expect(scope.getByRole("link", { name: `Get started with ${plan.name}` }).getAttribute("href")).toBe("#demo");
    }
    // No price on the page that the catalog does not define.
    const prices = Array.from(document.querySelectorAll(".plan-price strong")).map(node => node.textContent);
    expect(prices).toEqual(EMPLOYER_PLANS.map(plan => employerPlanPriceLabel(plan.price)));
  });

  it("keeps the page usable when the launch companies cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<ForCompanies />);
    expect((await screen.findByRole("alert", {}, { timeout: 5000 })).textContent).toContain("We couldn’t load the launch companies.");
    expect(screen.getByRole("link", { name: "See pricing" })).toBeTruthy();
  });

  it("opens a prefilled email for a demo request instead of submitting silently", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    render(<ForCompanies />);
    expect(screen.getByText(/nothing is submitted silently/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), { target: { value: "hr@acme.example" } });
    fireEvent.change(screen.getByPlaceholderText("Company name"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Team size"), { target: { value: "201–2,000" } });
    fireEvent.submit(screen.getByRole("form", { name: "Book a demo" }));
    expect(open).toHaveBeenCalledTimes(1);
    const [href, target] = open.mock.calls[0];
    expect(target).toBe("_self");
    expect(href).toBe(demoRequestMailto({ email: "hr@acme.example", company: "Acme", teamSize: "201–2,000" }));
    expect(href).toMatch(/^mailto:hello@skipwait\.me\?/);
    expect(href).toContain(encodeURIComponent("Acme"));
    expect(href).toContain(encodeURIComponent("201–2,000"));
  });
});
