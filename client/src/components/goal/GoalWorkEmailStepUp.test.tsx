// @vitest-environment jsdom
// D-057-session-gate (§0b.6; red first): the in-session work-email step-up.
// A signed-in referrer confirms their work email with a code in place; the
// standalone code sign-in is never offered.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoalWorkEmailStepUp } from "./GoalWorkEmailStepUp";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, userId: "12", getToken: vi.fn().mockResolvedValue("t") }) }));
type Reply = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };
let replies: Record<string, Reply[]>;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const queue = replies[url] ?? [];
  const reply = queue.length > 1 ? queue.shift()! : queue[0];
  if (!reply) throw new TypeError("Failed to fetch");
  return { ok: reply.status < 400, status: reply.status, url, headers: new Headers({ "content-type": "application/json", ...(reply.headers ?? {}) }), json: async () => reply.body, text: async () => JSON.stringify(reply.body), init };
});
const access = { verified: true, domain: "acme.com", companyName: "Acme", companyInitials: "AC", codeRequired: true };
function renderStepUp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><GoalWorkEmailStepUp access={access} /></QueryClientProvider>);
  return { invalidate };
}
const SENT: Reply = { status: 200, body: { sent: true, challengeId: "c".repeat(43), expiresAt: "2026-10-30T10:10:00.000Z" } };
const VERIFIED: Reply = { status: 200, body: { verified: true, expiresAt: "2026-10-30T22:00:00.000Z" } };

beforeEach(() => { replies = {}; fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const sendFlow = async () => {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "ref@acme.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("Code");
};

describe("GoalWorkEmailStepUp", () => {
  it("states the step in the referrer's terms, with the company domain as the hint", () => {
    renderStepUp();
    expect(screen.getByText("Confirm you still work at Acme with a code to your work email.")).toBeTruthy();
    expect(screen.getByText("@acme.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
    // Never the standalone sign-in, which would make another account.
    expect(document.querySelector('a[href*="/sign-in"], a[href*="/api/auth/otp"], a[href*="referrer-setup"]')).toBeNull();
  });

  it("sends the code, confirms it and opens the surface in place", async () => {
    replies = { "/api/referrer/step-up/send": [SENT], "/api/referrer/step-up/verify": [VERIFIED] };
    const { invalidate } = renderStepUp();
    await sendFlow();
    expect(fetchMock).toHaveBeenCalledWith("/api/referrer/step-up/send", expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "ref@acme.com" }) }));
    expect(screen.getByText(/We sent a code to ref@acme\.com/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["referrer-access", "12"] }));
    expect(fetchMock).toHaveBeenCalledWith("/api/referrer/step-up/verify", expect.objectContaining({ body: JSON.stringify({ challengeId: "c".repeat(43), code: "123456" }) }));
    expect(fetchMock.mock.calls.map(([url]) => url).some(url => String(url).includes("/api/auth/otp"))).toBe(false);
  });

  it("explains a wrong code and keeps the field for another try", async () => {
    replies = { "/api/referrer/step-up/send": [SENT], "/api/referrer/step-up/verify": [{ status: 400, body: { code: "step_up_code_invalid", error: "That code did not work. Check the newest code or send a new one." } }] };
    renderStepUp();
    await sendFlow();
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("That code did not work. Check the newest code or send a new one.")).toBeTruthy();
    expect(screen.getByLabelText("Code")).toBeTruthy();
  });

  it("names an address at the wrong company", async () => {
    replies = { "/api/referrer/step-up/send": [{ status: 400, body: { code: "step_up_email_mismatch", error: "Use the work email you verified at acme.com." } }] };
    renderStepUp();
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "me@globex.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Use the work email you verified at acme.com.")).toBeTruthy();
  });

  it("shows the wait when rate limited", async () => {
    replies = { "/api/referrer/step-up/send": [{ status: 429, body: { code: "step_up_rate_limited", error: "Wait a moment before requesting another code.", retryAfterSeconds: 30 }, headers: { "retry-after": "30" } }] };
    renderStepUp();
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "ref@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Wait a moment before requesting another code.")).toBeTruthy();
  });

  it("says plainly when the device is offline, and nothing changed", async () => {
    renderStepUp();
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "ref@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("You seem to be offline. Check your connection and try again. Nothing was sent.")).toBeTruthy();
  });

  it("asks a session that cannot be bound to sign out and in again, never to the code sign-in", async () => {
    replies = { "/api/referrer/step-up/send": [{ status: 409, body: { code: "session_unbindable", error: "Sign out and sign in again, then confirm your work email." } }] };
    renderStepUp();
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "ref@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Sign out and sign in again, then confirm your work email.")).toBeTruthy();
    expect(document.querySelector('a[href*="/api/auth/otp"]')).toBeNull();
  });
});
