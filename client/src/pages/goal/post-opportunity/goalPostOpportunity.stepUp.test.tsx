// @vitest-environment jsdom
// D-057-session-gate (§0b.6; red first): goal /post-opportunity renders the in-session work-email
// step-up for a verified referrer whose session needs a code, never the code sign-in.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./GoalPostOpportunity";

vi.mock("@/hooks/useReferrerAccess", () => ({
  referrerAccessKey: (userId: string | null) => ["referrer-access", userId],
  useReferrerAccess: () => ({ status: "code_required", access: { verified: true, domain: "acme.com", companyName: "Acme", companyInitials: "AC", codeRequired: true } }),
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "12", getToken: vi.fn().mockResolvedValue("t") }),
  useUser: () => ({ user: { id: "12", emailAddresses: [{ emailAddress: "p@gmail.com", verification: { status: "verified" } }] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/post-opportunity", vi.fn()],
  useSearch: () => "",
  Redirect: () => null,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/api/notifications") ? { ok: true, status: 200, json: async () => ({ notifications: [] }) } : new Promise<never>(() => undefined)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /post-opportunity in a personal-login session", () => {
  it("shows the work-email step-up in place", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Page /></QueryClientProvider>);
    expect(await screen.findByText("Confirm you still work at Acme with a code to your work email.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
    expect(document.querySelector('a[href*="/api/auth/otp"]')).toBeNull();
  });
});
