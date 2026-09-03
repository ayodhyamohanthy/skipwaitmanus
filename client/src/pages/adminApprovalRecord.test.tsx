// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminApprovalRecord from "./AdminApprovalRecord";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("wouter", () => ({ useRoute: () => [true, { kind: "referral_request", id: "501" }] }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

const requestItem = { kind: "referral_request", id: 501, status: "under_review", companyDomain: "acme.com", createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:00:00.000Z", summary: "I led a measurable product design launch.", meta: { claimTime: "2026-09-01T09:05:00.000Z", seekerName: "Avery", seekerEmail: "avery@example.com", referrerName: "Blake", referrerEmail: "blake@acme.com", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", tokenCount: 1, creditReserved: true, pitch: "I led a measurable product design launch." } };
const activityEvent = { id: 91, action: "company_referral.created", outcome: "success", resourceType: "referral_request", resourceId: "501", metadata: null, createdAt: "2026-09-01T09:00:00.000Z", actorName: null, actorEmail: null };

describe("administrator approval record detail", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return { ok: true, json: async () => ({ ok: true, status: "approved", decision: "approved" }) };
      if (url.includes("/api/admin/activity")) return { ok: true, json: async () => ({ events: [activityEvent] }) };
      return { ok: true, json: async () => ({ items: [requestItem] }) };
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders the full record blocks and an ordered history with actors and timestamps", async () => {
    render(<AdminApprovalRecord />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ref-1501" })).toBeTruthy());
    expect(screen.getByText("Avery")).toBeTruthy();
    expect(screen.getByText("avery@example.com")).toBeTruthy();
    expect(screen.getByText("Blake")).toBeTruthy();
    expect(screen.getByText("Product Designer")).toBeTruthy();
    expect(screen.getByText("1 credit reserved")).toBeTruthy();
    expect(screen.getByText(/Request created/)).toBeTruthy();
    expect(screen.getByText("1 credit reserved (monthly)")).toBeTruthy();
    expect(screen.getByText(/Claimed by verified referrer/)).toBeTruthy();
    expect(screen.getAllByText(/System/).length).toBeGreaterThan(0);
  });

  it("saves a decision note, posts the approve decision, and updates the badge plus history", async () => {
    render(<AdminApprovalRecord />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ref-1501" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Decision note/), { target: { value: "Domain matches the invite code" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByText("Approved")).toBeTruthy());
    expect(screen.getByText(/Approved by admin/)).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url) === "/api/admin/approval-queue/referral_request/501/decision" && (init as RequestInit)?.method === "POST" && String((init as RequestInit).body).includes("Domain matches the invite code"))).toBe(true);
  });

  it("shows the failed-decision copy and retries the same decision", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts += 1;
        if (posts === 1) return { ok: false, status: 500, json: async () => ({ error: "This record was already resolved" }) };
        return { ok: true, json: async () => ({ ok: true, status: "approved", decision: "approved" }) };
      }
      if (url.includes("/api/admin/activity")) return { ok: true, json: async () => ({ events: [activityEvent] }) };
      return { ok: true, json: async () => ({ items: [requestItem] }) };
    }));
    render(<AdminApprovalRecord />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ref-1501" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByText(/Decision failed to save/)).toBeTruthy());
    expect(screen.getByText(/The record is unchanged and still in the queue. No notifications were sent./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry decision" }));
    await waitFor(() => expect(screen.getByText("Approved")).toBeTruthy());
  });
});
