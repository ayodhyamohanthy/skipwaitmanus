// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "./Settings";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("token") }),
  useUser: () => ({ user: { imageUrl: "https://cdn.example/avatar.png", fullName: "Avery", emailAddresses: [{ emailAddress: "ref@acme.com", verification: { status: "verified" } }] }, isSignedIn: true, isLoaded: true }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/settings", vi.fn()],
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = (overrides: Record<string, unknown> = {}) => vi.fn(async (url: unknown) => {
  const path = String(url);
  if (path.includes("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
  if (path.includes("/api/privacy/requests")) return { ok: true, json: async () => ({ requests: [] }) };
  if (path.includes("/api/referrer/slack-webhook")) return { ok: true, json: async () => ({ connected: false, active: false, ...(overrides.slackStatus ?? {}) }) };
  return { ok: true, json: async () => ({}) };
});

describe("Settings Slack triage section", () => {
  beforeEach(() => { });
  afterEach(() => { cleanup(); });

  it("shows the opt-in Slack connect form for verified referrers and connects a valid webhook", { timeout: 15000 }, async () => {
    const fetch = fetchMock();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("Slack review alerts")).toBeTruthy());
    expect(screen.getByText(/never candidate names, resumes, or documents/i)).toBeTruthy();
    const input = screen.getByLabelText("Slack incoming-webhook URL");
    await user.type(input, "https://hooks.slack.com/services/T000/B000/XXXX");
    await user.click(screen.getByRole("button", { name: /Connect Slack/i }));
    await waitFor(() => expect(screen.getByText("Your private Slack triage channel is connected.")).toBeTruthy(), { timeout: 8000 });
    const putCall = (fetch as unknown as { mock: { calls: Array<[unknown, unknown]> } }).mock.calls.find(([, init]) => (init as RequestInit)?.method === "PUT");
    expect(putCall).toBeTruthy();
    expect(JSON.parse((putCall?.[1] as RequestInit | undefined)?.body as string)).toEqual({ webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX" });
    vi.unstubAllGlobals();
  });

  it("hides the Slack section when no verified work email exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.includes("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: false, workEmailDomain: null }) };
      if (path.includes("/api/privacy/requests")) return { ok: true, json: async () => ({ requests: [] }) };
      return { ok: true, json: async () => ({}) };
    }));
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("No verified work email yet")).toBeTruthy());
    expect(screen.queryByText("Slack review alerts")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("shows connected state with a disconnect action", async () => {
    vi.stubGlobal("fetch", fetchMock({ slackStatus: { connected: true, active: true } }));
    const user = userEvent.setup();
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("Slack triage connected")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Disconnect Slack/i }));
    await waitFor(() => expect(screen.getByText("Your Slack triage channel is disconnected.")).toBeTruthy(), { timeout: 8000 });
    const deleteCall = vi.mocked(fetch).mock.calls.find(([, init]) => (init as RequestInit)?.method === "DELETE");
    expect(deleteCall).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
