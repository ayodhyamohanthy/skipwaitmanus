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
const CREDITS = { summary: { plan: "land_focus", totalAvailable: 112, monthlyCreditsRemaining: 112, monthlyAllowance: 120 } };

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
    // Kit source line is who and when only; the 24-hour expiry is stated once, in the footnote.
    expect(screen.getByText("Your assistant · 1 minute ago")).toBeTruthy();
    expect(screen.queryByText(/h left/)).toBeNull();
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
    expect(screen.getByText("ChatGPT saved this ask as a draft. It can be sent when a request is answered or you withdraw one.")).toBeTruthy();
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
    // AYO-20 honesty fix: no wallet-after math while the server moves no
    // credits; the stated cost and the real balance still show.
    expect(screen.getByText(/You have 112 credits/)).toBeTruthy();
    expect(screen.queryByText(/after this/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
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

  describe("the cost the owner approves is the cost charged (#644)", () => {
    const PRICED = { ...ASK_APPROVAL, creditCount: 1, cost: { level: 5, cost: 5 } };
    const decisionBodies = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls
      .filter(([url, init]) => String(url).includes("/decision") && (init as RequestInit | undefined)?.method === "POST")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

    it("shows the server's current cost and sends exactly that cost with the approval", async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") return { ok: true, json: async () => ({ approval: { id: 5, status: "approved" } }) };
        if (String(url).includes("/api/assistants/approvals")) return { ok: true, json: async () => ({ approvals: [PRICED] }) };
        return { ok: true, json: async () => CREDITS };
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Approve />);
      expect(await screen.findByText("Senior Product Designer · uses 1 of your 3 open slots · 5 credits")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      expect(await screen.findByText("Done")).toBeTruthy();
      expect(decisionBodies(fetchMock)).toEqual([{ decision: "approved", kind: "ask_send", expectedCost: { level: 5, cost: 5 } }]);
    });

    it("on 409 cost_changed shows the new cost, keeps the approval, and re-approves at that cost", async () => {
      let posts = 0;
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts += 1;
          if (posts === 1) return { ok: false, status: 409, json: async () => ({ error: "This referral request now costs 6 referrals. Approve again to send it at that cost.", code: "cost_changed", cost: { level: 6, cost: 6 } }) };
          return { ok: true, json: async () => ({ approval: { id: 5, status: "approved" } }) };
        }
        if (String(url).includes("/api/assistants/approvals")) return { ok: true, json: async () => ({ approvals: [PRICED] }) };
        return { ok: true, json: async () => CREDITS };
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Approve />);
      fireEvent.click(await screen.findByRole("button", { name: "Send" }));
      expect(await screen.findByText("This referral request now costs 6 referrals. Approve again to send it at that cost.")).toBeTruthy();
      expect(screen.getByText("Senior Product Designer · uses 1 of your 3 open slots · 6 credits")).toBeTruthy();
      expect(screen.queryByText("Done")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      expect(await screen.findByText("Done")).toBeTruthy();
      expect(decisionBodies(fetchMock).map(body => body.expectedCost)).toEqual([{ level: 5, cost: 5 }, { level: 6, cost: 6 }]);
    });

    it("never sends a cost with a decline, and ignores a malformed listed cost", async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") return { ok: true, json: async () => ({ approval: { id: 5, status: "declined" } }) };
        if (String(url).includes("/api/assistants/approvals")) return { ok: true, json: async () => ({ approvals: [{ ...PRICED, cost: { level: 5, cost: "5" } }] }) };
        return { ok: true, json: async () => CREDITS };
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Approve />);
      expect(await screen.findByText("Senior Product Designer · uses 1 of your 3 open slots · 1 credit")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Decline" }));
      expect(await screen.findByText("Declined")).toBeTruthy();
      expect(decisionBodies(fetchMock)).toEqual([{ decision: "declined", kind: "ask_send" }]);
    });
  });
});
