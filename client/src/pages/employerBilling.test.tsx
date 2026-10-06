// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import EmployerBilling from "./EmployerBilling";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/employer/billing", vi.fn()] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <span>skipwait.me</span> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

describe("EmployerBilling load failure", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("announces the failure and recovers through Try again", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false, status: 503, json: async () => ({ error: "We could not load your billing details" }) }
        : { ok: true, json: async () => ({ account: { credits: 5, budgetMonthlyUsdCents: null }, spend: [] }) };
    }));
    render(<EmployerBilling />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your billing details");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("5 unlock credits available")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBeGreaterThanOrEqual(3);
  });
});
