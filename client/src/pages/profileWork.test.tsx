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

  it("saves open-to roles from the comma-separated field", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/profile/me") && init?.method === "PUT") {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return ok({ displayName: "Asha R.", profile: { headline: "", currentTitle: null, location: null, bio: null, skills: null, openTo: '["Product Designer"]', handle: "asha-r", profileVisibility: "link" } });
      }
      return ok({ displayName: "Asha R.", profile: { headline: "", currentTitle: null, location: null, bio: null, skills: null, openTo: null, handle: "asha-r", profileVisibility: "link" } });
    }));
    render(<Profile />);
    const openToInput = await screen.findByPlaceholderText("Product Designer, UX Lead, Design Systems");
    fireEvent.change(openToInput, { target: { value: "Product Designer, UX Lead" } });
    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    expect(bodies[bodies.length - 1].openTo).toEqual(["Product Designer", "UX Lead"]);
  });

  it("switches to the referrer profile with the verified company and honest privacy copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/referrer-preferences")) return ok({ preferences: { referrerVisibility: "named" } });
      return ok({ displayName: "Asha R.", profile: { headline: "Design Lead", currentTitle: null, location: null, bio: null, skills: null, openTo: null, company: null, workEmailDomain: "wipro.com", workEmailVerifiedAt: "2026-01-01", handle: "asha-r", profileVisibility: "private" } });
    }));
    render(<Profile />);
    expect(await screen.findByText("Only referrers reviewing your ask see context.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Referrer profile" }));
    expect(screen.getByRole("option", { name: "wipro.com" })).toBeTruthy();
    expect(screen.queryByText("Resume")).toBeNull();
    expect(await screen.findByText("Seekers see your name, company and function.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Referrer settings" }).getAttribute("href")).toBe("/referrer-setup");
  });

  it("never claims a public profile is undiscoverable and ships no preview scaffolding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ displayName: "Asha R.", profile: { headline: null, currentTitle: null, location: null, bio: null, skills: null, openTo: null, company: null, workEmailDomain: null, workEmailVerifiedAt: null, handle: null, profileVisibility: "public" } })));
    render(<Profile />);
    expect(await screen.findByText("Publicly discoverable")).toBeTruthy();
    expect(screen.queryByText("Not publicly discoverable")).toBeNull();
    expect(screen.queryByText(/PREVIEW ONLY/)).toBeNull();
    expect(screen.queryByRole("link", { name: /View public profile/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Referrer profile" }));
    expect(screen.getByRole("option", { name: "Select verified company" })).toBeTruthy();
  });

  it("offers a retry when the profile cannot load", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 500, json: async () => ({ error: "We could not load your profile" }) };
      return ok({ displayName: "Asha R.", profile: { headline: "Designer", currentTitle: null, location: null, bio: null, skills: null, openTo: null, company: null, workEmailDomain: null, workEmailVerifiedAt: null, handle: null, profileVisibility: "private" } });
    }));
    render(<Profile />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByDisplayValue("Designer")).toBeTruthy();
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
    fireEvent.change(screen.getByPlaceholderText("e.g. Redesigned onboarding for a fintech app"), { target: { value: "Launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish to profile" }));
    expect(await screen.findByText("Launch")).toBeTruthy();
    const launchCard = screen.getByText("Launch").closest("article") as HTMLElement;
    fireEvent.click(within(launchCard).getByRole("button", { name: "Pin" }));
    expect(await screen.findByText("1 pinned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete Launch" }));
    await waitFor(() => expect(screen.queryByText("Launch")).toBeNull());
  });

  it("previews the referrer view with only profile-visible pieces and no management controls", async () => {
    const items = [
      { id: 3, title: "Redesign", kind: "case_study", source: "Behance", url: null, pinned: true, visibleOnProfile: true },
      { id: 4, title: "Private draft", kind: "project", source: null, url: null, pinned: false, visibleOnProfile: false },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ok({ items })));
    render(<Work />);
    expect(await screen.findByText("Redesign")).toBeTruthy();
    expect(screen.getByText("Private draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "What a referrer sees" }));
    await waitFor(() => expect(screen.queryByText("Private draft")).toBeNull());
    expect(screen.getByText("Redesign")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unpin" })).toBeNull();
  });

  it("publishes privately or to the profile and switches visibility per piece", async () => {
    const posts: Array<Record<string, unknown>> = [];
    const patches: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/work-items") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(body);
        return ok({ item: { id: 7, title: body.title, kind: body.kind, source: null, url: null, pinned: false, visibleOnProfile: body.visibleOnProfile } });
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        patches.push(body);
        return ok({ item: { id: 3, title: "Redesign", kind: "case_study", source: null, url: null, pinned: false, visibleOnProfile: body.visibleOnProfile } });
      }
      if (String(url).endsWith("/profile/me")) return ok({ displayName: "Asha R.", profile: { headline: "Designer", handle: "asha-r" } });
      return ok({ items: [{ id: 3, title: "Redesign", kind: "case_study", source: null, url: null, pinned: false, visibleOnProfile: true }] });
    }));
    render(<Work />);
    expect(await screen.findByText("Redesign")).toBeTruthy();
    expect(await screen.findByText("asha-r")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add work" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish to profile" }));
    expect(await screen.findByText("Give each work item a title.")).toBeTruthy();
    expect(posts).toHaveLength(0);
    fireEvent.change(screen.getByPlaceholderText("e.g. Redesigned onboarding for a fintech app"), { target: { value: "Notes" } });
    fireEvent.click(screen.getByRole("radio", { name: "Article" }));
    fireEvent.click(screen.getByRole("button", { name: "Only me" }));
    fireEvent.click(screen.getByRole("button", { name: "Save privately" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ title: "Notes", kind: "article", visibleOnProfile: false });
    const card = (await screen.findByText("Redesign")).closest("article") as HTMLElement;
    fireEvent.change(within(card).getByRole("combobox", { name: "Who can see this" }), { target: { value: "hidden" } });
    await waitFor(() => expect(patches).toEqual([{ visibleOnProfile: false }]));
    expect(screen.queryByText(/Import from other platforms/)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW/)).toBeNull();
  });

  it("shows a retry when work cannot load", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/profile/me")) return ok({ displayName: "Asha R.", profile: null });
      calls += 1;
      if (calls === 1) return { ok: false, status: 500, json: async () => ({ error: "We could not load your work" }) };
      return ok({ items: [{ id: 3, title: "Redesign", kind: "case_study", source: null, url: null, pinned: false, visibleOnProfile: true }] });
    }));
    render(<Work />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Redesign")).toBeTruthy();
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

  it("renders open-to chips from the public profile", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ profile: { visible: true, visibility: "public", isOwner: false, displayName: "Asha R.", headline: null, currentTitle: null, location: null, bio: null, skills: null, openTo: ["Product Designer", "UX Lead"], verifiedWork: null, handle: "asha-r", workItems: [] } })));
    render(<PublicProfile />);
    expect(await screen.findByText("Open to: Product Designer")).toBeTruthy();
    expect(screen.getByText("Open to: UX Lead")).toBeTruthy();
  });

  it("shows the private gate to visitors with no leaked content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ profile: { visible: false, visibility: "private" } })));
    render(<PublicProfile />);
    expect(await screen.findByText("This profile is private.")).toBeTruthy();
  });

  it("lets the owner switch visibility inline without leaving the page", async () => {
    const visibility: { value: string } = { value: "link" };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/profile/me") && init?.method === "PUT") {
        visibility.value = (JSON.parse(String(init.body)) as { profileVisibility: string }).profileVisibility;
        return ok({});
      }
      return ok({ profile: { visible: true, visibility: visibility.value, isOwner: true, displayName: "Asha R.", headline: null, currentTitle: null, location: null, bio: null, skills: null, verifiedWork: null, handle: "asha-r", workItems: [] } });
    }));
    render(<PublicProfile />);
    expect(await screen.findByText("WHO CAN SEE THIS")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Link only" })).toHaveProperty("ariaChecked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Private" }));
    await waitFor(() => expect(visibility.value).toBe("private"));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Private" })).toHaveProperty("ariaChecked", "true"));
  });
  it("labels owner-only pieces honestly and ships no preview toggles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ profile: { visible: true, visibility: "link", isOwner: true, displayName: "Asha R.", headline: null, currentTitle: null, location: null, bio: null, skills: null, openTo: [], verifiedWork: null, handle: "asha-r", workItems: [{ id: 4, title: "Prototype kit", kind: "code", source: "GitHub", url: null, pinned: false, visibleOnProfile: false }] } })));
    render(<PublicProfile />);
    expect(await screen.findByText("Prototype kit")).toBeTruthy();
    expect(screen.getByText("Only visible to you")).toBeTruthy();
    expect(screen.queryByText("Shown only in requests")).toBeNull();
    expect(screen.queryByText("Visitor")).toBeNull();
    expect(screen.queryByText(/EXAMPLE PROFILE/)).toBeNull();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });
});
