// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Profile from "./Profile";
import Work from "./Work";
import PublicProfile from "./PublicProfile";

const { authState, go, route } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn(), route: { handle: "asha-r" } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/profile", go],
  useRoute: () => [true, route],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

describe("Profile page", () => {
  it("loads, saves, and surfaces handle conflicts honestly", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/profile/me") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        if (body.handle === "taken-handle") return { ok: false, status: 400, json: async () => ({ error: "That handle is already taken" }) };
        return ok({ displayName: "Asha R.", profile: { headline: "Designer", currentTitle: null, location: null, bio: null, skills: null, company: null, workEmailDomain: "wipro.com", workEmailVerifiedAt: "2026-01-01", handle: "asha-r", profileVisibility: "link" } });
      }
      return ok({ displayName: "Asha R.", profile: { headline: "Designer", currentTitle: null, location: null, bio: null, skills: null, company: null, workEmailDomain: "wipro.com", workEmailVerifiedAt: "2026-01-01", handle: "asha-r", profileVisibility: "link" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Profile />);
    expect(await screen.findByDisplayValue("Designer")).toBeTruthy();
    expect(screen.getByText("Verified at wipro.com")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("yourname"), { target: { value: "taken-handle" } });
    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));
    expect(await screen.findByText("That handle is already taken")).toBeTruthy();
  });

  it("keeps the profile behind sign-in", () => {
    authState.isSignedIn = false;
    render(<Profile />);
    expect(screen.getByText(/Profile & privacy/)).toBeTruthy();
  });
});

describe("Work showcase", () => {
  it("adds, pins, and deletes items through the work API", async () => {
    type Row = { id: number; title: string; kind: string; source: string | null; url: string | null; pinned: boolean; visibleOnProfile: boolean };
    let items: Row[] = [{ id: 3, title: "Redesign", kind: "case_study", source: "Behance", url: null, pinned: false, visibleOnProfile: false }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/work-items") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const item = { id: 9, title: body.title, kind: "project", source: null, url: null, pinned: false, visibleOnProfile: false };
        items = [item, ...items];
        return { ok: true, json: async () => ({ item }) };
      }
      if (/\/work-items\/\d+$/.test(String(url)) && init?.method === "PATCH") {
        const id = Number(String(url).split("/").pop());
        items = items.map(item => item.id === id ? { ...item, ...JSON.parse(String(init.body)) } : item);
        return { ok: true, json: async () => ({ item: items.find(item => item.id === id) }) };
      }
      if (/\/work-items\/\d+$/.test(String(url)) && init?.method === "DELETE") {
        const id = Number(String(url).split("/").pop());
        items = items.filter(item => item.id !== id);
        return { ok: true, json: async () => ({ deleted: true }) };
      }
      return ok({ items });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Work />);
    expect(await screen.findByText("Redesign")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add work" }));
    fireEvent.change(screen.getByPlaceholderText("Enterprise approvals redesign"), { target: { value: "Launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save work" }));
    expect(await screen.findByText("Launch")).toBeTruthy();
    const launchCard = screen.getByText("Launch").closest("article") as HTMLElement;
    fireEvent.click(within(launchCard).getByRole("button", { name: "Pin" }));
    expect(await screen.findByText("1 pinned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete Launch" }));
    await waitFor(() => expect(screen.queryByText("Launch")).toBeNull());
  });
});

describe("PublicProfile page", () => {
  it("renders a link-only profile with work and noindex behavior, never fabricated people", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ profile: { visible: true, visibility: "link", isOwner: false, displayName: "Asha R.", headline: "Senior Product Designer", currentTitle: null, location: "Bengaluru", bio: null, skills: null, verifiedWork: { domain: "wipro.com", verifiedAt: "2026-01-01" }, handle: "asha-r", workItems: [{ id: 3, title: "Redesign", kind: "case_study", source: "Behance", url: null, pinned: true, visibleOnProfile: true }] } })));
    render(<PublicProfile />);
    expect(await screen.findByText("Asha R.")).toBeTruthy();
    expect(screen.getByText("Verified at wipro.com via work email")).toBeTruthy();
    expect(screen.getByText("Redesign")).toBeTruthy();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
    expect(screen.queryByText("Rahul")).toBeNull();
  });

  it("shows the private gate to visitors with no leaked content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ profile: { visible: false, visibility: "private" } })));
    render(<PublicProfile />);
    expect(await screen.findByText("This profile is private.")).toBeTruthy();
  });
});
