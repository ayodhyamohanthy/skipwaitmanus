// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TalentDiscovery from "../client/src/pages/TalentDiscovery";
import "../client/src/pages/goal/employer-talent/GoalEmployerTalent";

vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement("a", { href }, children),
  useLocation: () => ["/employer/talent", vi.fn()],
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("talent discovery client privacy", () => {
  it("keys every real route action by encoded displayRef, never a supplied userId", async () => {
    const ref = "tal_synthetic/opaque?ref";
    const endpoint = `/api/employer/talent/${encodeURIComponent(ref)}`;
    const requests: Array<{ method: string; url: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input), method = init?.method ?? "GET";
      requests.push({ method, url });
      const body = url === "/api/employer/talent"
        ? { talent: [{ displayRef: ref, userId: 777, headline: "Synthetic engineer", skills: ["Go"], isUnlocked: false, name: "Hidden Synthetic Identity", email: "hidden@synthetic.example" }] }
        : url === "/api/employer/account" ? { account: { credits: 20 } }
        : url === `${endpoint}/unlock` ? { unlocked: true, remaining: 15 }
        : url === endpoint ? { profile: { experience: "6-10 years", expertise: ["Go"] } }
        : url === `${endpoint}/intro` ? { requested: true }
        : { error: "Unexpected synthetic request" };
      return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => body };
    }));
    const { container } = render(React.createElement(TalentDiscovery));
    const row = within(await screen.findByRole("listitem", { name: ref }));
    expect(row.getByText("Locked", { exact: true })).toBeTruthy();
    fireEvent.click(row.getByRole("button", { name: "Unlock profile · costs 5", exact: true }));
    fireEvent.click(await row.findByRole("button", { name: "View profile", exact: true }));
    expect(await row.findByRole("group", { name: "Shared profile", exact: true })).toBeTruthy();
    fireEvent.click(row.getByRole("button", { name: "Send intro request", exact: true }));
    expect(await row.findByRole("button", { name: "Intro sent", exact: true })).toBeTruthy();
    expect(requests.filter(request => !["/api/employer/talent", "/api/employer/account"].includes(request.url))).toEqual([
      { method: "POST", url: `${endpoint}/unlock` },
      { method: "GET", url: endpoint },
      { method: "POST", url: `${endpoint}/intro` },
    ]);
    expect(container.textContent).not.toContain("Hidden Synthetic Identity");
    expect(container.textContent).not.toContain("hidden@synthetic.example");
  });
});
