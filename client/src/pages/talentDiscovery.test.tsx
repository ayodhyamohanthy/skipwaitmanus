// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TalentDiscovery from "./TalentDiscovery";

const go = vi.fn();

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/employer/talent", go] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const talent = [
  { userId: 22, displayRef: "Talent-0022", headline: "Frontend engineer", location: "Bengaluru", skills: ["react", "typescript"], isUnlocked: false },
  { userId: 33, displayRef: "Talent-0033", headline: "Backend engineer", location: "Remote", skills: ["node"], isUnlocked: true },
];

function stubFetch(overrides: { talent?: typeof talent; unlockStatus?: number; unlockBody?: Record<string, unknown>; profileBody?: Record<string, unknown> } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/employer/talent/Talent-0022/unlock" && init?.method === "POST") {
      const status = overrides.unlockStatus ?? 201;
      return { ok: status < 400, status, json: async () => overrides.unlockBody ?? { unlocked: true, remaining: 20 } };
    }
    if (/\/api\/employer\/talent\/Talent-\d+$/.test(url) && !init?.method) return { ok: true, status: 200, json: async () => overrides.profileBody ?? { profile: { displayRef: "Talent-0033", headline: "Backend engineer", location: "Remote", skills: ["node"], experience: "6 years", expertise: null } } };
    if (url.startsWith("/api/employer/talent")) return { ok: true, status: 200, json: async () => ({ talent: overrides.talent ?? talent }) };
    if (url === "/api/employer/account") return { ok: true, status: 200, json: async () => ({ account: { credits: 25 } }) };
    return { ok: true, status: 200, json: async () => ({}) };
  }));
}

beforeEach(() => { stubFetch(); });
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("TalentDiscovery", () => {
  it("renders anonymized talent cards with skills chips and locked/unlocked states", async () => {
    render(<TalentDiscovery />);
    await waitFor(() => expect(screen.getByText("Talent-0022")).toBeTruthy());
    expect(screen.getByText("Talent-0033")).toBeTruthy();
    const lockedCard = screen.getByText("Talent-0022").closest("li")!;
    expect(within(lockedCard).getByText("Locked")).toBeTruthy();
    expect(within(lockedCard).getByText("Unlock · 5 credits")).toBeTruthy();
    const unlockedCard = screen.getByText("Talent-0033").closest("li")!;
    expect(within(unlockedCard).getByText("Unlocked")).toBeTruthy();
    expect(screen.getAllByText("react").length).toBeGreaterThan(0);
  });

  it("never renders identity fields even if the server payload carried them", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/employer/talent") && !init?.method) return { ok: true, status: 200, json: async () => ({ talent: [{ ...talent[0], name: "Avery", email: "avery@example.com", resumeUrl: "https://x.test/resume.pdf" }] }) };
      return { ok: true, status: 200, json: async () => ({}) };
    }));
    const { container } = render(<TalentDiscovery />);
    await waitFor(() => expect(screen.getByText("Talent-0022")).toBeTruthy());
    expect(container.textContent).not.toContain("avery@example.com");
    expect(container.textContent).not.toContain("Avery");
  });

  it("unlocks optimistically: credits decrement and the card flips to unlocked before the response lands", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/employer/talent/Talent-0022/unlock" && init?.method === "POST") return new Promise(() => undefined); // never resolves
      if (url.startsWith("/api/employer/talent")) return { ok: true, status: 200, json: async () => ({ talent }) };
      if (url === "/api/employer/account") return { ok: true, status: 200, json: async () => ({ account: { credits: 25 } }) };
      return { ok: true, status: 200, json: async () => ({}) };
    }));
    render(<TalentDiscovery />);
    await waitFor(() => expect(screen.getByText("25")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Unlock · 5 credits" }));
    expect(screen.getByText("20")).toBeTruthy();
    expect(within(screen.getByText("Talent-0022").closest("li")!).getByText("Unlocked")).toBeTruthy();
  });

  it("routes to the billing screen when the unlock is rejected with 402", async () => {
    stubFetch({ unlockStatus: 402, unlockBody: { error: "Not enough unlock credits", credits: 2 } });
    render(<TalentDiscovery />);
    await waitFor(() => expect(screen.getByText("Talent-0022")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Unlock · 5 credits" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/employer/billing"));
  });

  it("shows the fuller profile for an unlocked row via View profile", async () => {
    render(<TalentDiscovery />);
    await waitFor(() => expect(screen.getByText("Talent-0033")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "View profile" }));
    await waitFor(() => expect(screen.getByText("Experience:")).toBeTruthy());
    expect(screen.getByText(/6 years/)).toBeTruthy();
  });

  it("shows the empty state when no opt-in talent matches", async () => {
    stubFetch({ talent: [] });
    render(<TalentDiscovery />);
    await waitFor(() => expect(screen.getByText("No opt-in talent matches yet.")).toBeTruthy());
  });
});
