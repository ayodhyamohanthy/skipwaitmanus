// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkEmailSignIn } from "./WorkEmailSignIn";

const fetchMock = vi.fn();

describe("WorkEmailSignIn (server-owned OTP via ZeptoMail)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("sends a code through the server OTP endpoint for the entered company address", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sent: true }) });
    render(<WorkEmailSignIn />);
    fireEvent.change(screen.getByLabelText("Company email for secure employee sign in"), { target: { value: "employee@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByText("Code sent to employee@acme.com")).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/work-email/otp/send");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: "employee@acme.com" });
    expect(sessionStorage.getItem("skipwait:employee-sign-in-email")).toBe("employee@acme.com");
  });

  it("surfaces rate limiting and delivery errors without advancing the flow", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: "A code was sent recently. Wait a minute before requesting another.", retryAfterSeconds: 60 }) });
    render(<WorkEmailSignIn />);
    fireEvent.change(screen.getByLabelText("Company email for secure employee sign in"), { target: { value: "employee@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByText(/A code was sent recently/i)).toBeTruthy());
    expect(screen.queryByText(/Code sent to/i)).toBeNull();
  });

  it("verifies the code server-side, enrolls the verified address, and completes without provider calls", async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith("/api/work-email/otp/send")) return { ok: true, json: async () => ({ sent: true }) };
      if (String(url).endsWith("/api/work-email/otp/verify")) return { ok: true, json: async () => ({ verified: true, receipt: "receipt-bound-to-account" }) };
      if (String(url).endsWith("/api/company-referrals/verify-work-email")) return { ok: true, json: async () => ({ verified: true, workEmailDomain: "acme.com" }) };
      return { ok: false, json: async () => ({}) };
    });
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true });
    render(<WorkEmailSignIn />);
    fireEvent.change(screen.getByLabelText("Company email for secure employee sign in"), { target: { value: "employee@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(screen.getByLabelText("Secure employee sign-in code")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Secure employee sign-in code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(reload).toHaveBeenCalled(), { timeout: 8000 });
    const verifyCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/work-email/otp/verify"));
    expect(JSON.parse((verifyCall?.[1] as RequestInit).body as string)).toEqual({ email: "employee@acme.com", code: "123456" });
    const enrollCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/company-referrals/verify-work-email"));
    expect(JSON.parse((enrollCall?.[1] as RequestInit).body as string)).toMatchObject({ email: "employee@acme.com", receipt: "receipt-bound-to-account" });
  });
});
