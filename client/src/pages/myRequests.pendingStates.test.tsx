// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyRequests from "./MyRequests";

const { go, getToken } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/requests", go] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div data-skipwait-logo-mark="true" /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const pendingRequest = { id: 12, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "pending", referrerId: 77, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T09:41:00.000Z", updatedAt: "2026-09-02T14:05:00.000Z", attachmentCount: 1 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("My Requests pending states", () => {
  it("shows the honest empty headline alongside the visual action state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) })));
    render(<MyRequests />);
    expect(await screen.findByRole("heading", { name: "Nothing pending right now" })).toBeTruthy();
    expect(screen.getByText("Your sent requests and their outcomes will appear here.")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-zero-action="job_seeker"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request a referral" })).toBeTruthy();
  });

  it("renders a status history that never names the Referrer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [pendingRequest] }) })));
    render(<MyRequests />);
    const history = await screen.findByLabelText("Status history");
    expect(history.textContent).toMatch(/Request sent.*Claimed by a verified employee.*Decision.*waiting/);
    expect(history.textContent).not.toContain("77");
  });

  it("keeps the list intact and retries after a failed load", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/company-referrals/mine")) { attempts += 1; return attempts === 1 ? { ok: false, status: 503, json: async () => ({ error: "Referral service is temporarily unavailable" }) } : { ok: true, json: async () => ({ requests: [pendingRequest] }) }; }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyRequests />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load your requests");
    expect(alert.textContent).toContain("Referral service is temporarily unavailable");
    expect(alert.textContent).toContain("nothing was lost");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByLabelText("Status history")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/company-referrals/mine")).length).toBe(2);
  });

  it("adds the taking-longer notice once loading passes 15 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let release: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/company-referrals/mine")) return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ requests: [] }) }); });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
    render(<MyRequests />);
    await waitFor(() => expect(document.querySelector('[data-skipwait-loading="true"]')).toBeTruthy());
    expect(screen.getByText("Loading your requests…")).toBeTruthy();
    expect(screen.getByText("Routing checks usually take a second.")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-loading-slow="true"]')).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
    expect(document.querySelector('[data-skipwait-loading-slow="true"]')?.textContent).toContain("taking longer than expected");

    await act(async () => { release?.(); await vi.advanceTimersByTimeAsync(400); });
    await waitFor(() => expect(document.querySelector('[data-skipwait-loading="true"]')).toBeNull());
    expect(await screen.findByRole("heading", { name: "Nothing pending right now" })).toBeTruthy();
  });
});
