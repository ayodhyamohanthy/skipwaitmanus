// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Approve from "./Approve";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/approve", go],
}));

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const ASK_APPROVAL = {
  id: 5, kind: "ask_send", status: "pending", provider: "ChatGPT",
  companyDomain: "wipro.com", role: "Senior Product Designer",
  note: "Hi — I'd love a referral for the Senior Product Designer role.",
  creditCount: null, slotCount: 3,
  createdAt: new Date(now - 60000).toISOString(),
  expiresAt: new Date(now + DAY).toISOString(),
};
const SPEND_APPROVAL = {
  id: 6, kind: "credit_spend", status: "pending", provider: "ChatGPT",
  companyDomain: "wipro.com", role: "Ask One-Pager",
  note: null, creditCount: 3, slotCount: null,
  createdAt: new Date(now - 60000).toISOString(),
  expiresAt: new Date(now + DAY).toISOString(),
};
const CREDITS = { summary: { plan: "max", totalAvailable: 112, monthlyCreditsRemaining: 112, monthlyAllowance: 112 } };

function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init)));
}

beforeEach(() => { authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Approve page", () => {
  it("shows a pending ask with edit, decline and send", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/assistants/approvals")) return { ok: true, json: async () => ({ approvals: [ASK_APPROVAL] }) };
      if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => CREDITS };
      if (init?.method === "POST" && String(url).includes("/decision")) return { ok: true, json: async () => ({ approval: { id: 5, status: "approved" } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Approve />);
    expect(await screen.findByText("Send this ask to wipro.com?")).toBeTruthy();
    expect(screen.getByText("Senior Product Designer · uses 1 of your 3 open slots")).toBeTruthy();
    expect(screen.getByText("Hi — I'd love a referral for the Senior Product Designer role.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Done")).toBeTruthy();
    const decisionCall = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/decision") && init?.method === "POST");
    expect(decisionCall).toBeTruthy();
    expect(JSON.parse(String(decisionCall?.[1]?.body ?? "{}"))).toEqual({ decision: "approved", kind: "ask_send" });
    expect(screen.getByRole("link", { name: "Open requests" }).getAttribute("href")).toBe("/requests");
  });

  it("does not claim checks, labels or notifications the product does not have", async () => {
    stubFetch(url => (String(url).includes("/api/assistants/approvals") ? { ok: true, json: async () => ({ approvals: [ASK_APPROVAL] }) } : { ok: true, json: async () => CREDITS }));
    render(<Approve />);
    expect(await screen.findByText("Send this ask to wipro.com?")).toBeTruthy();
    expect(screen.queryByText(/Quality check passed/)).toBeNull();
    expect(screen.queryByText(/Sent with/)).toBeNull();
    expect(screen.queryByText(/push notification/)).toBeNull();
    expect(screen.getByText("Unanswered approvals expire after 24 hours.")).toBeTruthy();
  });

  it("shows the credit cost of an assistant-proposed ask", async () => {
    const proposed = { ...ASK_APPROVAL, provider: "assistant", role: null, note: null, creditCount: 1, slotCount: null };
    stubFetch(url => (String(url).includes("/api/assistants/approvals") ? { ok: true, json: async () => ({ approvals: [proposed] }) } : { ok: true, json: async () => CREDITS }));
    render(<Approve />);
    expect(await screen.findByText("uses 1 of your open slots · 1 credit")).toBeTruthy();
    expect(screen.getByText(/Your assistant · 1 minute ago · 23 h left/)).toBeTruthy();
    expect(screen.getByText("No note yet. Tap Edit to add one.")).toBeTruthy();
  });

  it("keeps the approval on screen with the reason when a decision fails", async () => {
    stubFetch((url, init) => {
      if (init?.method === "POST") return { ok: false, json: async () => ({ error: "This approval expired" }) };
      if (String(url).includes("/api/assistants/approvals")) return { ok: true, json: async () => ({ approvals: [ASK_APPROVAL] }) };
      return { ok: true, json: async () => CREDITS };
    });
    render(<Approve />);
    fireEvent.click(await screen.findByRole("button", { name: "Send" }));
    expect(await screen.findByText("This approval expired")).toBeTruthy();
    expect(screen.getByText("Send this ask to wipro.com?")).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("offers a retry when approvals fail to load", async () => {
    stubFetch(() => ({ ok: false, json: async () => ({ error: "We could not load your approvals" }) }));
    render(<Approve />);
    expect(await screen.findByText("We could not load your approvals")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("edits the note before sending", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/assistants/approvals") && !init?.method) return { ok: true, json: async () => ({ approvals: [ASK_APPROVAL] }) };
      if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => CREDITS };
      if (init?.method === "PATCH") return { ok: true, json: async () => ({ approval: { id: 5, note: "Edited note" } }) };
      if (init?.method === "POST") return { ok: true, json: async () => ({ approval: { id: 5, status: "approved" } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Approve />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Edited note" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/assistants/approvals/5", expect.objectContaining({ method: "PATCH" })));
  });

  it("shows the slots-full state and keeps the draft", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/assistants/approvals")) return { ok: true, json: async () => ({ approvals: [{ ...ASK_APPROVAL, slotCount: 0 }] }) };
      if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => CREDITS };
      if (init?.method === "POST") return { ok: true, json: async () => ({ approval: { id: 5, status: "declined" } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Approve />);
    expect(await screen.findByText("All your slots are in use")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep as draft" }));
    expect(await screen.findByText("Declined")).toBeTruthy();
  });

  it("prices a credit spend from the real balance", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/assistants/approvals")) return { ok: true, json: async () => ({ approvals: [SPEND_APPROVAL] }) };
      if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => CREDITS };
      if (init?.method === "POST") return { ok: true, json: async () => ({ approval: { id: 6, status: "approved" } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Approve />);
    expect(await screen.findByText("Run this paid tool?")).toBeTruthy();
    expect(screen.getByText("You have 112 · 109 after this")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use 3 credits" }));
    expect(await screen.findByText("Done")).toBeTruthy();
  });

  it("shows an honest empty state", async () => {
    stubFetch(url => (String(url).includes("/api/assistants/approvals") ? { ok: true, json: async () => ({ approvals: [] }) } : { ok: true, json: async () => CREDITS }));
    render(<Approve />);
    expect(await screen.findByText("Nothing waiting for you")).toBeTruthy();
  });

  it("asks signed-out visitors to sign in", () => {
    authState.isSignedIn = false;
    render(<Approve />);
    expect(screen.getByText("Sign in to review approvals")).toBeTruthy();
  });
});
