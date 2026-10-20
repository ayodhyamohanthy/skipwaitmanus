// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
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

// GET /api/companies: the verifiable companies and their email domains.
const directoryWith = (domains: Record<string, string[]> = {}): CompanyDirectoryResponse => ({ companies: LAUNCH_COMPANY_SEED.map(seed => ({ slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: domains[seed.slug] ?? [...seed.domains], openToReferrals: true })), openCount: LAUNCH_COMPANY_SEED.length });
const DIRECTORY = directoryWith();

const renderVerify = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Verify /></QueryClientProvider>);

/** Routes each endpoint to a queue of replies (last reply repeats) and records request bodies. */
function stubApi(routes: { send?: Reply[]; check?: Reply[]; enroll?: Reply[]; preferences?: Reply[]; profile?: Reply[]; directory?: Reply[] }) {
  const calls: { path: string; body: Record<string, string> }[] = [];
  const next = (queue: Reply[] | undefined) => (queue && queue.length > 1 ? queue.shift() : queue?.[0]) ?? ok({});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path === "/api/companies") return asResponse(next(routes.directory ?? [ok(DIRECTORY)]));
    calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
    if (path === "/api/work-email/otp/send") return asResponse(next(routes.send));
    if (path === "/api/work-email/otp/verify") return asResponse(next(routes.check));
    if (path === "/api/company-referrals/verify-work-email") return asResponse(next(routes.enroll));
    // The verified panel's reads: no saved function and no handle unless a test says so.
    if (path === "/api/referrer-preferences") return asResponse(next(routes.preferences ?? [ok({ preferences: {} })]));
    if (path === "/api/profile/me") return asResponse(next(routes.profile ?? [ok({ profile: { handle: null } })]));
    throw new Error(`unexpected ${path}`);
  }));
  return calls;
}

async function reachCodeStep(email = "name@wipro.com") {
  renderVerify();
  await screen.findAllByRole("radio");
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
    renderVerify();
    expect(screen.getByRole("status").textContent).toContain("Checking your sign-in");
    expect(screen.queryByText("Where do you work?")).toBeNull();
  });

  it("keeps verification behind sign-in and never shows a demo code", () => {
    authState.isSignedIn = false;
    renderVerify();
    expect(screen.getByText(/Prove you're inside/)).toBeTruthy();
    expect(screen.getByText("Sign in to verify")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Sign in with work email/ })).toBeTruthy();
    expect(screen.queryByText("Where do you work?")).toBeNull();
    expect(screen.queryByText(/123456/)).toBeNull();
  });

  it("never ships preview scaffolding and states what the server really stores", async () => {
    stubApi({});
    renderVerify();
    expect(await screen.findAllByRole("radio")).toHaveLength(5);
    for (const scaffold of [/DESIGN PREVIEW/i, /Try states/i, /Preview code/i, /next re-check/i]) expect(screen.queryByText(scaffold)).toBeNull();
    // Queue task 3 made the fingerprint unconditional, so the kit line is true now and ships verbatim.
    expect(screen.getByText("A one-way fingerprint of your email")).toBeTruthy();
    expect(screen.getByText("Company and verification date")).toBeTruthy();
    expect(screen.getByText("Never the code or your inbox")).toBeTruthy();
  });

  it("loads the companies from the directory, holding Continue until one is chosen", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; return asResponse(ok(DIRECTORY)); }));
    renderVerify();
    expect(screen.getByLabelText("Loading companies").getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    release?.();
    const radios = await screen.findAllByRole("radio");
    expect(radios.map(radio => radio.textContent)).toEqual(["SWskipwait.me@skipwait.me", "WWipro@wipro.com", "GNGo Neutrinos@goneutrinos.com", "TTCS@tcs.com", "MMerkle@merkle.com"]);
    expect(screen.getByRole("radio", { name: /Wipro/ }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a directory failure with Try again instead of an empty company list", async () => {
    stubApi({ directory: [reply(503, { error: "The company directory is unavailable right now" }), reply(503, { error: "The company directory is unavailable right now" }), ok(DIRECTORY)] });
    renderVerify();
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toContain("The company directory is unavailable right now");
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findAllByRole("radio")).toHaveLength(5);
  });

  it("accepts any verified domain of the chosen company and names the primary one", async () => {
    stubApi({ send: [ok({ sent: true })], directory: [ok(directoryWith({ wipro: ["wipro.com", "wipro.co.in"] }))] });
    renderVerify();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.in" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText("This doesn't match Wipro. Wipro emails end in @wipro.com.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.co.in" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText("Enter the code")).toBeTruthy();
  });

  it("walks company to email with domain validation, no fake states", async () => {
    stubApi({ send: [ok({ sent: true })] });
    renderVerify();
    expect(screen.getByText("Where do you work?")).toBeTruthy();
    fireEvent.click(await screen.findByRole("radio", { name: /TCS/ }));
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
    expect(screen.getByText(/Resend in 0:30/)).toBeTruthy();
  });

  it("verifies the code, redeems the receipt, and only then shows the badge preview", async () => {
    const calls = stubApi({ send: [ok({ sent: true })], check: [ok({ verified: true, receipt: "receipt-1", expiresAt: "2026-10-08T04:40:00.000Z" })], enroll: [ok({ verified: true, workEmailDomain: "wipro.com", reward: { rewarded: false } })] });
    await reachCodeStep();
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("You're verified at Wipro.")).toBeTruthy();
    expect(calls.map(call => call.path).slice(0, 3)).toEqual(["/api/work-email/otp/send", "/api/work-email/otp/verify", "/api/company-referrals/verify-work-email"]);
    expect(calls[2]?.body).toEqual({ email: "name@wipro.com", receipt: "receipt-1" });
    expect(screen.getByText("Someone at Wipro")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Set up referring/ }).getAttribute("href")).toBe("/referrer-setup");
    // No handle yet: the profile link lands on the handle field. No saved function: no suffix.
    await waitFor(() => expect(calls.some(call => call.path === "/api/profile/me")).toBe(true));
    expect(screen.getByRole("link", { name: /View my profile/ }).getAttribute("href")).toBe("/profile?focus=handle");
    expect(screen.getByText("Verified via work email")).toBeTruthy();
  });

  it("names the saved primary function and links the public profile when a handle exists", async () => {
    stubApi({
      send: [ok({ sent: true })],
      check: [ok({ verified: true, receipt: "receipt-3" })],
      enroll: [ok({ verified: true, workEmailDomain: "wipro.com" })],
      preferences: [ok({ preferences: { preferAreas: ["Design", "Product"], referralCapacity: 3 } })],
      profile: [ok({ profile: { handle: "asha-r" } })],
    });
    await reachCodeStep();
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("Verified via work email · Design")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("link", { name: /View my profile/ }).getAttribute("href")).toBe("/p/asha-r"));
  });

  it("keeps the plain badge line and the handle fallback when the profile reads fail", async () => {
    stubApi({
      send: [ok({ sent: true })],
      check: [ok({ verified: true, receipt: "receipt-4" })],
      enroll: [ok({ verified: true, workEmailDomain: "wipro.com" })],
      preferences: [reply(500, { error: "down" })],
      profile: [reply(500, { error: "down" })],
    });
    await reachCodeStep();
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("You're verified at Wipro.")).toBeTruthy();
    expect(screen.getByText("Verified via work email")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View my profile/ }).getAttribute("href")).toBe("/profile?focus=handle");
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
    renderVerify();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/Too many code requests/)).toBeTruthy();
    expect(screen.queryByText("Enter the code")).toBeNull();
  });

  it("explains a network failure instead of a raw fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { if (url === "/api/companies") return asResponse(ok(DIRECTORY)); throw new TypeError("Failed to fetch"); }));
    renderVerify();
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/couldn't reach skipwait.me/)).toBeTruthy();
  });

  it("offers a resend after the server's one-minute window and shows a resend failure on the code step", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const calls = stubApi({ send: [ok({ sent: true }), reply(429, { error: "Too many code requests. Wait before trying again." })] });
    renderVerify();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText(/Resend in 0:30/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Resend code/ })).toBeNull();
    for (let second = 0; second < 61; second++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    fireEvent.click(screen.getByRole("button", { name: /Resend code/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByRole("alert").textContent).toContain("Too many code requests");
    expect(screen.getByText("Enter the code")).toBeTruthy();
    expect(calls.filter(call => call.path === "/api/work-email/otp/send")).toHaveLength(2);
  });

  it("distributes a pasted 6-digit code across all boxes, even into a filled box", async () => {
    stubApi({ directory: [ok(DIRECTORY)], send: [ok({ sent: true })] });
    await reachCodeStep();
    const boxes = () => [1, 2, 3, 4, 5, 6].map(n => (screen.getByLabelText(`Digit ${n}`) as HTMLInputElement).value);
    fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "0" } });
    fireEvent.paste(screen.getByLabelText("Digit 1"), { clipboardData: { getData: () => "401867" } });
    expect(boxes()).toEqual(["4", "0", "1", "8", "6", "7"]);
    fireEvent.paste(screen.getByLabelText("Digit 3"), { clipboardData: { getData: () => " 123 456 " } });
    expect(boxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
  it("keeps the newly typed digit when typing over a filled box", async () => {
    stubApi({ directory: [ok(DIRECTORY)], send: [ok({ sent: true })] });
    await reachCodeStep();
    fireEvent.change(screen.getByLabelText("Digit 2"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Digit 2"), { target: { value: "59" } });
    expect((screen.getByLabelText("Digit 2") as HTMLInputElement).value).toBe("9");
  });
});
