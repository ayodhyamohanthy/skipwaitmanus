// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Terms from "./Terms";
import Guidelines from "./Guidelines";
import RefundPolicy from "./RefundPolicy";
import ShippingPolicy from "./ShippingPolicy";
import About from "./About";
import Contact from "./Contact";
import Pricing from "./Pricing";
import Support from "./Support";
import Settings from "./Settings";
import NotFound from "./NotFound";
import { firstPackClaim } from "@shared/planCatalog";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token") }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { emailAddresses: [{ emailAddress: "seeker@gmail.com", verification: { status: "verified" } }] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children ?? "Sign in"}</>,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined, isError: false, refetch: () => Promise.resolve() }) }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "none", access: { verified: false } }) }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
// Settings reads talent-consent state through tRPC; without this the render
// throws "Unable to find tRPC Context" instead of checking the disclosure links.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    talentConsent: {
      state: { useQuery: () => ({ data: undefined, isLoading: false }) },
      grant: { useMutation: () => ({ mutate: vi.fn() }) },
      revoke: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    useUtils: () => ({ talentConsent: { state: { invalidate: vi.fn() } } }),
  },
}));

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const policyLinks = (container: HTMLElement) => Array.from(container.querySelectorAll('nav[aria-label="Policies"] a')).map(a => a.getAttribute("href"));

describe("legal and support disclosures (pre-launch P0 gate)", () => {
  it("Terms restate credit and privacy behaviour and never promise a hiring outcome", () => {
    const { container } = render(<Terms />);
    expect(document.querySelector('[data-skipwait-screen="terms"]')).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Terms.");
    // The live preamble, including the acceptance clause, stays on the page.
    expect(screen.getByText(/Plain terms for a private referral handoff\. .*By creating an account or using skipwait\.me, you agree to these terms\./)).toBeTruthy();
    expect(screen.getByText(/We do not promise an interview, an offer, or any hiring outcome/)).toBeTruthy();
    expect(screen.getByText(/3 free referral credits each month/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The short version" })).toBeTruthy();
    expect(screen.getByText(/Referrals are always free/)).toBeTruthy();
    expect(screen.queryByText("Draft · pending legal review")).toBeNull();
    // The kit's design-only banner never ships.
    expect(document.body.textContent).not.toMatch(/DRAFT FOR DESIGN|placeholder address/i);
    expect(policyLinks(container)).toEqual(["/terms", "/guidelines", "/privacy", "/refunds", "/cancellations", "/shipping", "/pricing", "/about", "/contact", "/support"]);
    expect(screen.getByRole("link", { name: "skipwait.me home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("navigation", { name: "Legal" }).querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/terms");
  });

  it("Terms keep every live clause, each reachable from the On this page rail", () => {
    const { container } = render(<Terms />);
    const clauses = ["What skipwait.me is", "Accounts and verification", "Credits, plans, and payment", "Privacy inside a request", "Acceptable use", "Administrator review", "Liability and changes", "Contact", "Business identity", "Governing law", "Grievance officer"];
    const headings = screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent);
    clauses.forEach((clause, index) => expect(headings).toContain(`${index + 1}. ${clause}`));
    const rail = screen.getByRole("navigation", { name: "On this page" });
    const anchors = Array.from(rail.querySelectorAll("a"));
    expect(anchors.map(anchor => anchor.textContent)).toEqual(clauses);
    for (const anchor of anchors) expect(container.querySelector(anchor.getAttribute("href") ?? "#missing")).toBeTruthy();
    expect(screen.getByText(/Grievance officer: /).textContent).toContain("within 48 hours");
    expect(screen.getAllByRole("link", { name: "support@skipwait.me" }).every(link => link.getAttribute("href") === "mailto:support@skipwait.me")).toBe(true);
  });

  it("Guidelines carry the no-money rules and the D-063 cost line, published, with no intro paragraph", () => {
    const { container } = render(<Guidelines />);
    expect(document.querySelector('[data-skipwait-screen="guidelines"]')).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Guidelines." })).toBeTruthy();
    expect(screen.getByText(/No money, gifts, or favours — before or after\. Seekers: if anyone asks for payment, report it\./)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The short version" })).toBeTruthy();
    expect(screen.getByText("Never pay a referrer, and never ask a seeker for money.")).toBeTruthy();
    expect(screen.getByText("3 free referrals every month; extra asks use credits. Referrers are never paid and never ask you for money.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Referrals are free|free referrals(?! every month)/i);
    expect(screen.queryByText(/Draft · pending legal review/)).toBeNull();
    expect(screen.queryByText(/Breaking these rules can limit or close an account/)).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toContain("6. What happens if rules are broken");
    expect(document.body.textContent).not.toMatch(/DRAFT FOR DESIGN|placeholder address/i);
    expect(policyLinks(container)).toContain("/guidelines");
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeTruthy();
  });

  it("Refund policy matches the billing rules the product enforces", () => {
    render(<RefundPolicy />);
    expect(document.querySelector('[data-skipwait-screen="refund-policy"]')).toBeTruthy();
    expect(screen.getByText(/The moment one can see your ask, 1 credit is used/)).toBeTruthy();
    expect(screen.getByText(/withdraw before someone picks the ask up/)).toBeTruthy();
    expect(screen.getByText(/not on sale right now/)).toBeTruthy();
    expect(screen.queryByText(/Momentum|Keep warm/)).toBeNull();
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
    // D-067 removed the Pro/Max plans: /pricing lists only what can be bought today.
    // POSTMERGE-oct22 #534: assert the rendered values against the catalog source, not literals,
    // so a pack-price change in shared/planCatalog.ts fails here instead of silently going stale.
    expect(screen.getByText(firstPackClaim("INR")!)).toBeTruthy();
    expect(screen.getByText(firstPackClaim("USD")!)).toBeTruthy();
    const text = document.body.textContent ?? "";
    for (const retired of ["₹599", "$7/month", "₹1,299", "$15/month", "Pro", "Max"]) expect(text).not.toContain(retired);
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

  it("Settings and NotFound keep the kit bodies; the shell's More menu (Help & safety) carries the disclosures", () => {
    // Owner decision (Oct 9 2026): the kit screens win, so neither body repeats
    // a legal row or a support line. Both render inside the app shell, whose
    // More menu opens Help & safety with Terms, Privacy and Support.
    render(<Settings />);
    expect(screen.queryByRole("navigation", { name: "Legal and support" })).toBeNull();
    cleanup();
    render(<NotFound />);
    expect(screen.queryByRole("link", { name: "Contact support" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "More" }).length).toBeGreaterThan(0);
  });
});

describe("decline keeps the credit spent (founder decision, Oct 14 2026)", () => {
  it("Terms say a decline does not return the credit", () => {
    const { container } = render(<Terms />);
    const text = container.textContent ?? "";
    expect(text).toContain("the credit stays spent, even if they pass");
    expect(text).not.toMatch(/reserved when a request is sent/);
    expect(text).not.toMatch(/Momentum|Keep warm/);
  });
  it("Refund policy lists withdraw and expiry as returns, and a decline as spent", () => {
    const { container } = render(<RefundPolicy />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/picks your request up, the credit stays spent/);
    expect(text).not.toMatch(/reserves one credit/);
    expect(text).toMatch(/expires unclaimed/);
  });
});

describe("public credit copy matches the decline rule", () => {
  it("no landing, premium or guide copy says a credit is used only on acceptance", async () => {
    const { LANDING_FAQ } = await import("@shared/landingContent").then(m => ({ LANDING_FAQ: Object.values(m).flat().map(v => JSON.stringify(v)).join(" ") }));
    const routes = await import("@shared/publicRoutes").then(m => JSON.stringify(Object.values(m)));
    const guides = await import("@/content/guides").then(m => JSON.stringify(Object.values(m)));
    for (const blob of [LANDING_FAQ, routes, guides]) expect(blob).not.toMatch(/only when an employee accepts|only spent when an employee accepts|consumed on acceptance|spent on acceptance/);
    // D-063: the cost answer is the credit rule exactly as the ledger keeps it,
    // never "spent once picked up" with an unconditional credit back.
    const { CREDIT_RULE } = await import("@shared/moneyCopy");
    expect(LANDING_FAQ).toContain(CREDIT_RULE);
    expect(LANDING_FAQ).not.toMatch(/withdrawn or expired asks get the credit back|spent once a verified employee picks up/);
  });
});
