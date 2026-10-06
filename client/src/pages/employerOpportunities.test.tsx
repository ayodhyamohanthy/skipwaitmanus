// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import EmployerOpportunities from "./EmployerOpportunities";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/employer/opportunities", vi.fn()] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <span>skipwait.me</span> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

describe("EmployerOpportunities load failure", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("announces the failure and recovers through Try again", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false, status: 503, json: async () => ({ error: "We could not load your opportunities" }) }
        : { ok: true, json: async () => ({ opportunities: [] }) };
    }));
    render(<EmployerOpportunities />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your opportunities");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No opportunities yet.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });
});
