// @vitest-environment jsdom
// MOBILE-both-prompt (D-414 (2), packet docs/plans/MOBILE-app-flow.md): the "Where do you work now?" sheet.
// 1. The contract (shared/bothRolesPrompt.ts): the switch ships off, the packet's words verbatim, the read's edges.
// 2. The sheet: dialog semantics, "Not now" and Escape, the personal-inbox refusal, and the verification through the
//    existing in-portal work-email routes (D-057) only - never the standalone referrer code login.
// 3. The mount: only in the composer's sent state, only with the switch on and the server's yes, at most once.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { flags, track, go, authState } = vi.hoisted(() => ({
  flags: { bothRoles: false },
  track: vi.fn(),
  go: vi.fn(),
  authState: { isSignedIn: true },
}));

vi.mock("@shared/bothRolesPrompt", async importOriginal => {
  const actual = await importOriginal<typeof import("@shared/bothRolesPrompt")>();
  return { ...actual, get BOTH_ROLES_PROMPT() { return flags.bothRoles; } };
});
vi.mock("@/lib/clarity", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/clarity")>(), trackClarityEvent: track }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", async importOriginal => ({ ...await importOriginal<typeof import("@/hooks/useReferrerAccess")>(), useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/explore", go],
  useSearch: () => "",
  useRoute: () => [false, { slug: "wipro" }],
}));
// The composer's sent state is pinned in exploreDrawer.test.tsx; these tests pin only what this row adds to it.
vi.mock("../../../../shared/askNoExpiry", async importOriginal => ({ ...await importOriginal<typeof import("../../../../shared/askNoExpiry")>(), ASK_NO_EXPIRY_ENABLED: false }));

import * as contract from "@shared/bothRolesPrompt";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { NETWORK_MESSAGE } from "@/components/verify/verifyApi";
import Explore from "@/pages/Explore";
import { BothRolesSheet, fetchBothRolesPrompt } from "./BothRolesSheet";

const { BOTH_ROLES_COPY, BOTH_ROLES_CODE_COPY, BOTH_ROLES_DONE_COPY, BOTH_ROLES_ERRORS, BOTH_ROLES_EVENTS, BOTH_ROLES_PROMPT_PATH } = contract;
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
type Reply = { status: number; body: unknown } | "offline";
type Calls = ReturnType<typeof vi.fn>;
const callsTo = (fetchMock: Calls, path: string) => fetchMock.mock.calls.filter(([url]) => String(url) === path || String(url).startsWith(`${path}?`));
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;

beforeEach(() => {
  flags.bothRoles = false;
  authState.isSignedIn = true;
  track.mockReset();
  go.mockReset();
  sessionStorage.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the contract (shared/bothRolesPrompt.ts)", () => {
  it("ships the switch off", async () => {
    const actual = await vi.importActual<typeof import("@shared/bothRolesPrompt")>("@shared/bothRolesPrompt");
    expect(actual.BOTH_ROLES_PROMPT).toBe(false);
  });

  it("carries the packet's words verbatim", () => {
    expect(BOTH_ROLES_COPY).toEqual({
      title: "Where do you work now?",
      body: "Verify your work email and you can refer good people at your company too.",
      privacy: "Your colleagues never see that you're looking. Requests never go to your own employer.",
      emailLabel: "Work email",
      verify: "Verify my work email",
      notNow: "Not now",
    });
  });

  it("reads only the request just sent, as a positive id", () => {
    expect(contract.bothRolesPromptQuerySchema.parse({ requestId: "501" })).toEqual({ requestId: 501 });
    for (const query of [{}, { requestId: "0" }, { requestId: "-3" }, { requestId: "1.5" }, { requestId: "abc" }, { requestId: "99999999999" }, { requestId: ["1", "2"] }, { requestId: "501", userId: "9" }]) {
      expect(contract.bothRolesPromptQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("answers only show, as a boolean", () => {
    expect(contract.bothRolesPromptResponseSchema.parse({ show: true })).toEqual({ show: true });
    for (const body of [{}, { show: "yes" }, { show: true, email: "x@y.com" }, null]) expect(contract.bothRolesPromptResponseSchema.safeParse(body).success).toBe(false);
  });

  it("shows only right after the person's first request, and never once they hold a verified work email", () => {
    const show = contract.shouldShowBothRolesPrompt;
    expect(show({ requestId: 501, firstRequestIds: [501], hasVerifiedWorkEmail: false })).toBe(true);
    expect(show({ requestId: 501, firstRequestIds: [501], hasVerifiedWorkEmail: true })).toBe(false);
    expect(show({ requestId: 502, firstRequestIds: [501, 502], hasVerifiedWorkEmail: false })).toBe(false);
    expect(show({ requestId: 501, firstRequestIds: [501, 502], hasVerifiedWorkEmail: false })).toBe(false);
    expect(show({ requestId: 777, firstRequestIds: [501], hasVerifiedWorkEmail: false })).toBe(false);
    expect(show({ requestId: 501, firstRequestIds: [], hasVerifiedWorkEmail: false })).toBe(false);
  });
});

describe("the read (fetchBothRolesPrompt)", () => {
  it("asks for the request just sent and opens only on a parsed yes; every failure reads as no", async () => {
    const replies: Reply[] = [{ status: 200, body: { show: true } }, { status: 200, body: { show: false } }, { status: 404, body: { error: "Not found" } }, { status: 500, body: {} }, { status: 200, body: { show: "yes" } }, "offline"];
    const answers: boolean[] = [];
    for (const reply of replies) {
      const fetchMock = vi.fn(async () => { if (reply === "offline") throw new TypeError("Failed to fetch"); return json(reply.status, reply.body); });
      vi.stubGlobal("fetch", fetchMock);
      answers.push(await fetchBothRolesPrompt(501, async () => "test-token"));
      expect(fetchMock).toHaveBeenCalledWith(`${BOTH_ROLES_PROMPT_PATH}?requestId=501`, { credentials: "include", headers: { Authorization: "Bearer test-token" } });
    }
    expect(answers).toEqual([true, false, false, false, false, false]);
  });
});

function verifyStub(options: { verify?: () => Reply; enroll?: () => Reply; send?: () => Reply } = {}) {
  const reply = (fallback: Reply, pick?: () => Reply) => { const chosen = pick?.() ?? fallback; if (chosen === "offline") throw new TypeError("Failed to fetch"); return json(chosen.status, chosen.body); };
  const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/work-email/otp/send") return reply({ status: 200, body: { sent: true } }, options.send);
    if (path === "/api/work-email/otp/verify") return reply({ status: 200, body: { verified: true, receipt: "receipt-1", expiresAt: "2026-11-28T10:10:00.000Z" } }, options.verify);
    if (path === "/api/company-referrals/verify-work-email") return reply({ status: 200, body: { verified: true, workEmailDomain: "acme.com", reward: { rewarded: false } } }, options.enroll);
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderSheet() {
  const onClose = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><BothRolesSheet open onClose={onClose} fetchToken={async () => "test-token"} /></QueryClientProvider>);
  return { onClose, sheet: screen.getByTestId("both-roles-sheet") };
}
const enterEmail = (sheet: HTMLElement, value: string) => {
  fireEvent.change(within(sheet).getByLabelText(BOTH_ROLES_COPY.emailLabel), { target: { value } });
  fireEvent.click(within(sheet).getByRole("button", { name: BOTH_ROLES_COPY.verify }));
};
const enterCode = async (sheet: HTMLElement, value = "123456") => {
  fireEvent.change(await within(sheet).findByLabelText(BOTH_ROLES_CODE_COPY.label), { target: { value } });
  fireEvent.click(within(sheet).getByRole("button", { name: BOTH_ROLES_CODE_COPY.confirm }));
};

describe("the sheet", () => {
  it("is a labelled dialog with the packet's words, one black action, and focus on the sheet rather than the keyboard", async () => {
    verifyStub();
    const { sheet } = renderSheet();
    const dialog = screen.getByRole("dialog", { name: BOTH_ROLES_COPY.title });
    expect(dialog).toBe(sheet);
    expect(within(sheet).getByText(BOTH_ROLES_COPY.body)).toBeTruthy();
    expect(within(sheet).getByText(BOTH_ROLES_COPY.privacy)).toBeTruthy();
    expect(within(sheet).getByLabelText(BOTH_ROLES_COPY.emailLabel).getAttribute("type")).toBe("email");
    expect(within(sheet).getByRole("button", { name: BOTH_ROLES_COPY.notNow })).toBeTruthy();
    expect(sheet.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    expect(within(sheet).getByRole("button", { name: BOTH_ROLES_COPY.verify }).hasAttribute("data-g-primary")).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(sheet));
  });

  it("closes as a dismissal on Not now and on Escape", () => {
    verifyStub();
    const first = renderSheet();
    fireEvent.click(within(first.sheet).getByRole("button", { name: BOTH_ROLES_COPY.notNow }));
    expect(first.onClose).toHaveBeenCalledWith("dismissed");
    cleanup();
    const second = renderSheet();
    fireEvent.keyDown(second.sheet, { key: "Escape" });
    expect(second.onClose).toHaveBeenCalledWith("dismissed");
  });

  it("refuses a personal inbox or a partial address before any request", async () => {
    const fetchMock = verifyStub();
    const { sheet } = renderSheet();
    enterEmail(sheet, "ada@gmail.com");
    expect((await within(sheet).findByRole("alert")).textContent).toBe(BOTH_ROLES_ERRORS.personal);
    enterEmail(sheet, "ada@yahoo.co.in");
    expect(within(sheet).getByRole("alert").textContent).toBe(BOTH_ROLES_ERRORS.personal);
    enterEmail(sheet, "ada@");
    expect(within(sheet).getByRole("alert").textContent).toBe(BOTH_ROLES_ERRORS.email);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies through the existing in-portal routes only: code, receipt, then the receipt redeemed on this account", async () => {
    const fetchMock = verifyStub();
    const { sheet, onClose } = renderSheet();
    enterEmail(sheet, "  Ada@Acme.com ");
    expect(await within(sheet).findByText(BOTH_ROLES_CODE_COPY.sentTo("ada@acme.com"))).toBeTruthy();
    await enterCode(sheet);
    expect(await within(sheet).findByText(BOTH_ROLES_DONE_COPY.title("acme.com"))).toBeTruthy();
    expect(within(sheet).getByText(BOTH_ROLES_DONE_COPY.body)).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/work-email/otp/send", "/api/work-email/otp/verify", "/api/company-referrals/verify-work-email"]);
    expect(bodyOf(callsTo(fetchMock, "/api/work-email/otp/send")[0])).toEqual({ email: "ada@acme.com" });
    expect(bodyOf(callsTo(fetchMock, "/api/work-email/otp/verify")[0])).toEqual({ email: "ada@acme.com", code: "123456" });
    expect(bodyOf(callsTo(fetchMock, "/api/company-referrals/verify-work-email")[0])).toEqual({ email: "ada@acme.com", receipt: "receipt-1" });
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-token" });
    // Never the standalone referrer code login, which would make another account (D-030, D-245).
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/auth/"))).toBe(false);
    expect(track.mock.calls.map(([name]) => name)).toEqual([BOTH_ROLES_EVENTS.verifyStarted, BOTH_ROLES_EVENTS.verified]);
    await waitFor(() => expect(document.activeElement?.textContent).toBe(BOTH_ROLES_DONE_COPY.done));
    fireEvent.click(within(sheet).getByRole("button", { name: BOTH_ROLES_DONE_COPY.done }));
    expect(onClose).toHaveBeenCalledWith("verified");
  });

  it("shows the server's words for a wrong code and a lock, and keeps the receipt when only the redeem fails", async () => {
    let verifyReply: Reply = { status: 400, body: { error: "That code could not be verified. Check the latest code and try again." } };
    let enrollReply: Reply = { status: 500, body: { error: "We could not verify your work email" } };
    const fetchMock = verifyStub({ verify: () => verifyReply, enroll: () => enrollReply });
    const { sheet } = renderSheet();
    enterEmail(sheet, "ada@acme.com");
    await enterCode(sheet, "111111");
    expect((await within(sheet).findByRole("alert")).textContent).toBe("That code could not be verified. Check the latest code and try again.");
    verifyReply = { status: 429, body: { error: "Too many tries. Try again later.", retryAfterSeconds: 900 } };
    await enterCode(sheet, "222222");
    await waitFor(() => expect(within(sheet).getByRole("alert").textContent).toBe(BOTH_ROLES_ERRORS.locked));
    verifyReply = { status: 200, body: { verified: true, receipt: "receipt-9", expiresAt: "2026-11-28T10:10:00.000Z" } };
    await enterCode(sheet, "333333");
    await waitFor(() => expect(within(sheet).getByRole("alert").textContent).toBe("We could not verify your work email"));
    enrollReply = { status: 200, body: { verified: true, workEmailDomain: "acme.com" } };
    fireEvent.click(within(sheet).getByRole("button", { name: BOTH_ROLES_CODE_COPY.confirm }));
    expect(await within(sheet).findByText(BOTH_ROLES_DONE_COPY.title("acme.com"))).toBeTruthy();
    // The retry redeemed the same receipt; it did not spend a new code.
    expect(callsTo(fetchMock, "/api/work-email/otp/verify")).toHaveLength(3);
    expect(callsTo(fetchMock, "/api/company-referrals/verify-work-email").map(bodyOf)).toEqual([{ email: "ada@acme.com", receipt: "receipt-9" }, { email: "ada@acme.com", receipt: "receipt-9" }]);
  });

  it("says plainly when the network drops, and keeps the address", async () => {
    verifyStub({ send: () => "offline" });
    const { sheet } = renderSheet();
    enterEmail(sheet, "ada@acme.com");
    expect((await within(sheet).findByRole("alert")).textContent).toBe(NETWORK_MESSAGE);
    expect((within(sheet).getByLabelText(BOTH_ROLES_COPY.emailLabel) as HTMLInputElement).value).toBe("ada@acme.com");
  });
});

// The mount: the composer's sent state on Find a referral (the drawer), with a minimal live stub.
const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === "wipro");
if (!seed) throw new Error("the wipro seed is missing");
const WIPRO: PublicCompany = { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true };
const DIRECTORY: CompanyDirectoryResponse = { companies: [WIPRO], openCount: 1 };
const SETUP = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };
const sentBody = (requestId: number) => ({ requestId, companyDomain: "wipro.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } });

function pageStub(prompt: (requestId: number) => Reply) {
  let nextId = 501;
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies") return json(200, DIRECTORY);
    if (path.endsWith("/opportunities")) return json(200, { opportunities: [] });
    if (path.startsWith("/api/companies/")) return json(200, { company: WIPRO });
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, SETUP);
    if (path === "/api/ask-drafts") return json(200, method === "GET" ? { draft: null } : { ok: true });
    if (path === "/api/company-referrals" && method === "POST") return json(200, sentBody(nextId++));
    if (path.startsWith(`${BOTH_ROLES_PROMPT_PATH}?`)) {
      const reply = prompt(Number(new URL(path, "https://skipwait.test").searchParams.get("requestId")));
      if (reply === "offline") throw new TypeError("Failed to fetch");
      return json(reply.status, reply.body);
    }
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function sendFirstRequest() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Explore /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("link", { name: "Wipro" }));
  await sendFromDrawer();
}
async function sendFromDrawer() {
  const drawer = await screen.findByTestId("goal-drawer");
  const link = within(drawer).getByLabelText("Job link");
  fireEvent.change(link, { target: { value: "https://careers.wipro.com/jobs/1234567-product-designer" } });
  fireEvent.blur(link);
  fireEvent.change(within(drawer).getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
  fireEvent.change(within(drawer).getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
  fireEvent.change(within(drawer).getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
  await within(drawer).findByText("ada-resume.pdf");
  fireEvent.click(within(drawer).getByRole("button", { name: "Send referral request" }));
  await screen.findByText("Referral request sent to Wipro.");
}

describe("the mount (the composer's sent state)", () => {
  it("with the switch off, a sent request asks nothing and shows nothing", async () => {
    const fetchMock = pageStub(() => ({ status: 200, body: { show: true } }));
    await sendFirstRequest();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(callsTo(fetchMock, BOTH_ROLES_PROMPT_PATH)).toHaveLength(0);
    expect(screen.queryByTestId("both-roles-sheet")).toBeNull();
  });

  it("with the switch on, the first request opens the sheet once with the packet's words; Not now closes it for good", async () => {
    flags.bothRoles = true;
    const fetchMock = pageStub(requestId => ({ status: 200, body: { show: requestId === 501 } }));
    await sendFirstRequest();
    const sheet = await screen.findByTestId("both-roles-sheet");
    expect(callsTo(fetchMock, BOTH_ROLES_PROMPT_PATH).map(([url]) => String(url))).toEqual([`${BOTH_ROLES_PROMPT_PATH}?requestId=501`]);
    expect(within(sheet).getByRole("heading", { name: BOTH_ROLES_COPY.title })).toBeTruthy();
    expect(within(sheet).getByText(BOTH_ROLES_COPY.body)).toBeTruthy();
    expect(within(sheet).getByText(BOTH_ROLES_COPY.privacy)).toBeTruthy();
    expect(screen.getAllByTestId("both-roles-sheet")).toHaveLength(1);
    expect(track).toHaveBeenCalledWith(BOTH_ROLES_EVENTS.shown);
    // The desktop drawer is not modal: the sheet's focus must not read as "outside" and close the sent state
    // under it (the drawer clears 200 ms after it closes).
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(screen.getByTestId("both-roles-sheet")).toBe(sheet);
    expect(within(screen.getByTestId("goal-drawer")).getByText("Referral request sent to Wipro.")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: BOTH_ROLES_COPY.notNow }));
    await waitFor(() => expect(screen.queryByTestId("both-roles-sheet")).toBeNull());
    expect(track).toHaveBeenCalledWith(BOTH_ROLES_EVENTS.dismissed);
    // The next request in this session neither asks again nor shows the sheet; the server would say no anyway
    // (it is no longer the person's first request), so nothing needs a stored dismissal to stay closed.
    const active = await screen.findByTestId("goal-drawer");
    fireEvent.click(within(active).getByRole("button", { name: "New request" }));
    fireEvent.click(await screen.findByRole("link", { name: "Wipro" }));
    await sendFromDrawer();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(callsTo(fetchMock, BOTH_ROLES_PROMPT_PATH)).toHaveLength(1);
    expect(screen.queryByTestId("both-roles-sheet")).toBeNull();
  });

  it("on a phone it opens over the full-height drawer and Escape leaves the sent state in place", async () => {
    flags.bothRoles = true;
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
    pageStub(() => ({ status: 200, body: { show: true } }));
    await sendFirstRequest();
    const sheet = await screen.findByTestId("both-roles-sheet");
    await waitFor(() => expect(document.activeElement).toBe(sheet));
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("both-roles-sheet")).toBeNull());
    expect(within(screen.getByTestId("goal-drawer")).getByText("Referral request sent to Wipro.")).toBeTruthy();
    expect(track).toHaveBeenCalledWith(BOTH_ROLES_EVENTS.dismissed);
  });

  it("never shows when the server says no: a verified work email, a later request, or a failed read", async () => {
    flags.bothRoles = true;
    for (const reply of [{ status: 200, body: { show: false } }, { status: 500, body: { error: "x" } }, "offline"] as Reply[]) {
      const fetchMock = pageStub(() => reply);
      await sendFirstRequest();
      await waitFor(() => expect(callsTo(fetchMock, BOTH_ROLES_PROMPT_PATH)).toHaveLength(1));
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(screen.queryByTestId("both-roles-sheet")).toBeNull();
      cleanup();
    }
  });
});
