// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferralConversation from "./ReferralConversation";

const { clerkState, go } = vi.hoisted(() => ({ clerkState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@clerk/react", () => ({ useAuth: () => clerkState, SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ useLocation: () => ["/conversation/601", go], useRoute: () => [true, { requestId: "601" }] }));

beforeEach(() => {
  clerkState.isSignedIn = true;
  clerkState.getToken = vi.fn().mockResolvedValue("test-token");
  go.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReferralConversation", () => {
  it("renders the approved request conversation and sends a concise message through the request-scoped endpoint", async () => {
    let messageCount = 1;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        expect(url).toBe("/api/company-referrals/601/conversation");
        expect(JSON.parse(String(init.body))).toEqual({ body: "Thank you — what should I prepare next?" });
        messageCount = 2;
        return { ok: true, json: async () => ({ message: { id: 2 } }) };
      }
      return { ok: true, json: async () => ({ messages: messageCount === 1 ? [{ id: 1, body: "I accepted your referral request.", createdAt: "2026-08-19T09:00:00.000Z", isMine: false }] : [{ id: 1, body: "I accepted your referral request.", createdAt: "2026-08-19T09:00:00.000Z", isMine: false }, { id: 2, body: "Thank you — what should I prepare next?", createdAt: "2026-08-19T09:01:00.000Z", isMine: true }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReferralConversation />);
    await waitFor(() => expect(screen.getByText("I accepted your referral request.")).toBeTruthy());
    expect(screen.getByText("Private referral partner")).toBeTruthy();
    const composer = screen.getByLabelText("Message");
    fireEvent.change(composer, { target: { value: "Thank you — what should I prepare next?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByText("Thank you — what should I prepare next?")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/conversation", expect.objectContaining({ method: "POST", credentials: "include" }));
  });

  it("keeps the conversation data behind sign-in", () => {
    clerkState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReferralConversation />);
    expect(screen.getByText("Continue securely.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Secure sign in" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
