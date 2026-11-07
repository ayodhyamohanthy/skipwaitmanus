// @vitest-environment jsdom
// Review finding 1 on the goal inbox (D-048-p3-inbox): with the surface on, the
// route must never paint a blank screen while the goal chunk is still loading.
// This file holds `goal/inbox/GoalInbox` pending on purpose (a real lazy import
// that never settles), so it pins the Suspense fallback rather than the page.
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UnifiedInbox from "../../UnifiedInbox";

vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => id === "inbox" }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("t"), openSignIn: vi.fn() }),
  useUser: () => ({ user: { id: "u1" } }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/inbox", vi.fn()], useRoute: () => [false, {}], Redirect: () => null }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified", access: { verified: false } }) }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

// A promise that never settles: the chunk stays in flight for the whole test.
const neverSettles = new Promise<void>(() => {});
vi.mock("./GoalInbox", () => ({
  default: () => { throw neverSettles; },
}));

describe("goal inbox chunk loading", () => {
  it("shows a loading state, not a blank route, while the goal chunk is pending", () => {
    render(<QueryClientProvider client={new QueryClient()}><UnifiedInbox /></QueryClientProvider>);
    const fallback = document.querySelector('[data-skipwait-chunk-loading="true"]');
    expect(fallback).toBeTruthy();
    expect(screen.getByText("Loading your conversations…")).toBeTruthy();
    // A skeleton with real height, so the route is visibly loading at 390 and 1280.
    expect(fallback?.querySelectorAll("[aria-hidden=\"true\"] > div").length).toBe(3);
    // The kit page is not what a released surface renders.
    expect(screen.queryByText("MESSAGES")).toBeNull();
  });
});
