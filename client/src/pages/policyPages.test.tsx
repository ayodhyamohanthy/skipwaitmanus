// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Terms from "./Terms";
import RefundPolicy from "./RefundPolicy";
import ShippingPolicy from "./ShippingPolicy";
import About from "./About";
import Contact from "./Contact";
import Pricing from "./Pricing";
import Support from "./Support";
import Settings from "./Settings";
import NotFound from "./NotFound";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token") }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { emailAddresses: [{ emailAddress: "seeker@gmail.com", verification: { status: "verified" } }] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children ?? "Sign in"}</>,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const policyLinks = (container: HTMLElement) => Array.from(container.querySelectorAll('nav[aria-label="Policies"] a')).map(a => a.getAttribute("href"));

describe("legal and support disclosures (pre-launch P0 gate)", () => {
  it("Terms restate credit and privacy behaviour and never promise a hiring outcome", () => {
    const { container } = render(<Terms />);
    expect(document.querySelector('[data-skipwait-screen="terms"]')).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Plain terms");
    expect(screen.getByText(/We do not promise an interview, an offer, or any hiring outcome/)).toBeTruthy();
    expect(screen.getByText(/3 free referral credits each month/)).toBeTruthy();
    expect(screen.queryByText("Draft · pending legal review")).toBeNull();
    expect(policyLinks(container)).toEqual(["/terms", "/privacy", "/refunds", "/shipping", "/pricing", "/about", "/contact", "/support"]);
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/");
  });

  it("Refund policy matches the billing rules the product enforces", () => {
    render(<RefundPolicy />);
    expect(document.querySelector('[data-skipwait-screen="refund-policy"]')).toBeTruthy();
    expect(screen.getByText(/reserves one credit/)).toBeTruthy();
    expect(screen.getByText(/withdraw before a verified employee claims/)).toBeTruthy();
    expect(screen.getByText(/until the end of the current billing cycle/)).toBeTruthy();
    expect(screen.getByText(/approved by a skipwait.me administrator/)).toBeTruthy();
    expect(screen.getByText(/free for Referrers/)).toBeTruthy();
  });

  it("Shipping policy states credits are digital, delivered instantly, and nothing ships", () => {
    const { container } = render(<ShippingPolicy />);
    expect(document.querySelector('[data-skipwait-screen="shipping-policy"]')).toBeTruthy();
    expect(screen.getByText(/No physical goods are shipped/)).toBeTruthy();
    expect(screen.getByText(/added to your account instantly/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Refunds & cancellation" }).every(link => link.getAttribute("href") === "/refunds")).toBe(true);
    expect(policyLinks(container)).toContain("/shipping");
  });

  it("About, Contact, Pricing and Privacy policy name the operator and real prices for payment-provider review", () => {
    render(<About />);
    expect(screen.getAllByText(/Ayodhya Ram Mohanthy/).length).toBeGreaterThan(0);
    cleanup();
    render(<Contact />);
    expect(screen.getByText(/Operated by:/).parentElement?.textContent).toContain("Ayodhya Ram Mohanthy");
    expect(screen.getAllByRole("link", { name: "support@skipwait.me" })[0].getAttribute("href")).toBe("mailto:support@skipwait.me");
    cleanup();
    render(<Pricing />);
    expect(screen.getByText(/₹599\/month or \$7\/month/)).toBeTruthy();
    expect(screen.getByText(/₹1,299\/month or \$15\/month/)).toBeTruthy();
    expect(screen.getByText(/₹99 per credit/)).toBeTruthy();
  });

  it("Support offers one primary email action plus self-serve routes to existing screens", () => {
    render(<Support />);
    expect(document.querySelector('[data-skipwait-screen="support"]')).toBeTruthy();
    const email = screen.getByRole("link", { name: /Email support@skipwait.me/ });
    expect(email.getAttribute("href")).toMatch(/^mailto:support@skipwait\.me\?subject=/);
    expect(screen.getByRole("link", { name: /Re-check payment/ }).getAttribute("href")).toBe("/premium");
    expect(screen.getByRole("link", { name: /Open My requests/ }).getAttribute("href")).toBe("/requests");
    expect(screen.getAllByRole("link", { name: /Open Settings|Privacy controls/ }).every(link => link.getAttribute("href") === "/settings")).toBe(true);
    expect(screen.queryByText("Draft · pending legal review")).toBeNull();
  });

  it("Settings and NotFound link to the disclosures so they are reachable before account commitment", () => {
    render(<Settings />);
    const legalNav = screen.getByRole("navigation", { name: "Legal and support" });
    expect(Array.from(legalNav.querySelectorAll("a")).map(a => a.getAttribute("href"))).toEqual(["/terms", "/refunds", "/support"]);
    cleanup();
    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/support");
  });
});
