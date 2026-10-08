// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 4106, getToken: vi.fn().mockResolvedValue("test-token") }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/requests", go] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}


beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("My Requests empty state", () => {
  it("keeps a Job Seeker moving with a real-data empty state, never a fabricated preview", async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('[aria-label="No referral requests"]')).toBeTruthy());
    expect(document.querySelector('[data-skipwait-zero-action="job_seeker"]')).toBeTruthy();
    // The old illustrative preview card is gone: no fabricated activity ships.
    expect(document.querySelector('[data-skipwait-empty-preview]')).toBeNull();
    expect(screen.getByRole("link", { name: "Share on WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share on LinkedIn" })).toBeTruthy();
    expect(screen.queryByText("No requests yet.")).toBeNull();
    // Kit v4 first-time empty state: honest zero, two real next steps.
    expect(screen.getByRole("heading", { name: "No asks yet." })).toBeTruthy();
    expect(screen.getByText("Pick a company, find a verified referrer, and write one great ask.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore companies" }).getAttribute("href")).toBe("/explore");
    expect(screen.getByRole("link", { name: "Finish setup" }).getAttribute("href")).toBe("/onboarding");
    // Tabs and zero counts render only from the loaded (empty) list.
    expect(screen.getByRole("tab", { name: "Active" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("IN CONVERSATION").parentElement?.textContent).toContain("0");
  });

  it("shows the approved request as a conversation row with its referrer update", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [{ id: 12, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "approved", referrerId: 77, referrerMessage: "I can introduce you to the hiring team.", unreadMessageCount: 2, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-11T09:00:00.000Z", attachmentCount: 1 }] }) })));
    renderPage();
    const row = await waitFor(() => screen.getByLabelText("acme.com request, Accepted"));
    expect(row.getAttribute("href")).toBe("/conversation/12");
    expect(row.closest("li")?.textContent).toContain("2 new");
    expect(screen.getByText("IN CONVERSATION").parentElement?.textContent).toContain("1");
    // Referrer identity stays private: id 77 appears nowhere.
    expect(document.querySelector("main")?.textContent).not.toContain("77");
    expect(screen.getByLabelText("Referrer update").textContent).toContain("I can introduce you to the hiring team.");
  });
});
