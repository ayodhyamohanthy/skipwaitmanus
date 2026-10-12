// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForCompanies, { demoRequestMailto } from "./ForCompanies";
import { EMPLOYER_PLANS, employerPlanPriceLabel } from "@/components/employer/employerPlans";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/for-companies"],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ForCompanies sales page", () => {
  it("renders the kit header, launch companies and fair band without preview scaffolding", () => {
    render(<ForCompanies />);
    expect(screen.getByText(/Your best hires already/)).toBeTruthy();
    expect(screen.getByText("Wipro")).toBeTruthy();
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
