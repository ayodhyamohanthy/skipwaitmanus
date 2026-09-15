// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminApprovalQueue from "./AdminApprovalQueue";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
const go = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/admin/approvals", go], Link: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

const requestItem = { kind: "referral_request", id: 501, status: "under_review", companyDomain: "acme.com", createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:00:00.000Z", summary: "I led a measurable product design launch.", meta: { claimTime: "2026-09-01T09:00:00.000Z", seekerName: "Avery", targetRoleUrl: "https://careers.acme.com/jobs/design", tokenCount: 1, creditReserved: true } };
const enrollmentItem = { kind: "referrer_enrollment", id: 77, status: "under_review", companyDomain: "acme.com", createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", summary: "Work email verified · awaiting a first referral action", meta: { otpTime: "2026-09-01T08:00:00.000Z", referrerName: "Blake", referrerEmail: "blake@acme.com" } };
const paymentItem = { kind: "payment", id: 33, status: "requires_review", companyDomain: "", provider: "chargebee", amount: 39600, currency: "INR", createdAt: "2026-09-01T07:00:00.000Z", updatedAt: "2026-09-01T07:00:00.000Z", summary: "provider_page_mismatch", meta: { tokenCount: 4, reason: "provider_page_mismatch" } };
const queueItems = [requestItem, enrollmentItem, paymentItem];

describe("administrator unified approval queue", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return { ok: true, json: async () => ({ ok: true, status: String(init.body).includes("rejected") ? "declined" : "approved", decision: String(init.body).includes("rejected") ? "rejected" : "approved" }) };
      return { ok: true, json: async () => ({ items: queueItems }) };
    }));
  });
  afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

  it("renders all three record kinds with shared card fields and opens the detail", async () => {
    render(<AdminApprovalQueue />);
    await waitFor(() => expect(screen.getByText("Ref-1501")).toBeTruthy());
    expect(screen.getByText("Blake")).toBeTruthy();
    expect(screen.getByText("Ref-PMT-1033")).toBeTruthy();
    const requestCard = screen.getByText("Ref-1501").closest("li")!;
    const enrollmentCard = screen.getByText("Blake").closest("li")!;
    const paymentCard = screen.getByText("Ref-PMT-1033").closest("li")!;
    expect(within(requestCard).getByText("Under review")).toBeTruthy();
    expect(within(enrollmentCard).getByText(/OTP verified/)).toBeTruthy();
    expect(within(paymentCard).getByText("Requires review")).toBeTruthy();
    expect(within(paymentCard).getAllByText(/provider_page_mismatch/).length).toBeGreaterThan(0);
    expect(within(requestCard).getByText("1 credit reserved")).toBeTruthy();
    fireEvent.click(within(requestCard).getByRole("button", { name: /Open record/ }));
    expect(go).toHaveBeenCalledWith("/admin/approvals/referral_request/501");
  });

  it("applies an Approve inline and updates the row badge without a reload", async () => {
    render(<AdminApprovalQueue />);
    await waitFor(() => expect(screen.getByText("Ref-PMT-1033")).toBeTruthy());
    const paymentCard = screen.getByText("Ref-PMT-1033").closest("li")!;
    fireEvent.click(within(paymentCard).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(within(paymentCard).getByText("Approved")).toBeTruthy());
    expect(within(paymentCard).queryByText("Requires review")).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url) === "/api/admin/approval-queue/payment/33/decision" && (init as RequestInit)?.method === "POST")).toBe(true);
  });

  it("shows the open-count pill and filters by status without a reload", async () => {
    render(<AdminApprovalQueue />);
    await waitFor(() => expect(screen.getByText("Ref-1501")).toBeTruthy());
    expect(screen.queryByText("3 open")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "under_review" } });
    expect(screen.getByText("2 open")).toBeTruthy();
    expect(screen.getByText("Ref-1501")).toBeTruthy();
    expect(screen.getByText("Blake")).toBeTruthy();
    expect(screen.queryByText("Ref-PMT-1033")).toBeNull();
  });

  it("shows the filtered empty state with the specified copy", async () => {
    render(<AdminApprovalQueue />);
    await waitFor(() => expect(screen.getByText("Ref-1501")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "approved" } });
    expect(screen.getByText(/Queue clear — No items match these filters/)).toBeTruthy();
    expect(screen.getByText(/Widen the date range or clear filters/)).toBeTruthy();
  });

  it("offers Retry decision when a decision fails and the record stays in the queue", async () => {
    let postCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) return { ok: false, status: 500, json: async () => ({ error: "We could not record this approval decision" }) };
        return { ok: true, json: async () => ({ ok: true, status: "approved", decision: "approved" }) };
      }
      return { ok: true, json: async () => ({ items: queueItems }) };
    }));
    render(<AdminApprovalQueue />);
    await waitFor(() => expect(screen.getByText("Ref-1501")).toBeTruthy());
    const card = screen.getByText("Ref-1501").closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByText(/Decision failed to save/)).toBeTruthy());
    expect(screen.getByText(/The record is unchanged and still in the queue. No notifications were sent./)).toBeTruthy();
    expect(screen.getByText("Ref-1501")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry decision" }));
    await waitFor(() => expect(within(card).getByText("Approved")).toBeTruthy());
  });
});
