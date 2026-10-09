// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Verify from "./Verify";

const { authState } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => { authState.isLoaded = true; authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

type Reply = { status: number; body: unknown };
const reply = (status: number, body: unknown): Reply => ({ status, body });
const ok = (body: unknown) => reply(200, body);
const asResponse = ({ status, body }: Reply) => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

/** Routes each endpoint to a queue of replies (last reply repeats) and records request bodies. */
function stubApi(routes: { send?: Reply[]; check?: Reply[]; enroll?: Reply[] }) {
  const calls: { path: string; body: Record<string, string> }[] = [];
  const next = (queue: Reply[] | undefined) => (queue && queue.length > 1 ? queue.shift() : queue?.[0]) ?? ok({});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
    if (path === "/api/work-email/otp/send") return asResponse(next(routes.send));
    if (path === "/api/work-email/otp/verify") return asResponse(next(routes.check));
    if (path === "/api/company-referrals/verify-work-email") return asResponse(next(routes.enroll));
    throw new Error(`unexpected ${path}`);
  }));
  return calls;
}

async function reachCodeStep(email = "name@wipro.com") {
  render(<Verify />);
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
  await screen.findByText("Enter the code");
}

function enterCode(digits: string) {
  for (let i = 0; i < 6; i++) fireEvent.change(screen.getByLabelText(`Digit ${i + 1}`), { target: { value: digits[i] ?? "" } });
}

describe("Verify work email", () => {
  it("shows a kit loading state while sign-in resolves", () => {
    authState.isLoaded = false;
    render(<Verify />);
    expect(screen.getByRole("status").textContent).toContain("Checking your sign-in");
    expect(screen.queryByText("Where do you work?")).toBeNull();
  });

  it("keeps verification behind sign-in and never shows a demo code", () => {
    authState.isSignedIn = false;
    render(<Verify />);
    expect(screen.getByText(/Prove you're inside/)).toBeTruthy();
    expect(screen.getByText("Sign in to verify")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sign in/ })).toBeTruthy();
    expect(screen.queryByText("Where do you work?")).toBeNull();
    expect(screen.queryByText(/123456/)).toBeNull();
  });

  it("never ships preview scaffolding or invented storage claims", () => {
    render(<Verify />);
    for (const scaffold of [/DESIGN PREVIEW/i, /Try states/i, /Preview code/i, /one-way fingerprint/i, /next re-check/i]) expect(screen.queryByText(scaffold)).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("walks company to email with domain validation, no fake states", async () => {
    stubApi({ send: [ok({ sent: true })] });
    render(<Verify />);
    expect(screen.getByText("Where do you work?")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /TCS/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Wipro/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Your Wipro email")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/Personal inboxes can't prove where you work/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@other.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/doesn't match Wipro/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText("Enter the code")).toBeTruthy();
    expect(screen.getByText(/Resend in 1:00/)).toBeTruthy();
  });

  it("verifies the code, redeems the receipt, and only then shows the badge preview", async () => {
    const calls = stubApi({ send: [ok({ sent: true })], check: [ok({ verified: true, receipt: "receipt-1", expiresAt: "2026-10-08T04:40:00.000Z" })], enroll: [ok({ verified: true, workEmailDomain: "wipro.com", reward: { rewarded: false } })] });
    await reachCodeStep();
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("You're verified at Wipro.")).toBeTruthy();
    expect(calls.map(call => call.path)).toEqual(["/api/work-email/otp/send", "/api/work-email/otp/verify", "/api/company-referrals/verify-work-email"]);
    expect(calls[2]?.body).toEqual({ email: "name@wipro.com", receipt: "receipt-1" });
    expect(screen.getByText("Someone at Wipro")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Set up referring/ }).getAttribute("href")).toBe("/referrer-setup");
    expect(screen.getByRole("link", { name: /View my profile/ }).getAttribute("href")).toBe("/profile");
  });

  it("does not claim verification when enrollment fails, and retries with the same receipt", async () => {
    const calls = stubApi({ send: [ok({ sent: true })], check: [ok({ verified: true, receipt: "receipt-2" })], enroll: [reply(500, { error: "We could not verify your work email" }), ok({ verified: true, workEmailDomain: "wipro.com" })] });
    await reachCodeStep();
    enterCode("654321");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("We could not verify your work email"));
    expect(screen.queryByText(/You're verified/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("You're verified at Wipro.")).toBeTruthy();
    expect(calls.filter(call => call.path === "/api/work-email/otp/verify")).toHaveLength(1);
    expect(calls.filter(call => call.path === "/api/company-referrals/verify-work-email").map(call => call.body.receipt)).toEqual(["receipt-2", "receipt-2"]);
  });

  it("counts wrong attempts and locks out after five without inventing server state", async () => {
    stubApi({ send: [ok({ sent: true })], check: [reply(400, { error: "That code could not be verified." })] });
    await reachCodeStep();
    for (let round = 0; round < 5; round++) {
      enterCode("000000");
      fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
      await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
      if (round < 4) expect(screen.getByRole("alert").textContent).toMatch(/tries left|try left/);
    }
    expect(screen.getByRole("alert").textContent).toContain("Too many tries");
    expect((screen.getByRole("button", { name: /Verify/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not spend an attempt when the service is down", async () => {
    stubApi({ send: [ok({ sent: true })], check: [reply(503, { error: "Work-email verification is unavailable right now" })] });
    await reachCodeStep();
    enterCode("111111");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Work-email verification is unavailable right now"));
  });

  it("surfaces server rate limits honestly on send", async () => {
    stubApi({ send: [reply(429, { error: "Too many code requests. Wait before trying again.", retryAfterSeconds: 600 })] });
    render(<Verify />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/Too many code requests/)).toBeTruthy();
    expect(screen.queryByText("Enter the code")).toBeNull();
  });

  it("explains a network failure instead of a raw fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<Verify />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/couldn't reach SkipWait/)).toBeTruthy();
  });

  it("offers a resend after the server's one-minute window and shows a resend failure on the code step", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const calls = stubApi({ send: [ok({ sent: true }), reply(429, { error: "Too many code requests. Wait before trying again." })] });
    render(<Verify />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText(/Resend in 1:00/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Resend code/ })).toBeNull();
    for (let second = 0; second < 61; second++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    fireEvent.click(screen.getByRole("button", { name: /Resend code/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByRole("alert").textContent).toContain("Too many code requests");
    expect(screen.getByText("Enter the code")).toBeTruthy();
    expect(calls.filter(call => call.path === "/api/work-email/otp/send")).toHaveLength(2);
  });
});
