// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Plans from "./Plans";

const { openSignIn } = vi.hoisted(() => ({ openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: vi.fn(), openSignIn }) }));
// Deterministic payment-route detection: the main regression covers the
// international-first presentation regardless of the host machine's time zone.
// Individual tests set mockBrowserRoute.current to exercise the other route.
const mockBrowserRoute = vi.hoisted(() => ({ current: "USD" as "USD" | "INR" }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => mockBrowserRoute.current }));

function openCheckout(plan: "Pro" | "Max") {
  fireEvent.click(screen.getByRole("button", { name: `Upgrade to ${plan}` }));
  return screen.getByRole("dialog");
}

describe("Plans automatic payment route", () => {
  afterEach(() => { cleanup(); openSignIn.mockClear(); });

  it("shows one detected international price first and reveals India payment only as a user correction", () => {
    mockBrowserRoute.current = "USD";
    window.history.pushState({}, "", "/plans?role=job_seeker");
    render(<Plans />);
    expect(screen.getByText("$7")).toBeTruthy();
    expect(screen.getByText(/PayPal \(USD\) · Secure hosted checkout via Chargebee/)).toBeTruthy();
    expect(screen.queryByText("India · INR")).toBeNull();
    expect(screen.queryByText("Outside India · USD")).toBeNull();

    let dialog = openCheckout("Pro");
    expect(within(dialog).getByText("Sign in to pay $7/month")).toBeTruthy();
    expect(within(dialog).getByText(/PayPal \(USD\)/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect(screen.getByText("₹599")).toBeTruthy();
    dialog = openCheckout("Pro");
    expect(within(dialog).getByText("Sign in to pay ₹599/month")).toBeTruthy();
    expect(within(dialog).getByText(/Razorpay \(INR\)/)).toBeTruthy();
    expect(screen.queryByText(/Global equivalent/)).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    dialog = openCheckout("Max");
    expect(within(dialog).getByText("Sign in to pay ₹1,299/month")).toBeTruthy();
    expect(screen.queryByText(/India regional price/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign in to pay ₹1,299/month" }));
    expect(openSignIn).toHaveBeenCalledTimes(1);
    const returnTo = String(openSignIn.mock.calls[0]?.[0]?.returnTo);
    expect(returnTo).toContain("plan=max");
    expect(returnTo).toContain("currency=INR");
    expect(returnTo).toContain("role=job_seeker");
  });

  it("shows the detected India route first for India browsers, with a quiet international correction", () => {
    mockBrowserRoute.current = "INR";
    window.history.pushState({}, "", "/plans?role=job_seeker");
    render(<Plans />);
    expect(screen.getByText(/Razorpay \(INR\)/)).toBeTruthy();
    expect(screen.queryByText(/PayPal/)).toBeNull();
    expect(within(openCheckout("Pro")).getByText("Sign in to pay ₹599/month")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use international payment/i }));
    expect(within(openCheckout("Pro")).getByText("Sign in to pay $7/month")).toBeTruthy();
    expect(screen.getAllByText(/PayPal/).length).toBeGreaterThan(0);
  });
});
