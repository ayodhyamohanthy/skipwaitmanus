// @vitest-environment jsdom
// Kit v4 /plans on live data: usage and upgrade moments only from the account's
// own summary, checkout dialog → hosted checkout, active-plan cancel renewal,
// payment-pending return, and no preview scaffolding or kit sample tiers.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Plans from "./Plans";

const { openedCheckout, authState, getToken } = vi.hoisted(() => ({ openedCheckout: vi.fn(), authState: { isSignedIn: true }, getToken: vi.fn(async () => "test-token") }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken, openSignIn: vi.fn() }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (url: string) => openedCheckout(url) }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));

type Handler = (url: string, init?: RequestInit) => { ok: boolean; status?: number; json: () => Promise<unknown> } | undefined;
const ok = (json: unknown) => ({ ok: true, json: async () => json });
const free = (remaining: number, purchased = 0) => ({ plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: remaining, purchasedCreditsRemaining: purchased, totalAvailable: remaining + purchased, subscriptionStatus: null, subscriptionCurrentTermEnd: null });
const pro = { plan: "pro", monthlyAllowance: 10, monthlyCreditsRemaining: 7, purchasedCreditsRemaining: 2, totalAvailable: 9, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z" };

function stub(summary: unknown, extra?: Handler) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const handled = extra?.(String(url), init);
    if (handled) return handled;
    if (String(url).includes("/api/credits/summary")) return ok({ summary });
    if (String(url).includes("/api/chargebee/gifts/mine")) return ok({ sent: [], claimable: [] });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => { authState.isSignedIn = true; window.history.pushState({}, "", "/plans?role=job_seeker"); openedCheckout.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

describe("Plans kit v4 on live data", () => {
  it("renders the live Free / Pro / Max catalog with no preview scaffolding or kit sample tiers", async () => {
    authState.isSignedIn = false;
    stub(null);
    render(<Plans />);
    expect(screen.getByRole("heading", { name: "Choose how much help you need." })).toBeTruthy();
    for (const name of ["Free", "Pro", "Max"]) expect(screen.getByRole("heading", { name, level: 2 })).toBeTruthy();
    expect(screen.getByText("3 free credits")).toBeTruthy();
    const text = document.body.textContent ?? "";
    for (const banned of ["DESIGN PREVIEW", "EXAMPLE PRICING", "PREVIEW DATA", "Most chosen", "Momentum", "Land", "Yearly", "2 mo free", "checkout preview"]) expect(text).not.toContain(banned);
    expect(screen.queryByLabelText("Your usage this cycle")).toBeNull();
    expect(screen.queryByText("Upgrade moments")).toBeNull();
  });

  it("shows the account's own usage and only the upgrade moments it has really hit", async () => {
    stub(free(0));
    render(<Plans />);
    expect(await screen.findByText("3 of 3")).toBeTruthy();
    expect(screen.getByText("Upgrade moments")).toBeTruthy();
    expect(screen.getByText("Your 3 requests are all in use")).toBeTruthy();
    expect(screen.getByText("You're out of credits")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I'll wait" }));
    expect(screen.queryByText("Your 3 requests are all in use")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Add credits" }).every(link => link.getAttribute("href") === "/premium?role=job_seeker")).toBe(true);
    cleanup();

    stub(free(2));
    render(<Plans />);
    expect(await screen.findByText("1 of 3")).toBeTruthy();
    expect(screen.queryByText("Upgrade moments")).toBeNull();
  });

  it("opens the checkout dialog from an upgrade moment and hands off to the hosted checkout", async () => {
    const fetchMock = stub(free(0), (url, init) => {
      if (!url.includes("/api/chargebee/subscription-checkout")) return undefined;
      expect(JSON.parse(String(init?.body))).toMatchObject({ plan: "pro", currency: "USD", billingCountry: "INTL", role: "job_seeker" });
      return ok({ checkoutUrl: "https://checkout.example/pro" });
    });
    render(<Plans />);
    fireEvent.click(await screen.findByRole("button", { name: "See Pro" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Pro — secure checkout" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Pay $7/month" }));
    await waitFor(() => expect(openedCheckout).toHaveBeenCalledWith("https://checkout.example/pro"));
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/subscription-checkout", expect.objectContaining({ method: "POST" }));
  });

  it("announces a failed checkout inside the dialog and never opens a checkout", async () => {
    stub(free(3), url => url.includes("/subscription-checkout") ? { ok: false, status: 502, json: async () => ({ error: "Unable to open secure plan checkout" }) } : undefined);
    render(<Plans />);
    await screen.findByText("0 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Max" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Pay $15/month" }));
    expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toContain("Unable to open secure plan checkout");
    expect(openedCheckout).not.toHaveBeenCalled();
  });

  it("marks the active plan, routes other plans to Manage plan and schedules cancel renewal", async () => {
    const fetchMock = stub(pro, url => url.includes("/subscription-cancel") ? ok({ currentTermEnd: "2026-11-06T00:00:00.000Z" }) : undefined);
    render(<Plans />);
    expect(await screen.findByText("Your plan")).toBeTruthy();
    expect(screen.getByText("Your current plan is active")).toBeTruthy();
    expect(within(screen.getByRole("heading", { name: "Max", level: 2 }).closest("article") ?? document.body).getByRole("link", { name: "Manage plan" }).getAttribute("href")).toBe("/billing");
    expect(screen.queryByRole("button", { name: /Upgrade to/ })).toBeNull();
    expect(screen.getByText("6 Nov 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel renewal" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel renewal" }));
    expect(await screen.findByText("Renewal is off")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/subscription-cancel", expect.objectContaining({ method: "POST" }));
  });

  it("shows the payment-pending return without plan cards", () => {
    window.history.pushState({}, "", "/plans?payment=pending");
    stub(free(3));
    render(<Plans />);
    expect(screen.getByRole("heading", { name: "We’re activating your monthly credits." })).toBeTruthy();
    expect(screen.getByRole("link", { name: /View my requests/ }).getAttribute("href")).toBe("/requests");
    expect(screen.queryByText("Choose how much help you need")).toBeNull();
  });
});
