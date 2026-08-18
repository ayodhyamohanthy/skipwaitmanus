// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpportunityWall from "./OpportunityWall";

vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Opportunity Wall", () => {
  it("shows anonymous company opportunities and saves a role-url draft before the Job Seeker signs in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ opportunities: [{ id: 1, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: "Remote", walkInAt: null, walkInEndsAt: null, createdAt: "2026-08-14" }] }) })));
    render(<OpportunityWall />);
    await waitFor(() => expect(screen.getByText("Product Designer")).toBeTruthy());
    expect(screen.getByText("acme.com")).toBeTruthy();
    expect(screen.queryByText("employee@acme.com")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use this opportunity" }));
    expect(localStorage.getItem("bridge-target-url")).toBe("https://careers.acme.com/jobs/design");
    expect(JSON.parse(localStorage.getItem("skipwait-pwa-referral-draft") || "{}").targetUrl).toBe("https://careers.acme.com/jobs/design");
  });

  it("shares a company-specific coverage invite without exposing an employee or candidate", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ opportunities: [{ id: 1, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: "Remote", walkInAt: null, walkInEndsAt: null, createdAt: "2026-08-14" }] }) })));
    render(<OpportunityWall />);
    await waitFor(() => expect(screen.getByText("Product Designer")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /help build private coverage/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const payload = share.mock.calls[0]?.[0] as { text?: string; url?: string };
    expect(payload.text).toContain("acme.com");
    expect(payload.text).not.toContain("employee@");
    expect(payload.text).not.toContain("Product Designer");
    expect(payload.url).toContain("/referrer?company=acme.com");
  });

  it("uses a visual no-opening state with one share action when no internal openings are live", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ opportunities: [] }) })));
    render(<OpportunityWall />);
    await waitFor(() => expect(document.querySelector('[aria-label="No internal openings"]')).toBeTruthy());
    expect(document.querySelector('[data-skipwait-zero-action="job_seeker"]')).toBeTruthy();
    expect(screen.queryByText("No openings yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Request a referral" })).toBeTruthy();
  });
});
