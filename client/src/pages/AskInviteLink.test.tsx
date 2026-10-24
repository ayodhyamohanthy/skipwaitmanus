// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AskInviteLink from "./AskInviteLink";
import { ASK_INVITE_STATE_COPY, type AskInviteLanding } from "@shared/askInvites";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { AskInviteApiError } from "@/components/requests/askInviteApi";

const TOKEN = "K".repeat(43);
const { auth, flags, route, api } = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false },
  flags: { byor: true },
  route: { token: "K".repeat(43) },
  api: { fetch: vi.fn(), claim: vi.fn() },
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, getToken: async () => auth.isSignedIn ? "test-token" : null }) }));
vi.mock("@/lib/flags", () => ({ get BYOR_LINK() { return flags.byor; }, COMPANY_RESPONSE_SIGNAL: false }));
vi.mock("wouter", () => ({ useRoute: () => [true, { token: route.token }] }));
vi.mock("@/components/requests/askInviteApi", () => ({
  AskInviteApiError: class extends Error { constructor(readonly status: number, readonly code: string) { super("Invite API failure"); } },
  fetchAskInviteLanding: (...args: unknown[]) => api.fetch(...args),
  claimAskInvite: (...args: unknown[]) => api.claim(...args),
}));

const openLanding: AskInviteLanding = { state: "open", companyName: "Acme", roleTitle: "Product Designer", jobFunction: "Design", workMode: "Hybrid", location: "Mumbai", note: null, lockedFileCount: null };
function renderPage() { return render(<AskInviteLink />); }

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  auth.isLoaded = true;
  auth.isSignedIn = false;
  flags.byor = true;
  route.token = TOKEN;
  api.fetch.mockReset();
  api.claim.mockReset();
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
    expect(screen.getByRole("button", { name: "Take this ask" })).toBeTruthy();
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
  });

  it.each([
    ["delivered", "You have this ask. It is now in your company inbox."],
    ["held", "This ask is held for you. No credit was available, so it has not been delivered yet."],
    ["reserved", "This ask is reserved for you and will be delivered when you have room."],
  ] as const)("reports the real %s claim outcome", async (outcome, copy) => {
    api.fetch.mockResolvedValue({ ...openLanding, note: null, lockedFileCount: 0 });
    api.claim.mockResolvedValue(outcome);
    auth.isSignedIn = true;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take this ask" }));
    expect((await screen.findByRole("status")).textContent).toContain(copy);
    expect(api.claim).toHaveBeenCalledWith(TOKEN, expect.any(Function));
  });

  it("offers referrer work-email sign-in when claim requires a verified company email", async () => {
    api.fetch.mockResolvedValue({ ...openLanding, lockedFileCount: 0 });
    api.claim.mockRejectedValue(new AskInviteApiError(403, "company_email_required"));
    auth.isSignedIn = true;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Take this ask" }));
    expect(await screen.findByText(/Use a verified work email at Acme/)).toBeTruthy();
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
    fireEvent.click(await screen.findByRole("button", { name: "Take this ask" }));
    expect((await screen.findByRole("status")).textContent).toContain(ASK_INVITE_STATE_COPY[state]);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("shows the claimer-only reservation message without offering another claim", async () => {
    api.fetch.mockResolvedValue({ ...openLanding, state: "claimed_by_you", note: null, lockedFileCount: 1 });
    auth.isSignedIn = true;
    renderPage();
    expect((await screen.findByRole("status")).textContent).toContain("You have this ask. Finish it when you are ready.");
    expect(screen.queryByRole("button", { name: "Take this ask" })).toBeNull();
  });
});
