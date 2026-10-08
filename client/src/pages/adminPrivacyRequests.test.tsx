// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminPrivacyRequests from "./AdminPrivacyRequests";

const { getToken, authState } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("admin-token"), authState: { isSignedIn: true } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("@/components/AdminNav", () => ({ AdminNav: () => <nav aria-label="Admin" /> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <span>brand</span> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.isSignedIn = true; });

function renderAdminPrivacyRequests() {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}><AdminPrivacyRequests /></QueryClientProvider>);
}

describe("AdminPrivacyRequests", () => {
  it("shows the sign-in prompt and fetches nothing for signed-out visitors", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAdminPrivacyRequests();
    expect(screen.getByText(/Sign in with an administrator account/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the queue and moves a request into review without refetching", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, status: 200, json: async () => ({ request: { status: "in_review" } }) };
      return { ok: true, json: async () => ({ requests: [{ id: 7, kind: "erasure", status: "requested", source: "settings", resolution: null, createdAt: "2026-10-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z", userId: 22, requesterName: "Ravi Kumar", requesterEmail: "ravi@example.com", reviewedAt: null }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAdminPrivacyRequests();
    await waitFor(() => expect(screen.getByText("Ravi Kumar · ravi@example.com")).toBeTruthy());
    expect(screen.getByText("requested")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start review" }));
    await waitFor(() => expect(screen.getByText("in review")).toBeTruthy());
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
  });
});
