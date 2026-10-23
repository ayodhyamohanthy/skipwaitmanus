// @vitest-environment jsdom
// Goal /landed (D-048-p3-seeker-small, dark): one-task journey, thank-you
// send, pay-it-forward, no-hire + signed-out states, flags-off kit control.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = { isLoaded: true, isSignedIn: true };
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, userId: "u1", getToken: async () => "tok" }), SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const flagState = { on: true };
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "landed" };
});
vi.mock("@/hooks/usePersistFn", () => ({ usePersistFn: (fn: unknown) => fn }));

const hire = { id: "r1", status: "closed", referrerId: "ref-1", referrerName: "Asha Rao", title: "Frontend Engineer", companyName: "Quillmint", companyDomain: "quillmint.ai", updatedAt: "2026-10-20T00:00:00Z" };
const requestsState = { requests: [hire] };
vi.mock("@/components/requests/requestsApi", () => ({
  LOAD_ERROR: "We could not load your asks.",
  fetchMyRequests: vi.fn(async () => ({ requests: requestsState.requests })),
}));
const sendState = { delivered: true, fail: false };
vi.mock("@/components/landed/landedModel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/landed/landedModel")>();
  return { ...actual, sendLandedJourney: vi.fn(async () => { if (sendState.fail) throw new Error("boom"); return { delivered: sendState.delivered }; }) };
});

import Landed from "@/pages/Landed";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Landed /></QueryClientProvider>);
}

describe("goal landed", () => {
  beforeEach(() => { authState.isLoaded = true; authState.isSignedIn = true; flagState.on = true; requestsState.requests = [hire]; sendState.delivered = true; sendState.fail = false; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("opens on the goal with one commit for the hire", async () => {
    renderPage();
    expect(await screen.findByTestId("goal-landed")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Close the loop on your new role." })).toBeTruthy();
    expect(await screen.findByText(/Frontend Engineer · Quillmint/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thank your referrer" })).toBeTruthy();
  });

  it("sends the thank-you and moves to pay it forward", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Thank your referrer" }));
    expect(await screen.findByRole("heading", { name: /Say thanks to Asha/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send thanks" }));
    expect(await screen.findByRole("heading", { name: /Hold the door/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Yes, I will pay it forward/ }));
    expect(await screen.findByRole("heading", { name: /other side of the door/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Verify work email/ }).getAttribute("href")).toBe("/verify");
  });

  it("says when the thank-you could not be delivered", async () => {
    sendState.delivered = false;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Thank your referrer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send thanks" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("shows the no-hire next step", async () => {
    requestsState.requests = [];
    renderPage();
    expect(await screen.findByText(/No hires to thank yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Explore companies/ })).toBeTruthy();
  });

  it("gates the journey behind sign-in", async () => {
    authState.isSignedIn = false;
    renderPage();
    expect(await screen.findByRole("button", { name: "Secure sign in" })).toBeTruthy();
  });

  it("flags off keeps the kit journey", async () => {
    flagState.on = false;
    renderPage();
    expect(await screen.findByRole("heading", { name: "You did it." })).toBeTruthy();
    expect(screen.queryByTestId("goal-landed")).toBeNull();
  });
});
