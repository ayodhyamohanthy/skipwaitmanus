// @vitest-environment jsdom
// D-048-p3-verify: the goal rebuild of /verify, the work-email code step a
// referrer must pass before they can review a referral request (packet
// docs/plans/D-048-auth.md sections 6-7). The kit page stays byte-identical
// and is rendered here with the surface flag off to prove the switch.
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import Verify from "./Verify";
import { GOAL_PAGE } from "./goal/verify/GoalVerify";
import { assertGoalPage } from "@/test/goalPageContract";

const { authState, surfaces } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") },
  surfaces: { on: new Set<string>() },
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

type Reply = { status: number; body: unknown };
const ok = (body: unknown): Reply => ({ status: 200, body });
const reply = (status: number, body: unknown): Reply => ({ status, body });
const asResponse = ({ status, body }: Reply) => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

const directoryWith = (domains: Record<string, string[]> = {}): CompanyDirectoryResponse => ({
  companies: LAUNCH_COMPANY_SEED.map(seed => ({ slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: domains[seed.slug] ?? [...seed.domains], openToReferrals: true })),
  openCount: LAUNCH_COMPANY_SEED.length,
});
const DIRECTORY = directoryWith();

const renderVerify = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Verify /></QueryClientProvider>);

/** Routes each endpoint to a queue of replies (the last reply repeats) and records the requests. */
function stubApi(routes: { send?: Reply[]; check?: Reply[]; enroll?: Reply[]; preferences?: Reply[]; profile?: Reply[]; directory?: Reply[] } = {}) {
  const calls: { path: string; body: Record<string, string> }[] = [];
  const next = (queue: Reply[] | undefined) => (queue && queue.length > 1 ? queue.shift() : queue?.[0]) ?? ok({});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path === "/api/companies") return asResponse(next(routes.directory ?? [ok(DIRECTORY)]));
    calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
    if (path === "/api/work-email/otp/send") return asResponse(next(routes.send));
    if (path === "/api/work-email/otp/verify") return asResponse(next(routes.check));
    if (path === "/api/company-referrals/verify-work-email") return asResponse(next(routes.enroll));
    if (path === "/api/referrer-preferences") return asResponse(next(routes.preferences ?? [ok({ preferences: {} })]));
    if (path === "/api/profile/me") return asResponse(next(routes.profile ?? [ok({ profile: { handle: null } })]));
    throw new Error(`unexpected ${path}`);
  }));
  return calls;
}

async function reachEmailStep(email = "name@wipro.com") {
  const view = renderVerify();
  await screen.findAllByRole("radio");
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: email } });
  return view;
}

async function reachCodeStep(email = "name@wipro.com") {
  const view = await reachEmailStep(email);
  fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
  await screen.findByText("Enter the code");
  return view;
}

function enterCode(digits: string) {
  for (let i = 0; i < 6; i++) fireEvent.change(screen.getByLabelText(`Digit ${i + 1}`), { target: { value: digits[i] ?? "" } });
}

const primary = (container: HTMLElement) => container.querySelectorAll("[data-g-primary]");

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  surfaces.on = new Set(["verify"]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  surfaces.on = new Set<string>();
});

describe("Goal /verify switch", () => {
  it("keeps the kit page when the surface flag is off", async () => {
    surfaces.on = new Set();
    stubApi();
    renderVerify();
    expect(await screen.findByText(/Prove you're inside/)).toBeTruthy();
    expect(screen.queryByText(GOAL_PAGE.goalLine)).toBeNull();
  });

  it("renders the goal body when the surface flag is on", async () => {
    stubApi();
    renderVerify();
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(GOAL_PAGE.goalLine);
  });
});

describe("Goal /verify", () => {
  it("opens with the referrer's goal and one next step", async () => {
    stubApi();
    const { container } = renderVerify();
    await screen.findAllByRole("radio");
    assertGoalPage(container, GOAL_PAGE);
    expect(primary(container)).toHaveLength(1);
    expect(container.querySelector("section[aria-labelledby='goal-next-step-heading']")?.contains(primary(container)[0])).toBe(true);
    expect(container.querySelector("main.g-scope")).toBeTruthy();
    // The kit heading and progress bar are replaced, not recoloured.
    expect(screen.queryByText(/Prove you're inside/)).toBeNull();
    expect(container.textContent).not.toMatch(/\bcredits?\b/i);
  });

  it("names the company it will send the code to", async () => {
    stubApi();
    renderVerify();
    expect(await screen.findByRole("radio", { name: /Wipro/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Your Wipro email")).toBeTruthy();
    expect(screen.getByLabelText(/Work email/).getAttribute("placeholder")).toBe("you@wipro.com");
  });

  it("signed out, hands off to the work-email OTP with a same-origin return target", async () => {
    authState.isSignedIn = false;
    window.history.replaceState({}, "", "/verify");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderVerify();
    const link = await screen.findByRole("link", { name: /Sign in with work email/ });
    expect(link.getAttribute("href")).toBe("/sign-in?intent=referrer&returnTo=%2Fverify");
    assertGoalPage(container, GOAL_PAGE);
    // The directory may load, but no verification call is made before sign-in.
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual(["/api/companies"]);
  });

  it("offers no personal email and no social provider on the referrer side", async () => {
    stubApi();
    renderVerify();
    await screen.findAllByRole("radio");
    for (const provider of [/Continue with Google/, /Continue with Microsoft/, /Continue with GitHub/, /Continue with LinkedIn/, /Continue with Slack/]) expect(screen.queryByRole("button", { name: provider })).toBeNull();
    expect(screen.queryByText(/personal email/i)).toBeNull();
  });

  it("keeps the directory loading, empty and failure states honest", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; return asResponse(ok(DIRECTORY)); }));
    const loading = renderVerify();
    expect(screen.getByTestId("goal-skeleton-rows")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ }).getAttribute("aria-disabled")).toBe("true");
    release?.();
    expect(await screen.findAllByRole("radio")).toHaveLength(5);
    loading.unmount();

    stubApi({ directory: [ok({ companies: [], openCount: 0 })] });
    renderVerify();
    expect(await screen.findByText("No companies are open for verification yet.")).toBeTruthy();

    cleanup();
    stubApi({ directory: [reply(503, { error: "The company directory is unavailable right now" })] });
    const failed = renderVerify();
    expect((await screen.findByRole("alert")).textContent).toContain("The company directory is unavailable right now");
    // The error state's next step is the retry itself, so it is the one commit.
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    assertGoalPage(failed.container, GOAL_PAGE);
  });

  it("refuses a personal inbox and a domain the chosen company does not prove", async () => {
    stubApi({ send: [ok({ sent: true })] });
    await reachEmailStep("name@gmail.com");
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText("Personal inboxes can't prove where you work. Use your Wipro email.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@other.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText("This doesn't match Wipro. Wipro emails end in @wipro.com.")).toBeTruthy();
    expect(screen.queryByText("Enter the code")).toBeNull();
  });

  it("surfaces the server's own send refusal and never reaches the code step", async () => {
    stubApi({ send: [reply(429, { error: "Too many code requests. Wait before trying again.", retryAfterSeconds: 600 })] });
    await reachEmailStep();
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/Too many code requests/)).toBeTruthy();
    expect(screen.queryByText("Enter the code")).toBeNull();
  });

  it("explains a network failure instead of a raw fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/companies") return asResponse(ok(DIRECTORY));
      throw new TypeError("Failed to fetch");
    }));
    await reachEmailStep();
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/couldn't reach skipwait.me/)).toBeTruthy();
  });

  it("verifies the code, redeems the receipt, and only then claims the badge", async () => {
    const calls = stubApi({ send: [ok({ sent: true })], check: [ok({ verified: true, receipt: "receipt-1" })], enroll: [ok({ verified: true, workEmailDomain: "wipro.com" })] });
    const { container } = await reachCodeStep();
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("You're verified at Wipro.")).toBeTruthy();
    expect(calls.map(call => call.path).slice(0, 3)).toEqual(["/api/work-email/otp/send", "/api/work-email/otp/verify", "/api/company-referrals/verify-work-email"]);
    expect(calls[2]?.body).toEqual({ email: "name@wipro.com", receipt: "receipt-1" });
    expect(screen.getByRole("link", { name: /Set up referring/ }).getAttribute("href")).toBe("/referrer-setup");
    await waitFor(() => expect(calls.some(call => call.path === "/api/profile/me")).toBe(true));
    expect(screen.getByRole("link", { name: /View my profile/ }).getAttribute("href")).toBe("/profile?focus=handle");
    assertGoalPage(container, GOAL_PAGE);
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
    expect(screen.getByRole("button", { name: /Verify/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("locks the code step on the server's 429 wait", async () => {
    stubApi({ send: [ok({ sent: true })], check: [reply(429, { error: "Too many tries. Wait 15 minutes.", retryAfterSeconds: 900 })] });
    await reachCodeStep();
    enterCode("111111");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Too many tries");
    expect(screen.getByRole("button", { name: /Verify/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("does not claim verification when enrolment fails, and retries with the same receipt", async () => {
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

  it("spends the receipt on a 403 so the retry needs a new code", async () => {
    const calls = stubApi({ send: [ok({ sent: true })], check: [ok({ verified: true, receipt: "receipt-3" })], enroll: [reply(403, { error: "That code has expired" })] });
    await reachCodeStep();
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("That code has expired"));
    expect((screen.getByLabelText("Digit 1") as HTMLInputElement).disabled).toBe(false);
    expect(calls.filter(call => call.path === "/api/work-email/otp/verify")).toHaveLength(1);
  });

  it("offers a resend only after the server's 30-second window", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stubApi({ send: [ok({ sent: true })] });
    renderVerify();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText(/Resend in 0:30/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Resend code/ })).toBeNull();
    for (let second = 0; second < 31; second++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByRole("button", { name: /Resend code/ })).toBeTruthy();
  });

  it("distributes a pasted six-digit code across every box", async () => {
    stubApi({ send: [ok({ sent: true })] });
    await reachCodeStep();
    const boxes = () => [1, 2, 3, 4, 5, 6].map(n => (screen.getByLabelText(`Digit ${n}`) as HTMLInputElement).value);
    fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "0" } });
    fireEvent.paste(screen.getByLabelText("Digit 1"), { clipboardData: { getData: () => "401867" } });
    expect(boxes()).toEqual(["4", "0", "1", "8", "6", "7"]);
  });

  it("keeps the done panel honest when the profile reads fail", async () => {
    stubApi({ send: [ok({ sent: true })], check: [ok({ verified: true, receipt: "receipt-4" })], enroll: [ok({ verified: true, workEmailDomain: "wipro.com" })], preferences: [reply(500, { error: "down" })], profile: [reply(500, { error: "down" })] });
    await reachCodeStep();
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("You're verified at Wipro.")).toBeTruthy();
    expect(screen.getByText("Verified via work email")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View my profile/ }).getAttribute("href")).toBe("/profile?focus=handle");
  });

  it("names the saved primary function and links the public profile when a handle exists", async () => {
    stubApi({ send: [ok({ sent: true })], check: [ok({ verified: true, receipt: "receipt-5" })], enroll: [ok({ verified: true, workEmailDomain: "wipro.com" })], preferences: [ok({ preferences: { preferAreas: ["Design", "Product"], referralCapacity: 3 } })], profile: [ok({ profile: { handle: "asha-r" } })] });
    await reachCodeStep();
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("Verified via work email · Design")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("link", { name: /View my profile/ }).getAttribute("href")).toBe("/p/asha-r"));
  });

  it("keeps the loading state, and says so, without inventing a next step", () => {
    authState.isLoaded = false;
    stubApi();
    const { container } = renderVerify();
    expect(screen.getByText("Checking your sign-in…")).toBeTruthy();
    expect(container.querySelector("section[aria-labelledby='goal-next-step-heading']")).toBeNull();
    expect(primary(container)).toHaveLength(0);
  });

  it("passes the goal contract in every state that has a next step", async () => {
    stubApi({ send: [ok({ sent: true })], check: [ok({ verified: true, receipt: "receipt-6" })], enroll: [ok({ verified: true, workEmailDomain: "wipro.com" })] });
    const company = renderVerify();
    await screen.findAllByRole("radio");
    assertGoalPage(company.container, GOAL_PAGE);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    assertGoalPage(company.container, GOAL_PAGE);
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    await screen.findByText("Enter the code");
    assertGoalPage(company.container, GOAL_PAGE);
    enterCode("123456");
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    await screen.findByText("You're verified at Wipro.");
    assertGoalPage(company.container, GOAL_PAGE);
  });

  it("opens no seeker AuthKit path from any goal verify file", () => {
    const dir = join(__dirname, "goal", "verify");
    const offenders = readdirSync(dir)
      .filter(name => name.endsWith(".tsx") || name.endsWith(".ts"))
      .filter(name => /SignInButton|openSignIn|auth\/workos/.test(readFileSync(join(dir, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});
