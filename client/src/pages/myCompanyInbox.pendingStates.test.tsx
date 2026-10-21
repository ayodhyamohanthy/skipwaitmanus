// @vitest-environment jsdom
// The queue's hard states on the goal surface (D-048 phase 3): a pass that needs
// a picked reason, a failed load that keeps the queue intact, the acceptance
// race, the day-level clock, and the honest slow-load line.
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { go, getToken } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken }),
  useUser: () => ({ user: { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/queue", go], useSearch: () => "" }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "verified", access: { verified: true, domain: "acme.com", companyName: "Acme", companyInitials: "A" } }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const previewPayload = { request: { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/careers/product-designer", attachments: [{ id: 1, fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 1200, url: "/api/files/1" }] } };
const inboxItem = { id: 7, targetRoleUrl: "https://careers.acme.com/careers/product-designer", companyDomain: "acme.com", companyName: "Acme", status: "pending", referrerId: null, savedAt: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z", attachmentCount: 1, isClaimedByYou: false, unreadMessageCount: 0 };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = handler(url, init) as { __status?: number } | undefined;
    if (body && typeof body === "object" && "__status" in body) return { ok: false, status: body.__status, json: async () => ({ error: (body as { error?: string }).error }) };
    return { ok: true, status: 200, json: async () => body ?? {} };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const openAsk = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /Product Designer/ }));
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("My Company Inbox pending states", () => {
  it("records a decline only after one reason is picked, and can be cancelled", async () => {
    const fetchMock = stubFetch(url => {
      if (url.includes("/preview")) return previewPayload;
      if (url.includes("/inbox?scope=new")) return { requests: [inboxItem] };
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/one-click-review")) return { status: "declined", declineReason: "role_not_a_fit" };
      return {};
    });
    render(<MyCompanyInbox />);
    await openAsk();
    fireEvent.click(await screen.findByRole("button", { name: /Pass privately/ }));

    // The pass states what the seeker sees, moves no credit, and posts nothing yet.
    const popover = await screen.findByTestId("goal-pass-reasons");
    expect(popover.textContent).toContain("Never your name.");
    expect(popover.textContent?.toLowerCase()).not.toMatch(/credit|token|refund/);
    expect(within(popover).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/one-click-review"))).toBe(false);

    fireEvent.click(within(popover).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByTestId("goal-pass-reasons")).toBeNull());
    expect(screen.getByRole("button", { name: /Accept & connect/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Pass privately/ }));
    fireEvent.click(within(await screen.findByTestId("goal-pass-reasons")).getByRole("radio", { name: /Not my team or function/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "role_not_a_fit", passReason: "not_my_team" }) })));
  });

  it("keeps the queue intact and offers Try again when the inbox fails to load", async () => {
    let attempts = 0;
    const fetchMock = stubFetch(url => {
      if (url.includes("/inbox?scope=new")) { attempts += 1; return attempts === 1 ? { __status: 503, error: "Private company inbox is temporarily unavailable" } : { requests: [] }; }
      if (url.includes("/inbox")) return { requests: [] };
      return {};
    });
    render(<MyCompanyInbox />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load your queue");
    expect(alert.textContent).toContain("Nothing changed on your side. Your queue is intact.");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText("Ready to help?")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/inbox?scope=new")).length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces the race-condition copy and returns to the queue", async () => {
    stubFetch((url, init) => {
      if (url.includes("/preview")) return previewPayload;
      if (url.includes("/inbox?scope=new")) return { requests: [inboxItem] };
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/one-click-review") && init?.method === "POST") return { __status: 409, error: "This referral request is no longer available" };
      return {};
    });
    render(<MyCompanyInbox />);
    await openAsk();
    fireEvent.click(await screen.findByRole("button", { name: /Accept & connect/ }));
    fireEvent.click(within(await screen.findByTestId("goal-sheet")).getByRole("button", { name: /Accept & connect/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Accept failed");
    expect(alert.textContent).toContain("Another employee accepted this request a moment earlier. Nothing was charged to your credits.");
    // The phone sub-header returns to the list in place, and the ask stays open behind it.
    fireEvent.click(screen.getByRole("link", { name: "Referral queue" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Accept & connect/ })).toBeNull());
    expect(screen.getAllByTestId("goal-list-row")).toHaveLength(1);
  });

  it("shows the ask's day-level clock on the row and in the detail", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const item = { ...inboxItem, id: 9, targetRoleUrl: "https://careers.acme.com/careers/senior-data-analyst", createdAt: new Date(now - 4 * day).toISOString(), updatedAt: new Date(now - 4 * day).toISOString(), expiresAt: new Date(now + 3 * day + 3_600_000).toISOString() };
    stubFetch(url => url.includes("/preview") ? { request: { ...previewPayload.request, id: 9 } } : url.includes("/inbox?scope=new") ? { requests: [item] } : { requests: [] });
    render(<MyCompanyInbox />);
    const row = await screen.findByRole("button", { name: /Senior Data Analyst/ });
    expect(row.textContent).toContain("3 days left");
    fireEvent.click(row);
    expect(await screen.findByText("Closes")).toBeTruthy();
  });

  it("tells the Referrer honestly when the queue is taking longer than expected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let release: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/inbox?scope=new")) return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ requests: [] }) }); });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getByTestId("goal-skeleton-rows")).toBeTruthy());
    expect(screen.queryByText(/Still loading/)).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
    expect(screen.getByText(/Still loading your company’s private requests/)).toBeTruthy();

    await act(async () => { release?.(); await vi.advanceTimersByTimeAsync(400); });
    await waitFor(() => expect(screen.queryByTestId("goal-skeleton-rows")).toBeNull());
  });
});
