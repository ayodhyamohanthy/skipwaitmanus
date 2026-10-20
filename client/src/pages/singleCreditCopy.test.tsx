// @vitest-environment jsdom
// GO-LIVE-1 C10 (D-084 (6), D-044): the single credit retires per currency once
// a credit pack is buyable there, and the catalog carries no single-credit
// price. So no copy outside /plans and /premium's own picker may name the
// ₹99 / $1 per-credit price: each page says "Add credits" or "Buy credits
// anytime" and points at /plans for today's prices, so nothing turns false
// when a currency retires.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LANDING_EXPLORE, LANDING_FAQ } from "@shared/landingContent";
import { PUBLIC_ROUTES } from "@shared/publicRoutes";
import { CREDIT_RULE, MONEY_SENTENCE } from "@shared/moneyCopy";
import { SeekerCreditsCard } from "@/components/SeekerCreditsCard";
import Pricing from "./Pricing";

vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));

/** "$1" or "₹99" as a whole amount, or a per-credit price in words. "$10" or "₹999" do not match. */
const SINGLE_CREDIT_PRICE = /\$1(?![\d.,])|₹99(?![\d.,])|per credit/i;

afterEach(cleanup);

describe("no copy outside /plans names the single-credit price (GO-LIVE-1 C10)", () => {
  it("the landing links and FAQ say Buy credits anytime and keep the D-063 sentences", () => {
    const premium = LANDING_EXPLORE.find(link => link.href === "/premium");
    expect(premium?.summary).toBe("Buy credits anytime. Credits you buy never expire.");
    const cost = LANDING_FAQ.find(entry => entry.question === "What does it cost?");
    expect(cost?.answer).toBe(`${MONEY_SENTENCE} Buy credits anytime. Credits you buy never expire. ${CREDIT_RULE}`);
    for (const line of [...LANDING_EXPLORE.flatMap(link => [link.label, link.summary]), ...LANDING_FAQ.flatMap(entry => [entry.question, entry.answer])]) {
      expect(line).not.toMatch(SINGLE_CREDIT_PRICE);
    }
  });

  it("the /premium route title and description name no per-credit price", () => {
    const premium = PUBLIC_ROUTES.find(entry => entry.route === "/premium");
    expect(premium?.title).toBe("Buy referral credits");
    expect(premium?.description).not.toMatch(SINGLE_CREDIT_PRICE);
    expect(premium?.description).toContain("Buy credits anytime.");
    for (const entry of PUBLIC_ROUTES) {
      expect(entry.title).not.toMatch(SINGLE_CREDIT_PRICE);
      expect(entry.description).not.toMatch(SINGLE_CREDIT_PRICE);
    }
  });

  it("/pricing points at /plans for today's pack prices", () => {
    render(<Pricing />);
    const line = screen.getByText(/Credit packs in rupees \(India\) or US dollars \(everywhere else\)/).closest("li");
    expect(line?.textContent).toBe("Credit packs in rupees (India) or US dollars (everywhere else); see /plans for today's prices.");
    expect(line?.querySelector("a")?.getAttribute("href")).toBe("/plans");
    expect(document.body.textContent).not.toMatch(SINGLE_CREDIT_PRICE);
  });

  it("the seeker credits card offers Add credits with no amount", () => {
    render(<SeekerCreditsCard credits={{ plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 0, purchasedCreditsRemaining: 0, totalAvailable: 0, cycleKey: "2026-10", subscriptionStatus: null, subscriptionCurrentTermEnd: null }} />);
    expect(screen.getByRole("link", { name: /^Add credits$/ }).getAttribute("href")).toBe("/premium?role=job_seeker");
    expect(document.body.textContent).not.toMatch(SINGLE_CREDIT_PRICE);
  });
});
