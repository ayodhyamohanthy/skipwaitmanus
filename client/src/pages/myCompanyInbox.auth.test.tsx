// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { go, authState } = vi.hoisted(() => ({ go: vi.fn(), authState: { signedIn: false } }));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: authState.signedIn, getToken: vi.fn().mockResolvedValue("test-token") }),
  useUser: () => ({ user: authState.signedIn ? { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } : undefined }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/inbox", go],
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => { authState.signedIn = false; });
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("My Company Inbox employee access", () => {
  it("routes signed-out employees to the dedicated work-email-only sign-in flow", () => {
    render(<MyCompanyInbox />);
    expect(screen.getByRole("button", { name: "Use company email" })).toBeTruthy();
    expect(screen.queryByText("Secure employee sign in")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use company email" }));
    expect(go).toHaveBeenCalledWith("/referrer");
  });

  it("gives a verified employee a visual no-request state with one availability action", async () => {
    authState.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) })));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(document.querySelector('[aria-label="No private referral requests"]')).toBeTruthy());
    expect(document.querySelector('[data-skipwait-zero-action="referrer"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share with a job seeker" })).toBeTruthy();
    expect(screen.queryByText("No new requests.")).toBeNull();
  });

  it("shows the server-filtered New request count and keeps it visible across inbox tabs", async () => {
    authState.signedIn = true;
    const newRequests = [
      { id: 1, companyDomain: "acme.com", status: "pending", targetRoleUrl: "https://careers.acme.com/jobs/one", attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false },
      { id: 2, companyDomain: "acme.com", status: "pending", targetRoleUrl: "https://careers.acme.com/jobs/two", attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false },
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ requests: url.includes("scope=saved") ? [] : newRequests }) })));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getByLabelText("2 new private requests")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Saved" }));
    await waitFor(() => expect(screen.getByLabelText("2 new private requests")).toBeTruthy());
  });
});
