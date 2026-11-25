// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyRequests from "./MyRequests";

const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock("@shared/askReconfirm", async importOriginal => ({
  ...await importOriginal<typeof import("@shared/askReconfirm")>(),
  get ASK_RECONFIRM_ENABLED() { return flags.enabled; },
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 7, getToken: async () => "test-token", openSignIn: vi.fn() }),
  useUser: () => ({ user: { fullName: "Example Person", primaryEmailAddress: { emailAddress: "person@example.com" }, emailAddresses: [] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/requests", vi.fn()],
}));
// The existing goal suites cover shell rendering. Keep these request/mutation
// cases focused on the real list and control rather than the unrelated rail.
vi.mock("@/components/goal", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/goal")>(),
  GoalAppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

const row = {
  id: 501, title: "Platform Engineer", companyDomain: "example.com", companyName: "Example", companyInitials: "EX",
  status: "pending", referrerId: null, waitingForCoverage: true, queueStatus: "waiting_for_coverage", awaitingReconfirm: true,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", unreadMessageCount: 0, attachmentCount: 1,
};

function setup(options: { awaiting?: boolean; fail?: boolean; malformed?: boolean; network?: boolean } = {}) {
  let awaiting = options.awaiting ?? true;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/company-referrals/mine") return Response.json({ requests: [{ ...row, awaitingReconfirm: awaiting }], hasEverAsked: true, slots: { plan: "free", planLabel: "Free", open: 0, cap: 3, full: false, nextPlan: null } });
    if (url === "/api/company-referrals/501/reconfirm") {
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("include");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
      if (options.network) throw new TypeError("offline");
      if (options.fail) return Response.json({ error: "Try again" }, { status: 503 });
      if (options.malformed) return Response.json({ requestId: 999, confirmed: true });
      awaiting = false;
      return Response.json({ requestId: 501, confirmed: true });
    }
    if (url.includes("credits/summary")) return Response.json({ summary: { totalAvailable: 2 } });
    return Response.json({ error: "Not found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
  return fetch;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); flags.enabled = true; });

describe("My Requests confirmation", () => {
  it("shows a Confirm control only for an awaiting request and refreshes after success", async () => {
    const fetch = setup();
    await screen.findByText("Platform Engineer");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull());
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/reconfirm"))).toHaveLength(1);
    expect(screen.getAllByRole("link").some(link => link.getAttribute("href") === "/conversation/501")).toBe(true);
  });

  it("does not offer confirmation for a non-awaiting request", async () => {
    setup({ awaiting: false });
    await screen.findByText("Platform Engineer");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("keeps the new control hidden with the feature off even for a newer server payload", async () => {
    flags.enabled = false;
    const fetch = setup();
    await screen.findByText("Platform Engineer");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/reconfirm"))).toBe(false);
  });

  it.each([{ fail: true }, { network: true }, { malformed: true }])("explains a failed confirmation and preserves a retry (%o)", async failure => {
    setup(failure);
    await screen.findByText("Platform Engineer");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn’t confirm this referral request.");
    expect(screen.getByRole("button", { name: "Confirm" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Still want this referral request sent? Confirm to send it.")).toBeTruthy();
  });

  it("brings failed-confirmation feedback into view for recovery", async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      setup({ fail: true });
      await screen.findByText("Platform Engineer");
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      const alert = await screen.findByRole("alert");
      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "center" }));
      expect(scroll.mock.contexts[0]).toBe(alert);
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });
});
