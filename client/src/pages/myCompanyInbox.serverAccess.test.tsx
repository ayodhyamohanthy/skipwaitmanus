// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("t") }),
  // The sign-in account only has a personal address; the company address was enrolled by code.
  useUser: () => ({ user: { emailAddresses: [{ emailAddress: "qa@gmail.com", verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/queue", vi.fn()],
  useSearch: () => "",
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const stub = (verified: boolean) => vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/access") ? { verifiedCompanyAccess: verified, workEmailDomain: verified ? "skipwait.me" : null } : { requests: [] } })));

describe("queue gate follows the server's verification", () => {
  it("opens the queue for a referrer verified by code even when the sign-in account has a personal email", async () => {
    stub(true);
    render(<MyCompanyInbox />);
    await waitFor(() => expect(document.querySelector('[aria-label="Open referral capacity"]')).toBeTruthy());
    expect(screen.queryByText("Verify your work email.")).toBeNull();
  });
  it("still shows the verify gate when the server says not verified", async () => {
    stub(false);
    render(<MyCompanyInbox />);
    expect(await screen.findByText("Verify your work email.")).toBeTruthy();
  });
});
