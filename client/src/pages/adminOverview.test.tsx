// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOverview from "./AdminOverview";

const { authState, getToken } = vi.hoisted(() => ({ authState: { isSignedIn: true }, getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, getToken }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/admin"] }));

beforeEach(() => { authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

const HEALTH = { health: { funnel: { requestsCreated: 12, requestsClaimed: 5, decisionsRecorded: 4, waitingForCoverage: 3 }, coverageGaps: [{ companyDomain: "acme.com", waitingRequests: 3, verifiedCoverage: 0 }], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } } };
const QUEUE = { items: [
  { kind: "referrer_enrollment", id: 7, status: "pending", companyDomain: "wipro.com", createdAt: "2026-10-08T02:00:00Z", updatedAt: "2026-10-08T02:00:00Z", summary: "", meta: {} },
  { kind: "referrer_enrollment", id: 8, status: "approved", companyDomain: "tcs.com", createdAt: "2026-10-07T02:00:00Z", updatedAt: "2026-10-07T03:00:00Z", summary: "", meta: {} },
  { kind: "referral_request", id: 501, status: "pending", companyDomain: "tcs.com", createdAt: "2026-10-08T01:00:00Z", updatedAt: "2026-10-08T01:00:00Z", summary: "", meta: {} },
] };
const REPORTS = { reports: [
  { id: 1, reason: "Spam or repeated asks", details: null, referralRequestId: null, reportedUserId: null, urgent: true, status: "open", createdAt: "2026-10-08T03:00:00Z" },
  { id: 2, reason: "Something else", details: null, referralRequestId: null, reportedUserId: null, urgent: false, status: "resolved", createdAt: "2026-10-01T03:00:00Z" },
] };

function stub(overrides: Partial<Record<"health" | "queue" | "reports", Reply>> = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("flow-health")) return overrides.health ?? reply(HEALTH);
    if (url.includes("approval-queue")) return overrides.queue ?? reply(QUEUE);
    if (url.includes("safety-reports")) return overrides.reports ?? reply(REPORTS);
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminOverview /></QueryClientProvider>);
}

describe("AdminOverview", () => {
  it("gates the console behind admin sign-in", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    renderPage();
    expect(screen.getByText("Operations console")).toBeTruthy();
    expect(screen.queryByText("Operate for trust, not vanity.")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders live funnel aggregates, queue counts and tool links, never fabricated people", async () => {
    stub();
    renderPage();
    expect(await screen.findByText("Operate for trust, not vanity.")).toBeTruthy();
    expect(await screen.findByText("Requests created")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("acme.com")).toBeTruthy();
    const snapshot = screen.getByLabelText("Operations snapshot");
    expect(await within(snapshot).findByText("Referrer enrollments awaiting review")).toBeTruthy();
    expect(within(snapshot).getByText("1 urgent")).toBeTruthy();
    expect(within(snapshot).getByText("No fabricated count")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Approval queue/ }).getAttribute("href")).toBe("/admin/approvals");
    expect(screen.getByRole("link", { name: /Safety review/ }).getAttribute("href")).toBe("/admin-review");
    expect(screen.queryByText(/DESIGN PREVIEW|ILLUSTRATIVE|NO LIVE DATA/)).toBeNull();
    expect(screen.queryByText(/Avery|Rahul/)).toBeNull();
  });

  it("opens the company directory from the priority queue and filters it", async () => {
    stub();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Review company submissions/ }));
    expect(screen.getByText("Launch directory.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Submissions" }).getAttribute("href")).toBe("/admin-review?tab=companies");
    expect(screen.getByRole("link", { name: "Review Wipro" }).getAttribute("href")).toBe("/explore/wipro");
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "merkle" } });
    expect(screen.queryByText("Wipro")).toBeNull();
    expect(screen.getByText("Merkle")).toBeTruthy();
  });

  it("routes the verification and safety sections to the matching review queue tab", async () => {
    stub();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Review work-email exceptions/ }));
    expect(await screen.findByText("1 enrollment waiting for review.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open review queue" }).getAttribute("href")).toBe("/admin-review?tab=verifications");
    fireEvent.click(screen.getByRole("button", { name: /Safety reports/ }));
    expect(screen.getByText("1 open report.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open review queue" }).getAttribute("href")).toBe("/admin-review?tab=reports");
  });

  it("hides the funnel when flow health fails instead of drawing empty bars", async () => {
    stub({ health: reply({ error: "We could not load referral flow health" }, 500) });
    renderPage();
    await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(screen.queryByLabelText("Live funnel")).toBeNull();
    expect(screen.queryByLabelText("Coverage gaps")).toBeNull();
  });

  it("shows the server-enforced admin gate without operations data", async () => {
    stub({ health: reply({ error: "Administrator access is required" }, 403), queue: reply({ error: "Administrator access is required" }, 403), reports: reply({ error: "Administrator access is required" }, 403) });
    renderPage();
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    expect(screen.queryByText("Operate for trust, not vanity.")).toBeNull();
  });

  it("shows a load failure with a working retry", async () => {
    const fetchMock = stub({ health: reply({ error: "We could not load referral flow health" }, 500) });
    renderPage();
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toContain("We could not load referral flow health");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});
