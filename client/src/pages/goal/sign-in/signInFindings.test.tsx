// @vitest-environment jsdom
// D-048-p3-signin review findings (GPT-6.1 Sol · 12fe, PR #1245 comment 6940704698).
// F1: leaving passkey management by the in-app "Back to sign-in" link is a
//     query-only navigation; the goal sign-in must be selected again without a reload.
// F2: the goal referrer work-email code form keeps the apiFetch boundary, so an
//     OTP outage still reaches the repair loop (REL-client-capture) once, scrubbed.
// Unlike signInGoal.test.tsx, the router is the real Wouter router here.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetApiFetchReportsForTests } from "@/lib/apiFetch";
import SignIn from "@/pages/SignIn";
import { GOAL_PAGE } from "./GoalSignInPage";

vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => id === "sign-in" }));
const captured = vi.hoisted(() => ({ calls: [] as Array<[unknown, Record<string, unknown> | undefined]> }));
vi.mock("@/lib/sentry", () => ({ captureClientError: (error: unknown, context?: Record<string, unknown>) => { captured.calls.push([error, context]); } }));

type Reply = { status: number; body?: unknown; html?: boolean } | "network";

function stubFetch(routes: Record<string, Reply>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find(route => url.startsWith(route));
    if (!key) return { ok: false, status: 404, url, headers: new Headers({ "content-type": "application/json" }), json: async () => ({}) };
    const reply = routes[key];
    if (reply === "network") throw new TypeError("Failed to fetch");
    return {
      ok: reply.status < 400,
      status: reply.status,
      url,
      headers: new Headers({ "content-type": reply.html ? "text/html" : "application/json" }),
      json: async () => { if (reply.html) throw new SyntaxError("Unexpected token '<'"); return reply.body ?? {}; },
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(url: string) {
  window.history.replaceState({}, "", url);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SignIn /></QueryClientProvider>);
}

beforeEach(() => {
  captured.calls = [];
  resetApiFetchReportsForTests();
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("F1: query-only navigation back from passkey management", () => {
  it("selects the goal sign-in again when 'Back to sign-in' drops ?passkeys=manage", async () => {
    stubFetch({ "/api/auth/passkey/": { status: 200, body: { enabled: true, credentials: [] } } });
    renderAt("/sign-in?passkeys=manage");
    fireEvent.click(await screen.findByRole("link", { name: "Back to sign-in" }));
    expect(window.location.pathname + window.location.search).toBe("/sign-in");
    expect(await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine })).toBeTruthy();
    expect(document.querySelectorAll('section[aria-labelledby="goal-next-step-heading"]').length).toBe(1);
    expect(screen.queryByRole("heading", { name: "Get referred." })).toBeNull();
    // The D-095 email-first goal form: the email field is on the page, not behind a toggle.
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.queryByRole("button", { name: "Send sign-in code" })).toBeNull();
  });
});

describe("F2: the goal referrer code form reports OTP outages through apiFetch", () => {
  async function referrerForm() {
    renderAt("/sign-in?intent=referrer");
    const email = await screen.findByLabelText("Company email");
    fireEvent.change(email, { target: { value: "ref@example.com" } });
    return email;
  }

  for (const [label, reply, kind] of [
    ["a 503", { status: 503, body: { error: "down" } }, "api_5xx"],
    ["an HTML gateway page", { status: 200, html: true }, "api_html_response"],
    ["a dropped connection", "network", "api_network_error"],
  ] as const) {
    it(`reports ${label} on send once, scrubbed, and keeps the visible retry`, async () => {
      stubFetch({ "/api/auth/otp/send": reply });
      await referrerForm();
      fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
      expect((await screen.findByRole("alert")).textContent).toMatch(/could not send the code|down/i);
      await waitFor(() => expect(captured.calls.length).toBe(1));
      const [error, context] = captured.calls[0];
      expect(String(error)).toContain(`${kind} /api/auth/otp/send`);
      expect(context).toMatchObject({ source: "api-fetch", kind, route: "/api/auth/otp/send", method: "POST" });
      expect(JSON.stringify(context)).not.toContain("ref@example.com");
      expect(screen.getByRole("button", { name: "Send sign-in code" })).toBeTruthy();
    });
  }

  it("reports a 5xx on verify once and keeps the code step open", async () => {
    stubFetch({ "/api/auth/otp/send": { status: 200, body: { sent: true } }, "/api/auth/otp/verify": { status: 502, body: {} } });
    await referrerForm();
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    fireEvent.change(await screen.findByLabelText("Six-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be verified/i);
    await waitFor(() => expect(captured.calls.length).toBe(1));
    expect(captured.calls[0][1]).toMatchObject({ kind: "api_5xx", route: "/api/auth/otp/verify", status: 502 });
    expect(JSON.stringify(captured.calls[0][1])).not.toContain("123456");
  });
});
