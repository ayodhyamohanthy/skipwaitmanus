// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminReview from "./AdminReview";

const { authState, go, search } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn(), search: { value: "" } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin-review", go],
  useSearch: () => search.value,
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); search.value = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

const REPORTS = [{ id: 48, reason: "Spam or repeated asks", details: "Same note 14 times", referralRequestId: 12, reportedUserId: null, urgent: true, status: "open", createdAt: "2026-09-02T08:00:00Z" }];
const COMPANIES = [{ id: 5, companyName: "Acme Corp", website: "https://acme.example", role: "seeker", status: "open", createdAt: "2026-09-01T08:00:00Z" }];
const QUEUE = [
  { kind: "referrer_enrollment", id: 31, status: "pending", companyDomain: "wipro.co.in", createdAt: "2026-09-02T06:00:00Z", updatedAt: "2026-09-02T06:00:00Z", summary: "", meta: { otpTime: "2026-09-02T05:59:00Z", referrerEmail: "kiran@wipro.co.in" } },
  { kind: "referral_request", id: 501, status: "pending", companyDomain: "tcs.com", createdAt: "2026-09-02T06:00:00Z", updatedAt: "2026-09-02T06:00:00Z", summary: "", meta: {} },
];

function stubQueue(decision: (url: string, init?: RequestInit) => Reply = () => reply({ ok: true, status: "resolved" }), overrides: Partial<Record<"reports" | "companies" | "queue", Reply>> = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("decision")) return decision(url, init);
    if (url.includes("safety-reports")) return overrides.reports ?? reply({ reports: REPORTS });
    if (url.includes("company-suggestions")) return overrides.companies ?? reply({ suggestions: COMPANIES });
    if (url.includes("approval-queue")) return overrides.queue ?? reply({ items: QUEUE });
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminReview /></QueryClientProvider>);
}

describe("AdminReview console", () => {
  it("lists real reports, enrollments and companies with no fabricated cases", async () => {
    stubQueue();
    renderPage();
    expect((await screen.findAllByText("Spam or repeated asks")).length).toBeGreaterThan(0);
    expect(screen.getByText("New company: Acme Corp")).toBeTruthy();
    expect(screen.getByText("Work-email enrollment @wipro.co.in")).toBeTruthy();
    expect(screen.queryByText(/tcs\.com/)).toBeNull();
    expect(screen.getByRole("tab", { name: /All 3/ })).toBeTruthy();
    expect(screen.queryByText("R-2048")).toBeNull();
    expect(screen.queryByText(/Freshworks/)).toBeNull();
    expect(screen.queryByText(/EXAMPLE CASES/)).toBeNull();
  });

  it("requires a reviewer note before deciding and records it", async () => {
    const fetchMock = stubQueue((url, init) => {
      expect(url).toBe("/api/admin/safety-reports/48/decision");
      expect(JSON.parse(String(init?.body))).toMatchObject({ status: "resolved", note: "Confirmed spam pattern." });
      return reply({ id: 48, status: "resolved" });
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Spam or repeated asks/ }));
    expect(screen.getByRole("button", { name: /Resolve with action/ }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Why this decision/), { target: { value: "Confirmed spam pattern." } });
    fireEvent.click(screen.getByRole("button", { name: /Resolve with action/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/safety-reports/48/decision", expect.objectContaining({ method: "POST" })));
  });

  it("records a verification decision through the approval queue", async () => {
    const fetchMock = stubQueue((url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ decision: "approved", note: "Domain belongs to Wipro." });
      return reply({ ok: true, status: "approved", decision: "approved" });
    });
    search.value = "tab=verifications";
    renderPage();
    expect(await screen.findByRole("heading", { name: "Work-email enrollment @wipro.co.in" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Why this decision/), { target: { value: "Domain belongs to Wipro." } });
    fireEvent.click(screen.getByRole("button", { name: /^Approve/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/approval-queue/referrer_enrollment/31/decision", expect.objectContaining({ method: "POST" })));
  });

  it("opens on the tab named in the link", async () => {
    stubQueue();
    search.value = "tab=companies";
    renderPage();
    expect((await screen.findByRole("tab", { name: /Companies 1/ })).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByRole("heading", { name: "New company: Acme Corp" })).toBeTruthy();
  });

  it("shows the admin gate without leaking queue contents", async () => {
    const denied = reply({ error: "Administrator access is required" }, 403);
    stubQueue(undefined, { reports: denied, companies: denied, queue: denied });
    renderPage();
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    expect(screen.queryByText("Spam or repeated asks")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("treats a signed-out session (401) as the access gate too", async () => {
    const anonymous = reply({ error: "Sign in to continue" }, 401);
    stubQueue(undefined, { reports: anonymous, companies: anonymous, queue: anonymous });
    renderPage();
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    expect(screen.queryByText("New company: Acme Corp")).toBeNull();
  });

  it("shows an honest empty queue", async () => {
    stubQueue(undefined, { reports: reply({ reports: [] }), companies: reply({ suggestions: [] }), queue: reply({ items: [] }) });
    renderPage();
    expect(await screen.findByText("Nothing to review right now.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /All 0/ })).toBeTruthy();
    expect(screen.getByText("No cases here right now.")).toBeTruthy();
  });

  it("shows a recorded decision instead of decision controls for a closed case", async () => {
    stubQueue(undefined, { reports: reply({ reports: [{ ...REPORTS[0], status: "resolved", updatedAt: "2026-09-02T09:00:00Z" }] }) });
    search.value = "tab=reports";
    renderPage();
    expect(await screen.findByText("Decision: Resolved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Resolve with action/ })).toBeNull();
    expect(screen.queryByPlaceholderText(/Why this decision/)).toBeNull();
  });

  it("records a company decision with the reviewer note", async () => {
    const fetchMock = stubQueue((url, init) => {
      expect(url).toBe("/api/admin/company-suggestions/5/decision");
      expect(JSON.parse(String(init?.body))).toMatchObject({ status: "approved", note: "Real employer, domain checked." });
      return reply({ id: 5, status: "approved" });
    });
    search.value = "tab=companies";
    renderPage();
    expect(await screen.findByRole("heading", { name: "New company: Acme Corp" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Why this decision/), { target: { value: "Real employer, domain checked." } });
    fireEvent.click(screen.getByRole("button", { name: /Approve for listing/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/company-suggestions/5/decision", expect.objectContaining({ method: "POST" })));
  });

  it("surfaces a rejected decision and keeps the note for another try", async () => {
    stubQueue(() => reply({ error: "This report was already resolved" }, 409));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Spam or repeated asks/ }));
    fireEvent.change(screen.getByPlaceholderText(/Why this decision/), { target: { value: "Confirmed spam pattern." } });
    fireEvent.click(screen.getByRole("button", { name: /Dismiss, no violation/ }));
    expect((await screen.findByText("This report was already resolved")).getAttribute("role")).toBe("alert");
    expect((screen.getByPlaceholderText(/Why this decision/) as HTMLTextAreaElement).value).toBe("Confirmed spam pattern.");
  });

  it("reports a network failure without fabricating cases", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderPage();
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toContain("We could not reach SkipWait");
    expect(screen.getByRole("tab", { name: /All 0/ })).toBeTruthy();
  });

  it("shows a failed load with a retry while other cases stay reviewable", async () => {
    const fetchMock = stubQueue(undefined, { queue: reply({ error: "We could not load the approval queue" }, 500) });
    renderPage();
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toContain("We could not load the approval queue");
    expect(screen.getAllByText("Spam or repeated asks").length).toBeGreaterThan(0);
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});
