// @vitest-environment jsdom
// D-057-session-gate (§0b.8b; red first): the kit /email-review page handles a
// 403 work_email_code_required in place — the in-session step-up through the
// ordinary access verdict, never the standalone code sign-in — and retries the
// same review link for the same account after the step-up confirms.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmailReviewAction from "./EmailReviewAction";

const { authState, surfaces } = vi.hoisted(() => ({
  authState: { isSignedIn: true, isLoaded: true },
  surfaces: { on: new Set<string>() },
}));

const getToken = vi.fn().mockResolvedValue("test-token");
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn, isLoaded: authState.isLoaded, getToken }) }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("@/components/WorkEmailSignIn", () => ({ WorkEmailSignIn: () => <div>Work email sign in</div> }));
vi.mock("wouter", () => ({
  useRoute: () => [true, { linkToken: "t".repeat(48) }],
  useLocation: () => ["/email-review", vi.fn()],
}));

const ACCESS = "/api/company-referrals/access";
const LINK = "/api/referrer-review-links/" + "t".repeat(48);
const ACCESS_REQUIRED = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A", codeRequired: true };
const ACCESS_VERIFIED = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" };
// The session's step-up state flips when the verify endpoint confirms the code, as the server would.
let accessCodeRequired = true;
const READY = { ok: true, status: 200, json: async () => ({ review: { ready: true } }) };
const SENT = { ok: true, status: 200, json: async () => ({ sent: true, challengeId: "c".repeat(43), expiresAt: "2026-11-09T10:10:00.000Z" }) };
const VERIFIED = { ok: true, status: 200, json: async () => ({ verified: true, expiresAt: "2026-11-09T22:00:00.000Z" }) };

let reviewLinkReplies: Array<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url === ACCESS) {
    const body = accessCodeRequired ? ACCESS_REQUIRED : ACCESS_VERIFIED;
    return { ok: true, status: 200, json: async () => body };
  }
  if (url === LINK) {
    const reply = reviewLinkReplies.length > 1 ? reviewLinkReplies.shift()! : reviewLinkReplies[0];
    return reply ?? { ok: false, status: 404, json: async () => ({ error: "not found" }) };
  }
  if (url.endsWith("/api/referrer/step-up/send")) return SENT;
  if (url.endsWith("/api/referrer/step-up/verify")) { accessCodeRequired = false; return VERIFIED; }
  return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><EmailReviewAction /></QueryClientProvider>);
}

const CODE_REQUIRED = { ok: false, status: 403, json: async () => ({ error: "Confirm your work email with a code to continue.", code: "work_email_code_required" }) };

const stepUpFlow = async () => {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "ref@acme.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("Code");
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
};

beforeEach(() => {
  surfaces.on = new Set();
  authState.isSignedIn = true;
  accessCodeRequired = true;
  reviewLinkReplies = [];
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); getToken.mockClear(); fetchMock.mockClear(); });

describe("EmailReviewAction with a code_required session (D-057)", () => {
  it("shows the in-session step-up on the 403, never the standalone code sign-in", async () => {
    reviewLinkReplies = [CODE_REQUIRED];
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitFor(() => expect(screen.getByText(/Confirm you still work at Acme/)).toBeTruthy());
    expect(document.querySelector('[data-skipwait-screen="referrer-step-up"]')).toBeTruthy();
    // The standalone sign-in (which would make another account) is never offered.
    expect(screen.queryByText("Work email sign in")).toBeNull();
    expect(document.querySelector('a[href*="/api/auth/otp"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(LINK, expect.objectContaining({ credentials: "include" }));
  });

  it("retries the same review link after the step-up confirms, for the same account", async () => {
    reviewLinkReplies = [CODE_REQUIRED, READY];
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-skipwait-screen="referrer-step-up"]')).toBeTruthy());
    await stepUpFlow();
    await waitFor(() => expect(screen.getByText("Choose your decision.")).toBeTruthy());
    const linkCalls = fetchMock.mock.calls.filter(([url]) => String(url) === LINK);
    expect(linkCalls.length).toBe(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/auth/otp"))).toBe(false);
  });

  it("keeps the signed-out work-email sign-in unchanged", async () => {
    authState.isSignedIn = false;
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Work email sign in")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-screen="referrer-step-up"]')).toBeNull();
  });

  it("keeps the unavailable-link error unchanged", async () => {
    reviewLinkReplies = [{ ok: false, status: 409, json: async () => ({ error: "This private review link is unavailable" }) }];
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Review link unavailable")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-screen="referrer-step-up"]')).toBeNull();
  });
});


describe("coordinator isolated negative reproduction, no runtime change", () => {
  it("POST403 then explicit verification retries the originally pressed body exactly once", async () => {
    reviewLinkReplies = [READY];
    const posts: RequestInit[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (String(input) === LINK + "/decision") {
        posts.push(init!);
        return posts.length === 1 ? CODE_REQUIRED : { ok: true, status: 200, json: async () => ({status:"approved"}) };
      }
      return fetchMock(input, init);
    });
    renderPage();
    await screen.findByText("Choose your decision.");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", {name:"Accept & connect"}));
    await screen.findByLabelText("Work email");
    await stepUpFlow();
    await screen.findByText("Request accepted.");
    expect(posts).toHaveLength(2);
    expect(posts.map(p=>JSON.parse(String(p.body)))).toEqual([
      {decision:"approved",ethicsConfirmed:true}, {decision:"approved",ethicsConfirmed:true}
    ]);
  });
  it("a repeated403 after explicit verification is bounded to one automatic resume", async () => {
    reviewLinkReplies = [CODE_REQUIRED];
    let gets = 0;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (String(input) === LINK) {
        gets++;
        // Safety valve ends an actual loop so this reproduction cannot hammer forever.
        if (gets > 5) return {ok:false,status:409,json:async()=>({error:"reproduction safety stop"})};
      }
      return fetchMock(input, init);
    });
    renderPage();
    await screen.findByLabelText("Work email");
    await stepUpFlow();
    await new Promise(resolve=>setTimeout(resolve,1000));
    console.log("ACTUAL_REPEATED403_GET_COUNT", gets);
    expect(gets).toBeLessThanOrEqual(2);
  });
});


it("explicit verification refreshes the actual outer access cache, not only the island client", async () => {
  reviewLinkReplies = [CODE_REQUIRED, READY];
  vi.stubGlobal("fetch",fetchMock);
  const outer = new QueryClient({defaultOptions:{queries:{retry:false}}});
  outer.setQueryData(["referrer-access",null],ACCESS_REQUIRED);
  const invalidation=vi.spyOn(outer,"invalidateQueries");
  render(<QueryClientProvider client={outer}><EmailReviewAction/></QueryClientProvider>);
  await screen.findByLabelText("Work email");
  await stepUpFlow();
  await screen.findByText("Choose your decision.");
  expect(invalidation).toHaveBeenCalledWith({queryKey:["referrer-access",null]});
  expect(outer.getQueryState(["referrer-access",null])?.isInvalidated).toBe(true);
});
