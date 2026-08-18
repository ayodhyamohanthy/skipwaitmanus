// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Plans from "./Plans";

vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: false, getToken: vi.fn() }), useClerk: () => ({ openSignIn: vi.fn() }) }));

describe("Plans automatic payment route", () => {
  afterEach(() => cleanup());

  it("shows one detected international price first and reveals India payment only as a user correction", () => {
    window.history.pushState({}, "", "/plans?role=job_seeker");
    render(<Plans />);
    expect(screen.getByText("Pay $10/month")).toBeTruthy();
    expect(screen.getByText(/PayPal/)).toBeTruthy();
    expect(screen.queryByText("India · INR")).toBeNull();
    expect(screen.queryByText("Outside India · USD")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect(screen.getByText("Pay ₹599/month")).toBeTruthy();
    expect(screen.getByText(/Razorpay Domestic/)).toBeTruthy();
    expect(screen.getByText("Global equivalent ₹833/month")).toBeTruthy();
    expect(screen.getByText(/India regional price, 28% lower/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /max/i }));
    expect(screen.getByText("Pay ₹1,299/month")).toBeTruthy();
    expect(screen.getByText("Global equivalent ₹1,666/month")).toBeTruthy();
    expect(screen.getByText(/India regional price, 22% lower/)).toBeTruthy();
  });
});
