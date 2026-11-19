// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountMenu } from "./AccountMenu";

const signOut = vi.fn().mockResolvedValue(undefined);
const getToken = vi.fn().mockResolvedValue("t");
// workEmailOnSession: the sign-in account itself carries a company address. It never decides the referrer links.
const authUser = vi.hoisted(() => ({ imageUrl: "https://images.example.test/avery.png" as string | null, workEmailOnSession: false }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "12", getToken, signOut }),
  useUser: () => ({ user: authUser.imageUrl ? { imageUrl: authUser.imageUrl, emailAddresses: authUser.workEmailOnSession ? [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] : [{ emailAddress: "avery@gmail.com", verification: { status: "verified" } }] } : null }),
}));

// The server's verified-referrer verdict (GET /api/company-referrals/access) decides the referrer links.
const ACCESS_PATH = "/api/company-referrals/access";
const VERIFIED = { status: 200, body: { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" } };
const UNVERIFIED = { status: 200, body: { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null } };
let accessReply: { status: number; body: unknown };
const fetchMock = vi.fn(async (url: string) => {
  const reply = String(url) === ACCESS_PATH ? accessReply : { status: 200, body: { notifications: [] } };
  return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
});
const accessCalls = () => fetchMock.mock.calls.filter(([url]) => String(url) === ACCESS_PATH).length;

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><AccountMenu /></QueryClientProvider>);
}

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
}

/** Opens the menu and waits until the verdict has been answered and rendered. */
async function openMenuAndSettle() {
  openMenu();
  await screen.findByRole("menuitem", { name: "Settings" });
  await waitFor(() => expect(accessCalls()).toBeGreaterThan(0));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}

describe("AccountMenu", () => {
  beforeEach(() => { accessReply = UNVERIFIED; fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); signOut.mockReset(); signOut.mockResolvedValue(undefined); localStorage.clear(); sessionStorage.clear(); authUser.imageUrl = "https://images.example.test/avery.png"; authUser.workEmailOnSession = false; window.history.replaceState({}, "", "/"); });

  it("uses the signed-in profile image as the compact menu trigger", () => {
    renderMenu();
    const image = screen.getByRole("button", { name: "Account menu" }).querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://images.example.test/avery.png");
  });

  it("falls back to the compact user icon when the signed-in profile has no image", () => {
    authUser.imageUrl = null;
    renderMenu();
    expect(screen.getByRole("button", { name: "Account menu" }).querySelector("img")).toBeNull();
  });

  it("opens Settings and keeps My Company Inbox and My impact hidden when the server says not verified", async () => {
    renderMenu();
    await openMenuAndSettle();
    expect(screen.queryByRole("menuitem", { name: "My Company Inbox" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "My impact" })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(window.location.pathname).toBe("/settings");
  });

  it("routes My requests and Internal openings from the profile menu", async () => {
    renderMenu();
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "My requests" }));
    expect(window.location.pathname).toBe("/requests");
  });

  it("routes Internal openings to the employee-shared wall from the profile menu", async () => {
    renderMenu();
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Internal openings" }));
    expect(window.location.pathname).toBe("/wall");
  });

  it("shows My Company Inbox and My impact for a Google sign-in whose work email the server verified by code (D-019)", async () => {
    accessReply = VERIFIED;
    renderMenu();
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "My Company Inbox" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("menuitem", { name: "My impact" }));
    await waitFor(() => expect(window.location.pathname).toBe("/referrer/impact"));
  });

  it("opens the company inbox from My Company Inbox for a server-verified referrer", async () => {
    accessReply = VERIFIED;
    renderMenu();
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "My Company Inbox" }));
    await waitFor(() => expect(window.location.pathname).toBe("/inbox"));
  });

  it("does not trust a company address on the sign-in account when the server says not verified", async () => {
    authUser.workEmailOnSession = true;
    renderMenu();
    await openMenuAndSettle();
    expect(screen.queryByRole("menuitem", { name: "My Company Inbox" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "My impact" })).toBeNull();
  });

  it("keeps the referrer links hidden when the verification check fails, and the rest of the menu works", async () => {
    accessReply = { status: 500, body: { error: "We could not check your company-email access" } };
    renderMenu();
    await openMenuAndSettle();
    expect(screen.queryByRole("menuitem", { name: "My Company Inbox" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(window.location.pathname).toBe("/settings");
  });

  it("checks the verdict only when the menu opens, not on every page that shows the menu", async () => {
    accessReply = VERIFIED;
    renderMenu();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(accessCalls()).toBe(0);
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "My impact" })).toBeTruthy();
    expect(accessCalls()).toBe(1);
  });

  it("signs out from the menu for a server-verified referrer", async () => {
    accessReply = VERIFIED;
    renderMenu();
    openMenu();
    await screen.findByRole("menuitem", { name: "My Company Inbox" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(()=>expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("clears private browser data before sign-out and keeps it cleared on rejection", async () => {
    localStorage.setItem("bridge-company-confirmation","private"); localStorage.setItem("bridge-target-compensation","private"); localStorage.setItem("theme","dark"); sessionStorage.setItem("skipwait.pending-chargebee-checkout","private");
    signOut.mockRejectedValueOnce(new Error("network")); renderMenu(); openMenu(); fireEvent.click(await screen.findByRole("menuitem",{name:"Sign out"}));
    await waitFor(()=>expect(signOut).toHaveBeenCalledTimes(1)); expect(localStorage.getItem("bridge-company-confirmation")).toBeNull(); expect(localStorage.getItem("bridge-target-compensation")).toBeNull(); expect(sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull(); expect(localStorage.getItem("theme")).toBe("dark"); expect((await screen.findByRole("alert")).textContent).toContain("Sign out failed. Try again.");
  });
});
