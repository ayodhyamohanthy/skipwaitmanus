// @vitest-environment jsdom
// D-057-session-gate (§0b.6, §0b.7 item 8; red first): a Google-first referrer
// on /queue sees the in-session work-email step-up in place, never the code
// sign-in, and the queue opens for the same account after the code.
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
const VERIFIED: Reply = { status: 200, body: { verifiedCompanyAccess: true, workEmailDomain: "skipwait.me", companyName: "skipwait.me", companyInitials: "SW" } };
const UNVERIFIED: Reply = { status: 200, body: { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null } };
const ASK = { id: 13, publicRef: "R-T13ST", targetRoleUrl: null, companyDomain: "skipwait.me", companyName: "skipwait.me", companyInitials: "SW", status: "pending", savedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attachmentCount: 1, isClaimedByYou: false, unreadMessageCount: 0 };

let accessReplies: Reply[];
let newRows: unknown[];
let networkDown = false;
let inboxRefusal = false;
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (networkDown) throw new TypeError("Failed to fetch");
  if (url.endsWith("/api/referrer/step-up/send")) return { ok: true, status: 200, json: async () => ({ sent: true, challengeId: "c".repeat(43), expiresAt: "2026-10-30T10:10:00.000Z" }) };
  if (url.endsWith("/api/referrer/step-up/verify")) return { ok: true, status: 200, json: async () => ({ verified: true, expiresAt: "2026-10-30T22:00:00.000Z" }) };
  if (url.includes("/api/company-referrals/inbox") && inboxRefusal) return { ok: false, status: 403, json: async () => ({ error: "Confirm your work email with a code to continue.", code: "work_email_code_required" }) };
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

beforeEach(() => { inboxRefusal = false; session.email = "qa-sweep-2@gmail.com"; newRows = [ASK]; networkDown = false; fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CODE_REQUIRED: Reply = { status: 200, body: { verifiedCompanyAccess: true, workEmailDomain: "skipwait.me", companyName: "skipwait.me", companyInitials: "SW", codeRequired: true } };

describe("/queue in a personal-login session", () => {
  it("shows the step-up in place, not the queue and never the code sign-in", async () => {
    accessReplies = [CODE_REQUIRED];
    renderQueue();
    expect(await screen.findByText("Confirm you still work at skipwait.me with a code to your work email.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Private ask/ })).toBeNull();
    expect(screen.queryByText("Verify your work email.")).toBeNull();
    expect(document.querySelector('a[href="/sign-in"], a[href*="/api/auth/otp"]')).toBeNull();
    expect(inboxCalls()).toBe(0);
  });

  it("opens the same queue after the code is confirmed", async () => {
    accessReplies = [CODE_REQUIRED, VERIFIED];
    renderQueue();
    fireEvent.change(await screen.findByLabelText("Work email"), { target: { value: "ref@skipwait.me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("button", { name: /Private ask/ })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/auth/otp"))).toBe(false);
  });

  it("flips to the step-up when a queue read is refused with work_email_code_required", async () => {
    accessReplies = [VERIFIED, CODE_REQUIRED];
    inboxRefusal = true;
    renderQueue();
    expect(await screen.findByText("Confirm you still work at skipwait.me with a code to your work email.")).toBeTruthy();
  });
});
