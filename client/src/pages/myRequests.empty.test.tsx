// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyRequests from "./MyRequests";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/requests", go] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div data-skipwait-logo-mark="true" /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("My Requests empty state", () => {
  it("keeps a Job Seeker moving with a visual action state instead of empty-state text", async () => {
    render(<MyRequests />);
    await waitFor(() => expect(document.querySelector('[aria-label="No referral requests"]')).toBeTruthy());
    expect(document.querySelector('[data-skipwait-zero-action="job_seeker"]')).toBeTruthy();
    expect(document.querySelector('[data-skipwait-empty-preview="job-seeker"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share with someone who can help" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByText("No requests yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Request a referral" })).toBeTruthy();
  });

  it("shows the recorded sent, matched, and reviewed progress for an existing private request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [{ id: 12, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "approved", referrerId: 77, referrerMessage: "I can introduce you to the hiring team.", unreadMessageCount: 2, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-11T09:00:00.000Z", attachmentCount: 1 }] }) })));
    render(<MyRequests />);
    await waitFor(() => expect(screen.getByLabelText("Request progress")).toBeTruthy());
    expect(screen.getByLabelText("Request progress").textContent).toMatch(/Sent.*Matched.*Reviewed/);
    expect(screen.getByLabelText("Request progress").textContent).toContain("Updated");
    expect(screen.getByLabelText("Referrer update").textContent).toContain("I can introduce you to the hiring team.");
    expect(screen.getByRole("button", { name: "Open conversation · 2 new" })).toBeTruthy();
  });
});
