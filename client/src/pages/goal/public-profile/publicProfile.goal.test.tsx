// @vitest-environment jsdom
// D-048-p3-public-profile (packet docs/plans/D-048-marketing.md §3-§5): /p/:handle
// on the goal design behind goalSurfaceOn("public-profile"). This surface is
// privacy (Tier 1), so the tests pin the visibility contract hard: a private
// page says only that it is private (never a name, headline or piece), a
// missing handle is not called private, a failed read says so and retries, and
// the owner keeps the page's one real control - who can see it.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = { isLoaded: true, isSignedIn: false };
const getToken = async () => "tok";
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ ...authState, getToken }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <div data-testid="sign-in-button">{children}</div>,
}));
const flagState = { on: true, asked: [] as string[] };
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => { flagState.asked.push(id); return flagState.on && id === "public-profile"; } };
});
const routeState = { handle: "asha-r" };
vi.mock("wouter", () => ({
  useRoute: () => [true, { handle: routeState.handle }],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

type Reply = { status: number; body: unknown } | "network";
const server = {
  calls: [] as { url: string; method: string; body: unknown; auth: string | undefined }[],
  profile: null as unknown,
  profileReply: null as Reply | null,
  putReply: null as Reply | null,
};

function respond(reply: { status: number; body: unknown }) {
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
}
function resolveReply(reply: Reply) {
  if (reply === "network") throw new TypeError("Failed to fetch");
  return respond(reply);
}

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  server.calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
  if (url.startsWith("/api/p/") && method === "GET") return resolveReply(server.profileReply ?? { status: 200, body: { profile: server.profile } });
  if (url === "/api/profile/me" && method === "PUT") {
    if (server.putReply) return resolveReply(server.putReply);
    const patch = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    server.profile = { ...(server.profile as Record<string, unknown>), ...patch };
    return respond({ status: 200, body: { profile: server.profile } });
  }
  throw new Error(`unexpected fetch ${method} ${url}`);
}));

import PublicProfile from "@/pages/PublicProfile";
import { GOAL_PAGE } from "@/pages/goal/public-profile/GoalPublicProfile";
import { assertGoalPage } from "@/test/goalPageContract";

const primaries = () => document.querySelectorAll("[data-g-primary]");
const putCalls = () => server.calls.filter(call => call.method !== "GET");

const PIECES = [
  { id: 3, title: "Checkout redesign", kind: "case_study", source: "Behance", url: "https://example.com/checkout", pinned: true, visibleOnProfile: true },
  { id: 4, title: "Design system", kind: "project", source: "GitHub", url: null, pinned: false, visibleOnProfile: true },
];
const VISITOR = { visible: true, visibility: "public", isOwner: false, displayName: "Asha R.", headline: "Senior product designer", location: "Bengaluru", openTo: ["Product Designer", "UX Lead"], company: "Wipro", verifiedWork: { domain: "wipro.com", verifiedAt: "2026-01-01" }, handle: "asha-r", workItems: PIECES };

beforeAll(async () => { await import("@/pages/goal/public-profile/GoalPublicProfile"); }, 60_000);

beforeEach(() => {
  flagState.on = true; flagState.asked = [];
  routeState.handle = "asha-r";
  server.calls = []; server.profile = VISITOR; server.profileReply = null; server.putReply = null;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => { cleanup(); document.head.querySelectorAll('meta[name="robots"]').forEach(tag => tag.remove()); });

describe("goal /p/:handle", () => {
  it("flag off keeps the kit page", async () => {
    flagState.on = false;
    const { container } = render(<PublicProfile />);
    expect(await screen.findByText("No feed. No followers. No likes. Just work.", { exact: false })).toBeTruthy();
    expect(container.querySelector('[data-goal-page="public-profile"]')).toBeNull();
    expect(container.querySelector('[data-skipwait-screen="public-profile"]')).toBeTruthy();
    expect(flagState.asked).toContain("public-profile");
  });

  it("opens with the person's goal line, their verified work and one black commit", async () => {
    const { container } = render(<PublicProfile />);
    expect(await screen.findByRole("heading", { level: 1, name: "See Asha R.'s work." })).toBeTruthy();
    expect(screen.getByTestId("goal-verified-mark").textContent).toBe("Verified at wipro.com via work email");
    expect(screen.getByText("Checkout redesign")).toBeTruthy();
    expect(screen.getByText("Design system")).toBeTruthy();
    expect(screen.getByText("Open to: Product Designer")).toBeTruthy();
    expect(container.querySelector('[data-goal-page="public-profile"]')).toBeTruthy();
    expect(primaries()).toHaveLength(1);
    expect(primaries()[0]?.textContent).toContain("Explore companies");
    expect(within(container.querySelector('section[aria-labelledby="goal-next-step-heading"]') as HTMLElement).getByText("Explore companies")).toBeTruthy();
    assertGoalPage(container, { goalLine: "See Asha R.'s work." });
  });

  it("never guesses a name when the name is a personal one: it uses the server's displayName only", async () => {
    server.profile = { ...VISITOR, displayName: undefined, headline: null, verifiedWork: null, workItems: [] };
    render(<PublicProfile />);
    expect(await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/undefined/);
  });

  it("private page: plain words, no name, headline, company or piece", async () => {
    server.profile = { visible: false, visibility: "private" };
    const { container } = render(<PublicProfile />);
    expect(await screen.findByRole("heading", { level: 1, name: "This profile is private." })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Asha");
    expect(text).not.toContain("Checkout redesign");
    expect(text).not.toContain("wipro.com");
    expect(primaries()).toHaveLength(1);
    expect(primaries()[0]?.textContent).toContain("Explore companies");
    assertGoalPage(container, { goalLine: "This profile is private." });
  });

  it("an unknown handle says the link is not available, never that the profile is private", async () => {
    server.profileReply = { status: 404, body: { error: "This profile isn't available" } };
    render(<PublicProfile />);
    expect(await screen.findByRole("heading", { level: 1, name: "This profile isn't available." })).toBeTruthy();
    expect(screen.queryByText("This profile is private.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a server error is an error with a retry, not a private page", async () => {
    server.profileReply = { status: 500, body: { error: "We couldn't load this profile" } };
    render(<PublicProfile />);
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't load this profile");
    expect(screen.queryByText("This profile is private.")).toBeNull();
  });

  it("an unreachable server says so in plain words and retries the read", async () => {
    server.profileReply = "network";
    render(<PublicProfile />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not reach skipwait\.me/);
    server.profileReply = null;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "See Asha R.'s work." })).toBeTruthy();
  });

  it("owner: changes who can see the page in place through the partial update", async () => {
    server.profile = { ...VISITOR, isOwner: true, visibility: "link" };
    const { container } = render(<PublicProfile />);
    expect(await screen.findByRole("heading", { level: 2, name: "Who can see this page" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Link only" })).toHaveProperty("ariaChecked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Private" }));
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]).toMatchObject({ url: "/api/profile/me", method: "PUT", body: { profileVisibility: "private" }, auth: "Bearer tok" });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Private" })).toHaveProperty("ariaChecked", "true"));
    expect(primaries()).toHaveLength(1);
    expect(primaries()[0]?.textContent).toContain("Copy your link");
    assertGoalPage(container, { goalLine: "See Asha R.'s work." });
  });

  it("owner: a failed visibility save says so and keeps the saved choice", async () => {
    server.profile = { ...VISITOR, isOwner: true, visibility: "link" };
    server.putReply = { status: 500, body: { error: "We could not update who can see this page" } };
    render(<PublicProfile />);
    await screen.findByRole("radio", { name: "Link only" });
    fireEvent.click(screen.getByRole("radio", { name: "Private" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not update who can see this page");
    expect(screen.getByRole("radio", { name: "Link only" })).toHaveProperty("ariaChecked", "true");
  });

  it("owner preview: Visitor hides the owner controls and only then shows the gate on a private page", async () => {
    server.profile = { ...VISITOR, isOwner: true, visibility: "private" };
    render(<PublicProfile />);
    expect(await screen.findByRole("heading", { level: 2, name: "Who can see this page" })).toBeTruthy();
    expect(screen.getByText("Checkout redesign")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Visitor" }));
    expect(await screen.findByRole("heading", { level: 1, name: "This profile is private." })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Who can see this page" })).toBeNull();
    expect(document.body.textContent ?? "").not.toContain("Checkout redesign");
  });

  it("owner: a piece marked only-me stays off the page for visitors", async () => {
    server.profile = { ...VISITOR, isOwner: true, visibility: "link", workItems: [...PIECES, { id: 5, title: "Private sketchbook", kind: "project", source: null, url: null, pinned: false, visibleOnProfile: false }] };
    render(<PublicProfile />);
    expect(await screen.findByText("Private sketchbook")).toBeTruthy();
    expect(screen.getByText("Only you can see this")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Visitor" }));
    expect(await screen.findByText("Checkout redesign")).toBeTruthy();
    expect(screen.queryByText("Private sketchbook")).toBeNull();
  });

  it("offline: says edits are held and sends no visibility change", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    server.profile = { ...VISITOR, isOwner: true, visibility: "link" };
    render(<PublicProfile />);
    await screen.findByRole("radio", { name: "Link only" });
    expect(screen.getByTestId("goal-offline-state").textContent).toMatch(/offline/);
    fireEvent.click(screen.getByRole("radio", { name: "Private" }));
    expect(putCalls()).toHaveLength(0);
  });

  it("empty work is stated honestly for a visitor", async () => {
    server.profile = { ...VISITOR, workItems: [] };
    render(<PublicProfile />);
    expect(await screen.findByText("No work shared yet.")).toBeTruthy();
  });

  it("a link-only page asks search engines to stay away", async () => {
    server.profile = { ...VISITOR, visibility: "link" };
    render(<PublicProfile />);
    await screen.findByRole("heading", { level: 1, name: "See Asha R.'s work." });
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex"));
  });

  it("never names the retired nouns", async () => {
    server.profile = { ...VISITOR, isOwner: true, visibility: "link" };
    render(<PublicProfile />);
    await screen.findByRole("heading", { level: 2, name: "Who can see this page" });
    expect(document.body.textContent ?? "").not.toMatch(/\bcredits?\b|\bask\b/i);
  });
});
