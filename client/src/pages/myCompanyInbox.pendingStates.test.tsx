// @vitest-environment jsdom
// Queue pending-state behaviour on the goal page (D-048 phase 3 W1): the
// decision dock (Pass privately / Accept & connect), the pass sheet posting a
// reason in one click, load-failure recovery, the accept race, the mono
// countdown and the honest slow-load caption.
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyCompanyInbox from "./MyCompanyInbox";

const Queue = () => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MyCompanyInbox /></QueryClientProvider>;

const { go, getToken } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken }),
  useUser: () => ({ user: { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/queue", go], useSearch: () => "" }));
// The verified-referrer gate itself is covered in myCompanyInbox.serverAccess.test.tsx; these cases start verified.
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "verified", access: { verified: true, domain: "acme.com", companyName: null, companyInitials: null } }) }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div data-skipwait-logo-mark="true" /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const previewPayload = { request: { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [{ id: 1, fileName: "avery-resume.pdf" }], publicRef: "R-8F3K2" } };
const inboxItem = { id: 7, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: "Acme", status: "pending", referrerId: null, savedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attachmentCount: 1, isClaimedByYou: false, publicRef: "R-8F3K2" };

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
  it("passes privately with one reason click, and Cancel records nothing", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("/preview")) return previewPayload;
      if (url.includes("/inbox?scope=new")) return { requests: [inboxItem] };
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/one-click-review")) return { status: "declined" };
      return {};
    });
    render(<Queue />);
    fireEvent.click(await screen.findByRole("button", { name: /Private ask/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Pass privately/ }));
    const sheet = await screen.findByTestId("goal-sheet");
    expect(sheet.textContent).toContain("Never your name.");
    // Seven reasons, including Prefer not to say; nothing posted until one is picked.
    expect(screen.getByRole("button", { name: /Not my team or function/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Prefer not to say/ })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/one-click-review"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("goal-sheet")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/one-click-review"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Pass privately/ }));
    fireEvent.click(screen.getByRole("button", { name: /Not my team or function/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "role_not_a_fit", passReason: "not_my_team" }) })));
  });

  it("keeps the queue intact and offers Try again when the inbox fails to load", async () => {
    let attempts = 0;
    const fetchMock = stubFetch((url) => {
      if (url.includes("/inbox?scope=new")) { attempts += 1; return attempts === 1 ? { __status: 503, error: "Private company inbox is temporarily unavailable" } : { requests: [] }; }
      if (url.includes("/inbox")) return { requests: [] };
      return {};
    });
    render(<Queue />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load your queue");
    expect(alert.textContent).toContain("Private company inbox is temporarily unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText("Ready to help?")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/inbox?scope=new")).length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces the race-condition copy and keeps the queue in view", async () => {
    stubFetch((url, init) => {
      if (url.includes("/preview")) return previewPayload;
      if (url.includes("/inbox?scope=new")) return { requests: [inboxItem] };
      if (url.includes("/inbox")) return { requests: [] };
      if (url.includes("/one-click-review") && init?.method === "POST") return { __status: 409, error: "This referral request is no longer available" };
      return {};
    });
    render(<Queue />);
    fireEvent.click(await screen.findByRole("button", { name: /Private ask/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Accept & connect/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Accept failed");
    expect(alert.textContent).toContain("Another employee accepted this request a moment earlier. Nothing was charged to your credits.");
    // The list stays in view; the referrer picks the next ask.
    expect(screen.getByRole("button", { name: /Private ask/ })).toBeTruthy();
  });

  it("shows the mono ask countdown on the row and the detail", async () => {
    stubFetch((url) => {
      if (url.includes("/preview")) return previewPayload;
      if (url.includes("/inbox?scope=new")) return { requests: [inboxItem] };
      if (url.includes("/inbox")) return { requests: [] };
      return {};
    });
    render(<Queue />);
    const row = await screen.findByRole("button", { name: /Private ask/ });
    expect(row.textContent).toMatch(/\d+ days left/);
    fireEvent.click(row);
    const detail = await screen.findByTestId("goal-detail-pane");
    expect(detail.textContent).toMatch(/\d+ days left/);
    expect(detail.textContent).toContain("R-8F3K2");
  });

  it("tells the Referrer honestly when the queue is taking longer than 15 seconds", async () => {
    vi.useFakeTimers();
    stubFetch(() => new Promise(() => undefined));
    render(<Queue />);
    expect(screen.getByTestId("goal-skeleton-rows")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(15_500); });
    expect(screen.getByRole("status").textContent).toContain("Still loading. Your queue is intact.");
  });
});
