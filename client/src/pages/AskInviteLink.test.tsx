// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AskInviteLink from "./AskInviteLink";
import { ASK_INVITE_STATE_COPY, type AskInviteLanding } from "@shared/askInvites";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { AskInviteApiError } from "@/components/requests/askInviteApi";

const TOKEN = "K".repeat(43);
const { auth, flags, route, api, access } = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false },
  flags: { byor: true },
  route: { token: "K".repeat(43) },
  api: { fetch: vi.fn(), claim: vi.fn() },
  access: { fetch: vi.fn() },
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, getToken: async () => auth.isSignedIn ? "test-token" : null }) }));
vi.mock("@/lib/flags", () => ({ get BYOR_LINK() { return flags.byor; }, COMPANY_RESPONSE_SIGNAL: false }));
vi.mock("wouter", () => ({ useRoute: () => [true, { token: route.token }] }));
vi.mock("@/components/requests/askInviteApi", () => ({
  AskInviteApiError: class extends Error { constructor(readonly status: number, readonly code: string) { super("Invite API failure"); } },
  fetchAskInviteLanding: (...args: unknown[]) => api.fetch(...args),
  claimAskInvite: (...args: unknown[]) => api.claim(...args),
}));
vi.mock("@/components/referrer-home/referrerData", () => ({ fetchCompanyAccess: (...args: unknown[]) => access.fetch(...args) }));
vi.mock("@/components/goal/GoalWorkEmailStepUp", async () => {
  const { useQueryClient } = await import("@tanstack/react-query");
  return {
    GoalWorkEmailStepUp: ({ access: value }: { access: { domain: string } }) => {
      const client = useQueryClient();
      return <button onClick={() => { void client.invalidateQueries(); }}>Confirm {value.domain}</button>;
    },
  };
});

const openLanding: AskInviteLanding = { state: "open", companyName: "Acme", roleTitle: "Product Designer", jobFunction: "Design", workMode: "Hybrid", location: "Mumbai", note: null, lockedFileCount: null };
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AskInviteLink /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  auth.isLoaded = true;
  auth.isSignedIn = false;
  flags.byor = true;
  route.token = TOKEN;
  api.fetch.mockReset();
  api.claim.mockReset();
  access.fetch.mockReset();
});

describe("/r/:token BYOR landing", () => {
  it("shows only public company and role facts to a signed-out visitor and uses work-email sign-in", async () => {
    api.fetch.mockResolvedValue(openLanding);
    auth.isSignedIn = false;
    renderPage();
    expect(await screen.findByRole("heading", { name: "Product Designer" })).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.queryByText(/private note/i)).toBeNull();
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(document.body.textContent).toMatch(/referral/i);
    expect(document.body.textContent).not.toMatch(/\bask\b/i);
    const signIn = screen.getByRole("link", { name: "Use your company email" });
    expect(signIn.getAttribute("href")).toBe(referrerSignInHref(`/r/${TOKEN}`));
    expect(signIn.getAttribute("href")).toContain("intent=referrer");
  });

  it("shows note and locked-file count only when the server returns verified-company fields", async () => {
    api.fetch.mockResolvedValue({ ...openLanding, note: "I have shipped design systems at scale.", lockedFileCount: 2 });
    auth.isSignedIn = true;
    renderPage();
    expect(await screen.findByText("I have shipped design systems at scale.")).toBeTruthy();
    expect(screen.getByText(/2 files stay locked until you accept/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Take this referral request" })).toBeTruthy();
  });

  it("sets and cleans up runtime noindex metadata", async () => {
    api.fetch.mockResolvedValue(openLanding);
    const page = renderPage();
    await screen.findByRole("heading", { name: "Product Designer" });
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,nofollow");
    page.unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("renders unavailable without an API call when the client flag is off", async () => {
    flags.byor = false;
    renderPage();
    expect(screen.getByText(ASK_INVITE_STATE_COPY.unavailable)).toBeTruthy();
    expect(api.fetch).not.toHaveBeenCalled();
    expect(api.claim).not.toHaveBeenCalled();
  });

  it.each(["used", "expired", "revoked", "closed", "unavailable"] as const)("shows only the neutral %s state sentence", async state => {
    api.fetch.mockResolvedValue({ ...openLanding, state, note: "Do not show me", lockedFileCount: 3 });
    renderPage();
    expect((await screen.findByRole("status")).textContent).toContain(ASK_INVITE_STATE_COPY[state]);
    expect(screen.queryByText("Acme")).toBeNull();
    expect(screen.queryByText("Do not show me")).toBeNull();
    expect(document.body.textContent).toMatch(/referral/i);
    expect(document.body.textContent).not.toMatch(/\bask\b/i);
  });

  it.each([
    ["delivered", "You have this referral request. It is now in your company inbox."],
    ["held", "This referral request is held for you. No credit was available, so it has not been delivered yet."],
    ["reserved", "This referral request is reserved for you and will be delivered when you have room."],
  ] as const)("reports the real %s claim outcome", async (outcome, copy) => {
    api.fetch.mockResolvedValue({ ...openLanding, note: null, lockedFileCount: 0 });
    api.claim.mockResolvedValue(outcome);
    auth.isSignedIn = true;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take this referral request" }));
    expect((await screen.findByRole("status")).textContent).toContain(copy);
    expect(document.body.textContent).toMatch(/referral/i);
    expect(document.body.textContent).not.toMatch(/\bask\b/i);
    expect(api.claim).toHaveBeenCalledWith(TOKEN, expect.any(Function));
  });

  it("offers referrer work-email sign-in when claim requires a verified company email", async () => {
    api.fetch.mockResolvedValue({ ...openLanding, lockedFileCount: 0 });
    api.claim.mockRejectedValue(new AskInviteApiError(403, "company_email_required"));
    auth.isSignedIn = true;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take this referral request" }));
    expect(await screen.findByText(/Use a verified work email at Acme/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/referral/i);
    expect(document.body.textContent).not.toMatch(/\bask\b/i);
    expect(screen.getByRole("link", { name: "Sign in with your work email" }).getAttribute("href")).toBe(referrerSignInHref(`/r/${TOKEN}`));
  });

  it.each([
    [409, "link_used", "used"],
    [404, "not_available", "unavailable"],
  ] as const)("maps claim status %s to the neutral %s copy", async (status, code, state) => {
    api.fetch.mockResolvedValue({ ...openLanding, lockedFileCount: 0 });
    api.claim.mockRejectedValue(new AskInviteApiError(status, code));
    auth.isSignedIn = true;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take this referral request" }));
    expect((await screen.findByRole("status")).textContent).toContain(ASK_INVITE_STATE_COPY[state]);
    expect(document.body.textContent).toMatch(/referral/i);
    expect(document.body.textContent).not.toMatch(/\bask\b/i);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("shows the claimer-only reservation message without offering another claim", async () => {
    api.fetch.mockResolvedValue({ ...openLanding, state: "claimed_by_you", note: null, lockedFileCount: 1 });
    auth.isSignedIn = true;
    renderPage();
    expect(await screen.findAllByText("You have this referral request. Finish it when you are ready.")).toHaveLength(1);
    expect(document.body.textContent).toMatch(/referral/i);
    expect(document.body.textContent).not.toMatch(/\bask\b/i);
    expect(screen.queryByRole("button", { name: "Take this referral request" })).toBeNull();
  });

  // D-057 (§0b.8b): a personal-login session that verified its work email must confirm
  // it in place and retry the same claim for the same account, never the standalone
  // code sign-in (that would make another account).
  it("confirms the work email in place when the claim needs a code, then retries the same claim", async () => {
    api.fetch.mockResolvedValue({ ...openLanding, lockedFileCount: 0 });
    api.claim.mockRejectedValueOnce(new AskInviteApiError(403, "work_email_code_required")).mockResolvedValueOnce("delivered");
    access.fetch.mockResolvedValue({ verified: true, domain: "acme.com", companyName: "Acme", companyInitials: "A", codeRequired: true });
    auth.isSignedIn = true;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take this referral request" }));
    expect(await screen.findByRole("button", { name: "Confirm acme.com" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in with your work email" })).toBeNull();

    access.fetch.mockResolvedValue({ verified: true, domain: "acme.com", companyName: "Acme", companyInitials: "A", codeRequired: false });
    fireEvent.click(screen.getByRole("button", { name: "Confirm acme.com" }));
    expect((await screen.findByRole("status")).textContent).toContain("You have this referral request. It is now in your company inbox.");
    expect(api.claim).toHaveBeenCalledTimes(2);
  });

  it("says the link needs a verified work email when the access verdict is not verified", async () => {
    api.fetch.mockResolvedValue({ ...openLanding, lockedFileCount: 0 });
    api.claim.mockRejectedValue(new AskInviteApiError(403, "work_email_code_required"));
    access.fetch.mockResolvedValue({ verified: false, domain: "acme.com", companyName: "Acme", companyInitials: "A", codeRequired: true });
    auth.isSignedIn = true;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take this referral request" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("This link needs a verified work email at Acme.");
    expect(screen.queryByRole("link", { name: "Sign in with your work email" })).toBeNull();
  });
});
