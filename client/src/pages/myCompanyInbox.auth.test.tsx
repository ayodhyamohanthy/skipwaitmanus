// @vitest-environment jsdom
// Auth, gates and queue composition on the goal page (D-048 phase 3 W1):
// signed-out routing, the one-tap capacity action, header + row anatomy,
// deep links, pre-accept privacy, and the claimed-row hand-off to the thread.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyCompanyInbox from "./MyCompanyInbox";

const Queue = () => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MyCompanyInbox /></QueryClientProvider>;

const { go, getToken, search } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("t"), search: { value: "" } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken }),
  useUser: () => ({ user: { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/queue", go],
  useSearch: () => search.value,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "verified", access: { verified: true, domain: "acme.com", companyName: "Acme", companyInitials: "AC" } }) }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div data-skipwait-logo-mark="true" /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const row = (id: number, extra: Record<string, unknown> = {}) => ({ id, jobTitle: `Product Designer ${id}`, targetRoleUrl: null, companyDomain: "acme.com", companyName: "Acme", companyInitials: "AC", jobFunction: "Product", status: "pending", savedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attachmentCount: 1, isClaimedByYou: false, publicRef: `R-T${id}ST`, ...extra });
const previewOf = (id: number) => ({ request: { id, candidateName: `Seeker ${id}`, candidateMessage: "One\nTwo\nThree", companyDomain: "acme.com", targetRoleUrl: "https://acme.com/jobs/1", attachments: [{ id: 1 }], publicRef: `R-T${id}ST` } });

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = handler(url, init) as { __status?: number } | undefined;
    if (body && typeof body === "object" && "__status" in body) return { ok: false, status: body.__status, json: async () => ({ error: (body as { error?: string }).error }) };
    return { ok: true, json: async () => body ?? {} };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => { go.mockClear(); search.value = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("My Company Inbox auth and composition", () => {
  it("gives a verified employee a one-tap private capacity action when the queue is empty", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/availability/open")) return { availability: { allocatedCount: 0 } };
      return {};
    });
    render(<Queue />);
    expect(await screen.findByText("Ready to help?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open referral capacity" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/availability/open", expect.objectContaining({ method: "POST" })));
  });

  it("heads the queue with the count and Verified mark, rows with role, status and countdown", async () => {
    stubFetch((url) => (url.includes("scope=new") ? { requests: [row(3)] } : { requests: [] }));
    render(<Queue />);
    await screen.findByRole("button", { name: /Product Designer 3/ });
    expect(screen.getAllByRole("heading", { name: "Referral queue" }).length).toBeGreaterThan(0);
    expect(screen.getByText("1", { exact: false })).toBeTruthy();
    expect(screen.getByText(/waiting/)).toBeTruthy();
    expect(screen.getByText(/Verified/)).toBeTruthy();
    expect(screen.getByText(/Names and resumes stay hidden until you accept/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Settings/ }).getAttribute("href")).toBe("/referrer?view=setup");
    const queueRow = screen.getByRole("button", { name: /Product Designer 3/ });
    expect(queueRow.textContent).toContain("New");
    expect(queueRow.textContent).toContain("Product");
    expect(queueRow.textContent).toMatch(/\d+ days left/);
    expect(screen.getByText("Referrers are never charged.")).toBeTruthy();
  });

  it("lists routed new requests, then saved ones, deduped, without scope tabs or a pager", async () => {
    stubFetch((url) => (url.includes("scope=new") ? { requests: [row(3)] } : { requests: [row(3), row(9)] }));
    render(<Queue />);
    await screen.findByRole("button", { name: /Product Designer 3/ });
    await screen.findByRole("button", { name: /Product Designer 9/ });
    expect(screen.getAllByRole("button", { name: /Product Designer/ })).toHaveLength(2);
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("opens the request named in ?request= straight into its detail", async () => {
    search.value = "?request=9";
    stubFetch((url) => {
      if (url.includes("/preview")) return previewOf(9);
      return { requests: url.includes("scope=new") ? [row(3), row(9)] : [] };
    });
    render(<Queue />);
    const detail = await screen.findByTestId("goal-detail-pane");
    expect(detail.textContent).toContain("Product Designer 9");
    expect(detail.textContent).toContain("R-T9ST");
  });

  it("sends a claimed deep link to the conversation without fetching a private preview", async () => {
    search.value = "?request=9";
    const fetchMock = stubFetch(url => ({ requests: url.includes("scope=new") ? [row(9, { status: "approved", isClaimedByYou: true })] : [] }));
    render(<Queue />);
    await waitFor(() => expect(go).toHaveBeenCalledWith("/conversation/9?from=inbox"));
    expect(screen.queryByTestId("goal-detail-pane")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/preview"))).toBe(false);
  });

  it("shows Why me reasons and the role link but never the seeker's name before acceptance", async () => {
    stubFetch((url) => {
      if (url.includes("/preview")) return previewOf(7);
      return { requests: url.includes("scope=new") ? [row(7)] : [] };
    });
    render(<Queue />);
    fireEvent.click(await screen.findByRole("button", { name: /Product Designer 7/ }));
    const detail = await screen.findByTestId("goal-detail-pane");
    await waitFor(() => expect(detail.textContent).toContain("Three"));
    expect(detail.textContent).toContain("One");
    expect(detail.textContent).toContain("Identity and resume are shared after you accept");
    expect(detail.textContent).not.toContain("Seeker 7");
    expect(detail.textContent).not.toContain("resume.pdf");
    expect(detail.textContent).toContain("R-T7ST");
  });

  it("keeps decided requests out of the dock and hands an acceptance straight to the conversation", async () => {
    stubFetch((url) => (url.includes("scope=new") ? { requests: [row(5, { status: "approved", isClaimedByYou: true })] } : { requests: [] }));
    render(<Queue />);
    const queueRow = await screen.findByRole("button", { name: /Product Designer 5/ });
    expect(queueRow.textContent).toContain("Under review");
    fireEvent.click(queueRow);
    expect(go).toHaveBeenCalledWith("/conversation/5?from=inbox");
    expect(screen.queryByTestId("goal-detail-pane")).toBeNull();
  });
});
