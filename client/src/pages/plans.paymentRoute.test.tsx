// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Plans from "./Plans";

function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

const { openSignIn } = vi.hoisted(() => ({ openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: vi.fn(), openSignIn }) }));
// Deterministic payment-route detection: the main regression covers the
// international-first presentation regardless of the host machine's time zone.
// Individual tests set mockBrowserRoute.current to exercise the other route.
const mockBrowserRoute = vi.hoisted(() => ({ current: "USD" as "USD" | "INR" }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => mockBrowserRoute.current }));

// /plans prices the Free plan and a credit in the detected currency. It opens no
// plan checkout (D-067 removed Pro/Max), so no route ever reaches a dialog or sign-in.
describe("Plans automatic payment route", () => {
  afterEach(() => { cleanup(); openSignIn.mockClear(); });

  it("shows one detected international price first and reveals India prices only as a user correction", () => {
    mockBrowserRoute.current = "USD";
    window.history.pushState({}, "", "/plans?role=job_seeker");
    render(<Plans />);
    expect(screen.getByText("$0")).toBeTruthy();
    expect(screen.getByText("Credits")).toBeTruthy();
    expect(screen.getByText(/PayPal \(USD\) · Secure hosted checkout via Chargebee/)).toBeTruthy();
    expect(screen.queryByText("India · INR")).toBeNull();
    expect(screen.queryByText("Outside India · USD")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect(screen.getByText("₹0")).toBeTruthy();
    expect(screen.getByText("Credits")).toBeTruthy();
    expect(screen.getByText(/Razorpay \(INR\)/)).toBeTruthy();
    expect(screen.queryByText(/Global equivalent/)).toBeNull();
    expect(screen.queryByText(/India regional price/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /upgrade|sign in to pay/i })).toBeNull();
    expect(openSignIn).not.toHaveBeenCalled();
  });

  it("shows the detected India route first for India browsers, with a quiet international correction", () => {
    mockBrowserRoute.current = "INR";
    window.history.pushState({}, "", "/plans?role=job_seeker");
    render(<Plans />);
    expect(screen.getByText(/Razorpay \(INR\)/)).toBeTruthy();
    expect(screen.getByText("Credits")).toBeTruthy();
    expect(screen.queryByText(/PayPal/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use international payment/i }));
    expect(screen.getByText("Credits")).toBeTruthy();
    expect(screen.getAllByText(/PayPal/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
