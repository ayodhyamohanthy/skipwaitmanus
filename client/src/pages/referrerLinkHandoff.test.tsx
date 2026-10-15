// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeAuthReturnTo } from "@shared/authReturnTo";
import { readAskPrefill } from "@/lib/askPrefill";
import FastTrackLink from "./FastTrackLink";
import VanityFastTrackLink from "./VanityFastTrackLink";
import JobExplorer from "./JobExplorer";
import Onboarding from "./Onboarding";
import Ask from "./Ask";

// D-017 end to end in the client: each entry page hands the job link and the
// referrer's personal link on until /ask sends them, across a sign-in round trip.
const { authState, route, go, signInReturns } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, getToken: async () => "test-token" },
  route: { params: {} as Record<string, string> },
  go: { calls: [] as string[] },
  signInReturns: [] as string[],
}));

vi.mock("@/_core/auth", async () => {
  const { safeAuthReturnTo: returnTo } = await import("@shared/authReturnTo");
  // Mirrors openSignIn: the return address is the current URL, path + query + hash.
  const openSignIn = () => { signInReturns.push(returnTo(window.location.href, window.location.origin) ?? "/"); };
  return {
    useAuth: () => ({ ...authState, openSignIn }),
    useUser: () => ({ isLoaded: true, user: null }),
    SignInButton: ({ children }: { children: React.ReactElement<{ onClick?: () => void }> }) => React.cloneElement(children, { onClick: openSignIn }),
  };
});
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRoute: () => [true, route.params],
  // Navigating moves the jsdom URL, as the browser would, so the next page reads it.
  useLocation: () => [window.location.pathname, (to: string) => { go.calls.push(to); window.history.replaceState(null, "", to); }],
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("@/components/Brand", () => ({ Brand: () => null }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const CODE = "abcdefghijklmnop1234";
const JOB = "https://careers.tcs.com/jobs/product-designer-42";
const NOTE = "I've led two end-to-end redesigns of enterprise approval workflows, cutting task time by 40% for 3000 users over 4 years. This role focuses on the same problem space and I'd value an honest fit check.";
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); go.calls.length = 0; signInReturns.length = 0;
  authState.isSignedIn = true; route.params = {};
  vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer), importKey: vi.fn(async () => ({})), encrypt: vi.fn(async () => new Uint8Array(16).buffer) } });
  fetchMock = vi.fn(async (input: string) => {
    const path = String(input);
    if (path.startsWith("/api/referrer-fast-track/")) return ok({ link: { companyDomain: "tcs.com", isActive: true } });
    if (path === "/api/job-link/preview") return ok({ canonicalUrl: JOB, status: "fresh", employerConfidence: "direct-domain", companyDomain: "tcs.com", reason: "ok", recoveryAction: "Continue" });
    if (path.startsWith("/api/jobs")) return ok({ jobs: [{ id: 5, title: "Product Designer", company: "TCS", location: "Pune", targetRoleUrl: JOB }] });
    if (path.endsWith("/api/documents/uploads")) return ok({ sessionId: "sess-1", chunkBytes: 1024 * 1024 });
    if (path.includes("/chunks")) return ok({});
    if (path.includes("/complete")) return ok({ id: 77, fileName: "resume.pdf" });
    if (path === "/api/company-referrals") return ok({ requestId: 50, companyDomain: "tcs.com", fastTrack: true });
    return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

function lastPath() { return go.calls[go.calls.length - 1]; }

async function continueFromStart(expectedJob: string) {
  render(<Onboarding />);
  const input = screen.getByLabelText("Target Role URL") as HTMLInputElement;
  if (!input.value) fireEvent.change(input, { target: { value: expectedJob } });
  expect(input.value).toBe(expectedJob);
  await waitFor(() => expect(screen.getByRole("button", { name: /Continue/ })).toHaveProperty("disabled", false));
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  cleanup();
}

async function sendFromAsk() {
  render(<Ask />);
  expect((screen.getByLabelText(/Official job link/) as HTMLInputElement).value).toBe(JOB);
  fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: NOTE } });
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
  await screen.findByText("Ask sent to tcs.com.");
  const send = fetchMock.mock.calls.find(([url]) => String(url) === "/api/company-referrals");
  return JSON.parse(String((send as unknown as Array<{ body?: string }>)[1]?.body)) as Record<string, unknown>;
}

describe("referrer personal link hand-off", () => {
  it("/fast/:code -> /start -> /ask keeps the code and the job link, through sign-in", async () => {
    route.params = { linkCode: CODE };
    window.history.replaceState(null, "", `/fast/${CODE}`);
    render(<FastTrackLink />);
    fireEvent.click(await screen.findByRole("button", { name: /Start private request/ }));
    expect(lastPath()).toBe(`/start?fast=${CODE}`);
    cleanup();

    await continueFromStart(JOB);
    expect(lastPath()).toBe(`/ask?fast=${CODE}`);
    expect(readAskPrefill()).toMatchObject({ targetRoleUrl: JOB, referrerLink: { fastTrackCode: CODE } });

    // Signed out on /ask: sign-in returns to the same URL (client and server both use safeAuthReturnTo).
    authState.isSignedIn = false;
    render(<Ask />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in to ask" }));
    const returnTo = safeAuthReturnTo(signInReturns[0], "https://skipwait.me");
    expect(returnTo).toBe(`/ask?fast=${CODE}`);
    cleanup();
    window.history.replaceState(null, "", returnTo);
    authState.isSignedIn = true;

    const body = await sendFromAsk();
    expect(body).toMatchObject({ targetRoleUrl: JOB, fastTrackCode: CODE });
    expect(readAskPrefill()).toBeNull();
  });

  it("/refer/:company/:alias -> /start -> /ask keeps the slug and alias", async () => {
    route.params = { companySlug: "tcs", vanityAlias: "asha-k" };
    window.history.replaceState(null, "", "/refer/tcs/asha-k");
    render(<VanityFastTrackLink />);
    fireEvent.click(await screen.findByRole("button", { name: /Start private request/ }));
    expect(lastPath()).toBe("/start?referCompany=tcs&referAlias=asha-k");
    cleanup();

    await continueFromStart(JOB);
    expect(lastPath()).toBe("/ask?referCompany=tcs&referAlias=asha-k");
    const body = await sendFromAsk();
    expect(body).toMatchObject({ targetRoleUrl: JOB, fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" });
    expect(body).not.toHaveProperty("fastTrackCode");
  });

  it("keeps the stored link when sign-in comes back to a bare /ask", async () => {
    window.history.replaceState(null, "", `/start?fast=${CODE}`);
    await continueFromStart(JOB);
    window.history.replaceState(null, "", "/ask");
    const body = await sendFromAsk();
    expect(body).toMatchObject({ fastTrackCode: CODE });
  });

  it("/jobs -> /start -> /ask arrives with the job link and no referrer", async () => {
    window.history.replaceState(null, "", "/jobs");
    render(<JobExplorer />);
    fireEvent.click(await screen.findByRole("button", { name: /Request referral/ }));
    expect(lastPath()).toBe("/start");
    cleanup();

    await continueFromStart(JOB);
    expect(lastPath()).toBe("/ask");
    const body = await sendFromAsk();
    expect(body).toMatchObject({ targetRoleUrl: JOB });
    expect(Object.keys(body).filter(key => key.startsWith("fastTrack"))).toEqual([]);
  });
});
