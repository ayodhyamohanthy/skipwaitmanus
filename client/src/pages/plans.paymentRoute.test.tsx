// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Plans from "./Plans";

vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: false, getToken: vi.fn() }), useClerk: () => ({ openSignIn: vi.fn() }) }));
// Deterministic payment-route detection: the main regression covers the
// international-first presentation regardless of the host machine's time zone.
// Individual tests set mockBrowserRoute.current to exercise the other route.
const mockBrowserRoute = vi.hoisted(() => ({ current: "USD" as "USD" | "INR" }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => mockBrowserRoute.current }));

describe("Plans automatic payment route", () => {
  afterEach(() => cleanup());

  it("shows one detected international price first and reveals India payment only as a user correction", () => {
    window.history.pushState({}, "", "/plans?role=job_seeker");
    render(<Plans />);
    expect(screen.getByText("Pay $7/month")).toBeTruthy();
    expect(screen.getByText(/PayPal/)).toBeTruthy();
    expect(screen.queryByText("India · INR")).toBeNull();
    expect(screen.queryByText("Outside India · USD")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect(screen.getByText("Pay ₹599/month")).toBeTruthy();
    expect(screen.getByText(/Razorpay Domestic/)).toBeTruthy();
    expect(screen.queryByText(/Global equivalent/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /max/i }));
    expect(screen.getByText("Pay ₹1,299/month")).toBeTruthy();
    expect(screen.queryByText(/India regional price/)).toBeNull();
  });

  it("shows the detected India route first for India browsers, with a quiet international correction", () => {
    mockBrowserRoute.current = "INR";
    window.history.pushState({}, "", "/plans?role=job_seeker");
    render(<Plans />);
    expect(screen.getByText("Pay ₹599/month")).toBeTruthy();
    expect(screen.getByText(/Razorpay Domestic/)).toBeTruthy();
    expect(screen.queryByText(/PayPal/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use international payment/i }));
    expect(screen.getByText("Pay $7/month")).toBeTruthy();
    expect(screen.getByText(/PayPal/)).toBeTruthy();
  });
});
