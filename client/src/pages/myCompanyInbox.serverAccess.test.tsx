// @vitest-environment jsdom
// D-019 basics regression (BUGFREE_GATE §7, Oct 14): a verified referrer whose
// sign-in account is Google SSO (personal Gmail) and whose work email was
// verified by one-time code saw the "Verify your work email" gate on /queue
// while /referrer-home said "Verified" and the inbox API served the queue.
// The queue now gates only on the server's verdict (shared/referrerAccess.ts).
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { session } = vi.hoisted(() => ({ session: { email: "qa-sweep-2@gmail.com" } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, userId: "12", getToken: vi.fn().mockResolvedValue("t") }),
  // The sign-in account only knows its SSO address; the company address was enrolled by code.
  useUser: () => ({ user: { id: "12", emailAddresses: [{ emailAddress: session.email, verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/queue", vi.fn()],
  useSearch: () => "",
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

type Reply = { status: number; body: unknown } | "hang";
const VERIFIED: Reply = { status: 200, body: { verifiedCompanyAccess: true, workEmailDomain: "skipwait.me", companyName: "SkipWait", companyInitials: "SW" } };
const UNVERIFIED: Reply = { status: 200, body: { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null } };
const ASK = { id: 13, targetRoleUrl: null, companyDomain: "skipwait.me", companyName: "SkipWait", companyInitials: "SW", status: "pending", savedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attachmentCount: 1, isClaimedByYou: false, unreadMessageCount: 0 };

let accessReplies: Reply[];
let newRows: unknown[];
let networkDown = false;
const fetchMock = vi.fn(async (url: string) => {
  if (networkDown) throw new TypeError("Failed to fetch");
  if (url.endsWith("/api/company-referrals/access")) {
    const reply = accessReplies.length > 1 ? accessReplies.shift() : accessReplies[0];
    if (!reply || reply === "hang") return new Promise<never>(() => undefined);
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  }
  return { ok: true, status: 200, json: async () => (url.includes("scope=new") ? { requests: newRows } : { requests: [] }) };
});
const inboxCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/company-referrals/inbox")).length;
const accessCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/company-referrals/access")).length;
const renderQueue = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MyCompanyInbox /></QueryClientProvider>);

beforeEach(() => { session.email = "qa-sweep-2@gmail.com"; newRows = [ASK]; networkDown = false; fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("queue gate follows the server's verified-referrer verdict", () => {
  it("opens the queue for a Google SSO account whose work email was verified by code (the QA case)", async () => {
    accessReplies = [VERIFIED];
    renderQueue();
    expect(await screen.findByRole("article", { name: "Private request Ref-1013" })).toBeTruthy();
    expect(screen.queryByText("Verify your work email.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add work email" })).toBeNull();
    expect(document.querySelector('[data-skipwait-screen="company-inbox"]')).toBeTruthy();
  });

  it("opens the empty queue's capacity panel for a verified referrer with nothing waiting", async () => {
    accessReplies = [VERIFIED];
    newRows = [];
    renderQueue();
    await waitFor(() => expect(document.querySelector('[aria-label="Open referral capacity"]')).toBeTruthy());
    expect(screen.queryByText("Verify your work email.")).toBeNull();
  });

  it("still shows the verify gate when the server says the account is not verified", async () => {
    accessReplies = [UNVERIFIED];
    renderQueue();
    expect(await screen.findByText("Verify your work email.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add work email" })).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
    // The private queue is requested only once the server confirms the verification.
    expect(inboxCalls()).toBe(0);
  });

  it("does not trust a company address on the sign-in account when the server says not verified", async () => {
    session.email = "employee@skipwait.me";
    accessReplies = [UNVERIFIED];
    renderQueue();
    expect(await screen.findByText("Verify your work email.")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
    expect(accessCalls()).toBe(1);
  });

  it("shows a checking state, never the gate, while the verification check is in flight", async () => {
    accessReplies = ["hang"];
    renderQueue();
    expect(await screen.findByText("Checking your verification.")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-screen="company-inbox-checking"] [aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText("Verify your work email.")).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("shows a retryable error, never the gate, when the verification check fails, then opens the queue on retry", async () => {
    accessReplies = [{ status: 500, body: { error: "We could not check your company-email access" } }, { status: 500, body: { error: "We could not check your company-email access" } }, VERIFIED];
    renderQueue();
    expect(await screen.findByText("We couldn’t check your verification", undefined, { timeout: 4000 })).toBeTruthy();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("We could not check your company-email access");
    // The check failed, so the page cannot know the account's state: no claim about a verification.
    expect(alert.textContent).toContain("Nothing changed on your account. Try again in a moment.");
    expect(alert.textContent).not.toMatch(/your verification and/i);
    expect(screen.queryByText("Verify your work email.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article", { name: "Private request Ref-1013" })).toBeTruthy();
    expect(screen.queryByText("We couldn’t check your verification")).toBeNull();
  });

  it("opens the queue after a single Try again when a dropped network failed the verification check and the queue", async () => {
    networkDown = true;
    accessReplies = [VERIFIED];
    renderQueue();
    expect(await screen.findByText("We couldn’t check your verification", undefined, { timeout: 4000 })).toBeTruthy();
    networkDown = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article", { name: "Private request Ref-1013" })).toBeTruthy();
    expect(screen.queryByText("We couldn’t load your queue")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a malformed verification reply as an error, not as unverified", async () => {
    accessReplies = [{ status: 200, body: { requests: [] } }];
    renderQueue();
    expect(await screen.findByText("We couldn’t check your verification", undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText("Verify your work email.")).toBeNull();
  });
});
