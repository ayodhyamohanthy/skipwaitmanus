// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { go, getToken } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken }),
  useUser: () => ({ user: { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/inbox", go] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div data-skipwait-logo-mark="true" /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const previewPayload = { request: { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [{ id: 1, fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 1200, url: "/api/files/1" }] } };
const inboxItem = { id: 7, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "pending", referrerId: null, savedAt: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z", attachmentCount: 1, unreadMessageCount: 0 };
const credits = { summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-08", subscriptionStatus: null, subscriptionCurrentTermEnd: null } };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = handler(url, init) as { __status?: number } | undefined;
    if (body && typeof body === "object" && "__status" in body) return { ok: false, status: body.__status, json: async () => ({ error: (body as { error?: string }).error }) };
    return { ok: true, json: async () => body ?? {} };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("My Company Inbox pending states", () => {
  it("asks for one confirmation before a decline is recorded, and can be cancelled", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("/preview")) return previewPayload;
      if (url.includes("/inbox?scope=new")) return { requests: [inboxItem] };
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/credits/summary")) return credits;
      if (url.includes("/one-click-review")) return { status: "declined", declineReason: "role_not_a_fit" };
      return {};
    });
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Open request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Not a fit" }));

    // Confirm step: nothing has been posted yet and the accept CTA is out of the way.
    expect(screen.getByRole("group", { name: "Confirm decline" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept & submit referral" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/one-click-review"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm decline" })).toBeNull();
    expect(screen.getByRole("button", { name: "Accept & submit referral" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Not a fit" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "role_not_a_fit" }) })));
  });

  it("keeps the queue intact and offers Try again when the inbox fails to load", async () => {
    let attempts = 0;
    const fetchMock = stubFetch((url) => {
      if (url.includes("/inbox?scope=new")) { attempts += 1; return attempts === 1 ? { __status: 503, error: "Private company inbox is temporarily unavailable" } : { requests: [] }; }
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/credits/summary")) return credits;
      return {};
    });
    render(<MyCompanyInbox />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load your queue");
    expect(alert.textContent).toContain("Private company inbox is temporarily unavailable");
    expect(alert.textContent).toContain("Your queue is intact");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText("Ready to help?")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/inbox?scope=new")).length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces the race-condition copy on the preview and sends the Referrer back to the queue", async () => {
    stubFetch((url, init) => {
      if (url.includes("/preview")) return previewPayload;
      if (url.includes("/inbox?scope=new")) return { requests: [inboxItem] };
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/credits/summary")) return credits;
      if (url.includes("/one-click-review") && init?.method === "POST") return { __status: 409, error: "This referral request is no longer available" };
      return {};
    });
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Open request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept & submit referral" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Accept failed");
    expect(alert.textContent).toContain("Another employee accepted this request a moment earlier. Nothing was charged to your credits.");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to queue" }));
    await waitFor(() => expect(document.querySelector('[data-skipwait-screen="company-inbox"]')).toBeTruthy());
  });

  it("shows the ask countdown on the request detail", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const item = { ...inboxItem, id: 9, createdAt: iso(now - 5 * day + 60_000), updatedAt: iso(now - 5 * day + 60_000) };
    stubFetch((url) => {
      if (url.includes("/preview")) return previewPayload;
      if (url.includes("/inbox?scope=new")) return { requests: [item] };
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/credits/summary")) return credits;
      return {};
    });
    render(<MyCompanyInbox />);
    expect(await screen.findByText(/Expires in 2 days/)).toBeTruthy();
  });

  it("tells the Referrer honestly when the queue is taking longer than 15 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let release: (() => void) | undefined;
    stubFetch(() => ({}));
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/inbox?scope=new")) return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ requests: [] }) }); });
      return Promise.resolve({ ok: true, json: async () => (url.includes("/credits/summary") ? credits : {}) });
    }));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(document.querySelector('[data-skipwait-loading="true"]')).toBeTruthy());
    expect(document.querySelector('[data-skipwait-loading-slow="true"]')).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
    expect(document.querySelector('[data-skipwait-loading-slow="true"]')?.textContent).toContain("taking longer than expected");

    await act(async () => { release?.(); await vi.advanceTimersByTimeAsync(400); });
    await waitFor(() => expect(document.querySelector('[data-skipwait-loading="true"]')).toBeNull());
  });
});
