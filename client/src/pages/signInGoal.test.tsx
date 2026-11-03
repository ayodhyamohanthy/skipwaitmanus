// @vitest-environment jsdom
// Goal /sign-in (D-048-p3-signin; packet docs/plans/D-048-auth.md §4, §7):
//   - the moved-page contract holds in every state (assertGoalPage, D-167);
//   - the founder-locked login rule holds on the goal path (D-030, D-049, D-057):
//     seekers get personal email by code plus the five social logins, all on
//     skipwait.me; referrers get the work-email code only, and the referrer
//     files never reach WorkOS;
//   - landing targets, error words, the remembered email and the money
//     sentence match the kit page (D-063, D-095, FIX-device-signin);
//   - SignIn.tsx renders this page when the `sign-in` surface is on.
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { SEEKER_SOCIAL } from "@/components/SeekerSignIn";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import GoalSignIn, { GOAL_LINES, GOAL_PAGE } from "./goal/sign-in/GoalSignIn";
import { GOAL_SEEKER_SOCIAL } from "./goal/sign-in/GoalSeekerForm";
import { CODE_NEEDED, EMAIL_NEEDED, OFFLINE, SEND_FAILED, VERIFY_FAILED } from "./goal/sign-in/useEmailCodeSignIn";

const SEEKER_KEY = "skipwait:signin-email:seeker";
const REFERRER_KEY = "skipwait:signin-email:referrer";

type Call = [string, Record<string, string>];
type Reply = { ok: boolean; body: Record<string, unknown> } | Error;

/** fetch stub: answers each POST from the queue in order and records url + parsed body. */
function stubFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetchMock = vi.fn(async (url: string, init: { body: string }) => {
    calls.push([url, JSON.parse(init.body) as Record<string, string>]);
    const next = queue.shift() ?? { ok: true, body: {} };
    if (next instanceof Error) throw next;
    return { ok: next.ok, json: async () => next.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function stubLocation(search = "") {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign, search });
  return assign;
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

async function reachSeekerCode(email = " Asha@Gmail.com ") {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
  return screen.findByLabelText("Six-digit code");
}

async function reachReferrerCode(email = " Asha@Wipro.com ") {
  fireEvent.change(screen.getByLabelText("Company email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
  return screen.findByLabelText("Six-digit code");
}

beforeEach(() => { window.localStorage.clear(); setOnline(true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); setOnline(true); window.history.replaceState({}, "", "/"); });

describe("goal /sign-in: the moved-page contract (D-167)", () => {
  it("opens on the seeker's goal with one next step and one black commit", () => {
    stubLocation();
    const { container } = render(<GoalSignIn />);
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Get referred.");
    expect(screen.getByRole("heading", { level: 2, name: "Your next step" })).toBeTruthy();
    expect(container.querySelector("[data-g-primary]")?.textContent).toBe("Send sign-in code");
    expect(document.querySelector('[data-skipwait-screen="sign-in"]')).toBeTruthy();
  });

  it("keeps the contract on the seeker's code step", async () => {
    stubLocation();
    stubFetch([{ ok: true, body: { sent: true } }]);
    const { container } = render(<GoalSignIn />);
    await reachSeekerCode();
    assertGoalPage(container, GOAL_PAGE);
    expect(container.querySelector("[data-g-primary]")?.textContent).toBe("Sign in");
    expect(screen.getByRole("status").textContent).toBe("Code sent to asha@gmail.com");
  });

  it("follows the referrer's goal on both referrer steps", async () => {
    stubLocation("?intent=referrer");
    stubFetch([{ ok: true, body: { sent: true } }]);
    const { container } = render(<GoalSignIn />);
    assertGoalPage(container, { goalLine: GOAL_LINES.referrer });
    expect(container.querySelector("[data-g-primary]")?.textContent).toBe("Send sign-in code");
    await reachReferrerCode();
    assertGoalPage(container, { goalLine: GOAL_LINES.referrer });
    expect(container.querySelector("[data-g-primary]")?.textContent).toBe("Verify & sign in");
  });

  it("D-033: two large role cards, switchable any time, and the goal line follows the card", () => {
    stubLocation();
    render(<GoalSignIn />);
    const find = screen.getByRole("button", { name: /Find a referral/ });
    const give = screen.getByRole("button", { name: /Give a referral/ });
    expect(find.getAttribute("aria-pressed")).toBe("true");
    expect(give.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(give);
    expect(give.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(GOAL_LINES.referrer);
    fireEvent.click(find);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(GOAL_LINES.seeker);
    expect(screen.getByLabelText("Email address")).toBeTruthy();
  });
});

describe("goal /sign-in: login rule, job seeker (D-030, D-049)", () => {
  it("offers the same five social logins as the kit, in order, each straight to the provider on skipwait.me", () => {
    const assign = stubLocation();
    render(<GoalSignIn />);
    expect(GOAL_SEEKER_SOCIAL.map(p => [p.id, p.label])).toEqual(SEEKER_SOCIAL.map(p => [p.id, p.label]));
    for (const provider of GOAL_SEEKER_SOCIAL) {
      fireEvent.click(screen.getByRole("button", { name: `Continue with ${provider.label}` }));
      expect(assign).toHaveBeenLastCalledWith(`/api/auth/workos/sign-in?returnTo=%2Fexplore&provider=${provider.id}`);
    }
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining("authkit.app"));
    expect(screen.getByRole("button", { name: /Continue with email/ })).toBeTruthy();
    expect(screen.queryByLabelText("Company email")).toBeNull();
    expect(document.querySelector("input[type=password]")).toBeNull();
  });

  it("shows the email field up front: it is the first control of the seeker form (D-095 item 2)", () => {
    stubLocation();
    render(<GoalSignIn />);
    const email = screen.getByLabelText("Email address");
    const form = screen.getByTestId("seeker-sign-in");
    expect(form.querySelectorAll("input, button")[0]).toBe(email);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    expect(document.activeElement).toBe(email);
  });

  it("sends and checks the code on the email-code routes, then lands on /explore and remembers the address", async () => {
    const assign = stubLocation();
    const { calls } = stubFetch([{ ok: true, body: { sent: true } }, { ok: true, body: { signedIn: true } }]);
    render(<GoalSignIn />);
    const code = await reachSeekerCode();
    fireEvent.change(code, { target: { value: "12a34 56" } });
    expect((code as HTMLInputElement).value).toBe("123456");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(calls).toEqual([
      ["/api/auth/workos/email-code/send", { email: "asha@gmail.com" }],
      ["/api/auth/workos/email-code/verify", { email: "asha@gmail.com", code: "123456" }],
    ]);
    expect(window.localStorage.getItem(SEEKER_KEY)).toBe("asha@gmail.com");
    expect(window.localStorage.getItem(REFERRER_KEY)).toBeNull();
  });

  it("'Use a different email' goes back to the email step without a new send", async () => {
    stubLocation();
    const { calls } = stubFetch([{ ok: true, body: { sent: true } }]);
    render(<GoalSignIn />);
    await reachSeekerCode();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});

describe("goal /sign-in: login rule, referrer (D-030, D-057)", () => {
  it("?intent=referrer opens on Give a referral with the work-email code only", () => {
    window.history.replaceState({}, "", "/sign-in?intent=referrer&returnTo=%2Freferrer-home");
    render(<GoalSignIn />);
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Continue with/ })).toBeNull();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Create a free account/ })).toBeNull();
  });

  it("switching to Give a referral removes every personal and social option", () => {
    stubLocation();
    render(<GoalSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
  });

  it("sends and checks the code on the work-email routes only, then lands on the requested same-origin page", async () => {
    const assign = stubLocation("?intent=referrer&returnTo=%2Freferrer-home");
    const { calls } = stubFetch([{ ok: true, body: { sent: true } }, { ok: true, body: { signedIn: true } }]);
    render(<GoalSignIn />);
    const code = await reachReferrerCode();
    fireEvent.change(code, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/referrer-home"));
    expect(calls).toEqual([
      ["/api/auth/otp/send", { email: "asha@wipro.com" }],
      ["/api/auth/otp/verify", { email: "asha@wipro.com", code: "654321" }],
    ]);
    expect(calls.some(([url]) => url.includes("workos"))).toBe(false);
    expect(window.localStorage.getItem(REFERRER_KEY)).toBe("asha@wipro.com");
  });

  it("an off-site returnTo lands a referrer on /referrer-setup", async () => {
    const assign = stubLocation("?intent=referrer&returnTo=https%3A%2F%2Fevil.example%2Fx");
    stubFetch([{ ok: true, body: { sent: true } }, { ok: true, body: { signedIn: true } }]);
    render(<GoalSignIn />);
    fireEvent.change(await reachReferrerCode(), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/referrer-setup"));
  });

  it("no referrer-side goal file can open WorkOS or the AuthKit sign-in", () => {
    const dir = join(__dirname, "goal", "sign-in");
    for (const file of ["GoalReferrerForm.tsx", "useEmailCodeSignIn.ts", "SignInParts.tsx", "GoalSignIn.tsx"]) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/SignInButton|openSignIn|auth\/workos|authkit\.app/);
    }
    expect(readFileSync(join(dir, "GoalSeekerForm.tsx"), "utf8")).not.toMatch(/SignInButton|openSignIn|authkit\.app|type="password"/);
  });
});

describe("goal /sign-in: honest failures (no silent catch)", () => {
  it("shows the server's own words when a send is refused, and stays on the email step", async () => {
    const assign = stubLocation();
    stubFetch([{ ok: false, body: { error: "Wait a moment before requesting another code." } }]);
    render(<GoalSignIn />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Wait a moment before requesting another code.");
    expect(screen.getByLabelText("Email address").getAttribute("aria-invalid")).toBe("true");
    expect(assign).not.toHaveBeenCalled();
  });

  it("falls back to plain words when the network fails or the answer is not JSON", async () => {
    stubLocation();
    stubFetch([new TypeError("network down"), { ok: true, body: { sent: true } }, { ok: false, body: { unexpected: 1 } }]);
    render(<GoalSignIn />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    expect((await screen.findByRole("alert")).textContent).toBe(SEND_FAILED);
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    fireEvent.change(await screen.findByLabelText("Six-digit code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe(VERIFY_FAILED);
  });

  it("asks for a full address or all six digits before spending a send", async () => {
    stubLocation();
    const { calls } = stubFetch([{ ok: true, body: { sent: true } }]);
    render(<GoalSignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    expect(screen.getByRole("alert").textContent).toBe(EMAIL_NEEDED);
    expect(calls).toHaveLength(0);
    await reachSeekerCode("asha@gmail.com");
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert").textContent).toBe(CODE_NEEDED);
    expect(calls).toHaveLength(1);
  });

  it("says so when the device is offline instead of failing silently", () => {
    stubLocation();
    setOnline(false);
    const { fetchMock } = stubFetch([]);
    render(<GoalSignIn />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    expect(screen.getByRole("alert").textContent).toBe(OFFLINE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends once while a send is in flight, with an honest busy label", async () => {
    stubLocation();
    let release: (value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise(resolve => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalSignIn />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@gmail.com" } });
    const send = screen.getByRole("button", { name: "Send sign-in code" });
    fireEvent.click(send);
    expect(send.textContent).toBe("Sending code…");
    expect(send.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(send);
    fireEvent.submit(screen.getByTestId("seeker-sign-in"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { release({ ok: true, json: async () => ({ sent: true }) }); });
    expect(await screen.findByLabelText("Six-digit code")).toBeTruthy();
  });
});

describe("goal /sign-in: the device-remembered email (FIX-device-signin)", () => {
  it("prefills each role's own address, and 'Not you?' forgets it", () => {
    stubLocation();
    window.localStorage.setItem(SEEKER_KEY, "asha@gmail.com");
    window.localStorage.setItem(REFERRER_KEY, "asha@wipro.com");
    render(<GoalSignIn />);
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("asha@gmail.com");
    fireEvent.click(screen.getByRole("button", { name: "Not you? Forget this email" }));
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("");
    expect(window.localStorage.getItem(SEEKER_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect((screen.getByLabelText("Company email") as HTMLInputElement).value).toBe("asha@wipro.com");
  });
});

describe("goal /sign-in: landing targets (D-095)", () => {
  afterEach(() => { vi.doUnmock("@/lib/oneTap"); vi.resetModules(); });

  async function freshPage(oneTap: boolean) {
    vi.resetModules();
    vi.doMock("@/lib/oneTap", () => ({ ONE_TAP_PAY_SIGNIN: oneTap }));
    return (await import("./goal/sign-in/GoalSignIn")).default;
  }

  it("flag off: a seeker lands on /explore even with a returnTo, except an admin page", async () => {
    let assign = stubLocation("?returnTo=%2Fpremium%3Fquantity%3D7");
    let Page = await freshPage(false);
    const first = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(String(assign.mock.calls[0][0])).toContain("returnTo=%2Fexplore&");
    first.unmount();
    vi.unstubAllGlobals();
    assign = stubLocation("?returnTo=%2Fadmin%2Fusers");
    Page = await freshPage(false);
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(decodeURIComponent(String(assign.mock.calls[0][0]))).toContain("returnTo=/admin/users&");
  });

  it("flag on: a same-origin returnTo is kept; an off-site one falls back to /explore", async () => {
    let assign = stubLocation("?returnTo=%2Fpremium%3Fquantity%3D7");
    let Page = await freshPage(true);
    const first = render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(decodeURIComponent(String(assign.mock.calls[0][0]))).toContain("/premium?quantity=7");
    first.unmount();
    vi.unstubAllGlobals();
    assign = stubLocation("?returnTo=https%3A%2F%2Fevil.test%2Fx");
    Page = await freshPage(true);
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(decodeURIComponent(String(assign.mock.calls[0][0]))).toContain("returnTo=/explore&");
  });
});

describe("goal /sign-in: what every visitor reads", () => {
  it("carries the beta line, the money sentence, the interview caveat and the legal links (D-063)", () => {
    stubLocation();
    render(<GoalSignIn />);
    expect(screen.getByTestId("beta-notice-line")).toBeTruthy();
    expect(document.body.textContent).toContain(MONEY_SENTENCE_SHORT);
    expect(document.body.textContent).toContain("A referral never guarantees an interview.");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.queryByText(/design preview|sample/i)).toBeNull();
  });
});

describe("SignIn switch (D-097)", () => {
  afterEach(() => { vi.doUnmock("@/lib/goalSurfaces"); vi.resetModules(); });

  it("renders the goal page when the sign-in surface is on, and the kit page when it is off", async () => {
    stubLocation();
    vi.resetModules();
    vi.doMock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => id === "sign-in" }));
    const On = (await import("./SignIn")).default;
    const on = render(<On />);
    assertGoalPage(on.container, GOAL_PAGE);
    expect(screen.queryByText("YOUR DOOR STARTS HERE")).toBeNull();
    on.unmount();
    vi.resetModules();
    vi.doMock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: () => false }));
    const Off = (await import("./SignIn")).default;
    render(<Off />);
    expect(screen.getByText("YOUR DOOR STARTS HERE")).toBeTruthy();
  });
});
