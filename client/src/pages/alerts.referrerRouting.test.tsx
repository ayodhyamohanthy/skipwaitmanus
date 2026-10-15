// @vitest-environment jsdom
// D-019: where an opened alert goes. Referral alerts follow the server's verified-referrer verdict
// (GET /api/company-referrals/access), never the sign-in account's email addresses.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Alerts from "./Alerts";

// The QA account signs in with Google (a personal address) and verified its work email by code.
const GMAIL_SESSION = { id: "user-1", emailAddresses: [{ emailAddress: "qa-sweep-2@gmail.com", verification: { status: "verified" } }] };
const { authState, userState, go } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, userId: "user-1", getToken: vi.fn().mockResolvedValue("test-token") },
  userState: { user: null as unknown },
  go: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => userState,
  SignInButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => <button type="button" className={className}>{children}</button>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/alerts", go],
}));

// Fixed local midday so the rows group the same way whatever time CI runs.
const now = new Date(2026, 9, 9, 12, 0, 0).getTime();
const ITEMS = [
  { id: 1, category: "referral", title: "Your ask was accepted", body: "A verified referrer at Wipro accepted", readAt: null, createdAt: new Date(now - 12 * 60000).toISOString() },
  { id: 2, category: "message", title: "New message", body: "Happy to help", readAt: null, createdAt: new Date(now - 60 * 60000).toISOString() },
  { id: 3, category: "system", title: "Weekly summary", body: "Your week on SkipWait", readAt: new Date(now - 2 * 86400000).toISOString(), createdAt: new Date(now - 2 * 86400000).toISOString() },
];

type FetchReply = { ok: boolean; status?: number; json: () => Promise<unknown> };
const ok = (body: unknown): FetchReply => ({ ok: true, status: 200, json: async () => body });
const list = (notifications: unknown[] = ITEMS) => ok({ notifications });

const ACCESS_PATH = "/api/company-referrals/access";
const VERIFIED_ACCESS = ok({ verifiedCompanyAccess: true, workEmailDomain: "skipwait.me", companyName: "SkipWait", companyInitials: "SW" });
const UNVERIFIED_ACCESS = ok({ verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
const FAILED_ACCESS: FetchReply = { ok: false, status: 500, json: async () => ({ error: "We could not check your company-email access" }) };

function renderAlerts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><Alerts /></QueryClientProvider>);
}

/** Serves the verdict before the list, so the row a test clicks was rendered after the verdict landed. */
function verdictThenList(access: FetchReply | "hang") {
  let served: () => void = () => undefined;
  const verdictServed = new Promise<void>(resolve => { served = resolve; });
  return vi.fn(async (url: string): Promise<FetchReply> => {
    if (String(url) === ACCESS_PATH) {
      served();
      return access === "hang" ? new Promise<FetchReply>(() => undefined) : access;
    }
    if (String(url).endsWith("/read")) return ok({ success: true });
    await verdictServed;
    await new Promise(resolve => setTimeout(resolve, 30));
    return list();
  });
}

async function openFirstReferralAlert(fetchMock: ReturnType<typeof verdictThenList>) {
  vi.stubGlobal("fetch", fetchMock);
  renderAlerts();
  fireEvent.click(await screen.findByRole("button", { name: /Your ask was accepted, unread/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/notifications/1/read", expect.objectContaining({ method: "POST" })));
  await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
  return go.mock.calls[0][0];
}

beforeEach(() => { authState.isSignedIn = true; authState.isLoaded = true; userState.user = null; go.mockReset(); vi.useFakeTimers({ toFake: ["Date"], now }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Alerts center routing", () => {
  it("opens a notification by marking it read then following its category", async () => {
    expect(await openFirstReferralAlert(verdictThenList(UNVERIFIED_ACCESS))).toBe("/requests");
  });

  it("opens referral alerts in /inbox for a Google sign-in whose work email the server verified by code (D-019)", async () => {
    userState.user = GMAIL_SESSION;
    const fetchMock = verdictThenList(VERIFIED_ACCESS);
    expect(await openFirstReferralAlert(fetchMock)).toBe("/inbox");
    expect(fetchMock).toHaveBeenCalledWith(ACCESS_PATH, expect.objectContaining({ credentials: "include" }));
  });

  it("does not trust a company address on the sign-in account: the server's 'not verified' keeps referral alerts on /requests", async () => {
    userState.user = { id: "user-1", emailAddresses: [{ emailAddress: "employee@skipwait.me", verification: { status: "verified" } }] };
    expect(await openFirstReferralAlert(verdictThenList(UNVERIFIED_ACCESS))).toBe("/requests");
  });

  it("opens referral alerts in /inbox, which serves both sides, when the verification check fails", async () => {
    userState.user = GMAIL_SESSION;
    expect(await openFirstReferralAlert(verdictThenList(FAILED_ACCESS))).toBe("/inbox");
  });

  it("opens referral alerts in /inbox while the verification check is still running", async () => {
    userState.user = GMAIL_SESSION;
    expect(await openFirstReferralAlert(verdictThenList("hang"))).toBe("/inbox");
  });

  it("keeps status and system alerts on their own pages whatever the verdict", async () => {
    const status = { id: 5, category: "status", title: "Request updated", body: "Your ask moved to Referred", readAt: null, createdAt: new Date(now - 60000).toISOString() };
    const fetchMock = vi.fn(async (url: string) => String(url) === ACCESS_PATH ? VERIFIED_ACCESS : String(url).endsWith("/read") ? ok({ success: true }) : list([status, ITEMS[2]]));
    vi.stubGlobal("fetch", fetchMock);
    renderAlerts();
    fireEvent.click(await screen.findByRole("button", { name: /Request updated, unread/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/requests"));
    fireEvent.click(screen.getByRole("button", { name: "Weekly summary" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/settings"));
  });
});
