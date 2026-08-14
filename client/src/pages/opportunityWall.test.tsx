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
});
