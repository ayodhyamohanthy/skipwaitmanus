// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import MyCompanyInbox from "./MyCompanyInbox";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken: vi.fn(async () => null), openSignIn: vi.fn() }),
  useUser: () => ({ user: { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/inbox", vi.fn()],
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

// Regression: loadInbox kicks off the impact/new-count fetches in parallel
// and only awaits them on the success path. When the primary inbox fetch
// fails, the secondaries were never awaited, so their later rejection was an
// unhandled rejection (fails the whole test run, noise in browsers). The
// test below fails the RUN pre-fix and passes post-fix; the assertion itself
// only checks the error UI.

function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyCompanyInbox /></QueryClientProvider>);
}

describe("inbox parallel secondary loads", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("handles secondary failures when the primary load also fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "everything is down" }) })));
    renderInbox();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
