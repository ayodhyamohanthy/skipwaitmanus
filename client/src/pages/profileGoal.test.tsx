// @vitest-environment jsdom
// Goal /profile and /work (D-048-p3-profile; packet docs/plans/D-048-account.md).
// Visibility controls are privacy (Tier 1): the "What a referrer sees" view
// never shows a piece marked "Only me", the privacy summary follows the saved
// page visibility, and a failed load renders its error, never a fake empty.
// Flag off, both routes keep the kit page exactly.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = { isLoaded: true, isSignedIn: true };
// One stable token getter, as the real usePersistFn gives the pages.
const getToken = async () => "tok";
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ ...authState, userId: "u1", getToken }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <div data-testid="sign-in-button">{children}</div>,
}));
const flagState = { on: true };
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "profile" };
});
vi.mock("@/hooks/usePersistFn", () => ({ usePersistFn: (fn: unknown) => fn }));

const ITEMS = [
  { id: 1, title: "Checkout redesign", kind: "case_study", source: "Behance", url: "https://example.com/checkout", pinned: true, visibleOnProfile: true },
  { id: 2, title: "Private sketchbook", kind: "project", source: null, url: null, pinned: false, visibleOnProfile: false },
];
type Call = { url: string; method: string; body: unknown; auth: string | undefined };
type Reply = { status: number; body: unknown } | "network" | (() => Promise<{ status: number; body: unknown }>);
const server = {
  calls: [] as Call[],
  profile: { displayName: "Meera Iyer", profile: { headline: "Product designer", company: null, workEmailDomain: null, workEmailVerifiedAt: null, handle: "meera", profileVisibility: "private" } } as unknown,
  profileReply: null as Reply | null,
  items: [] as unknown[],
  itemsReply: null as Reply | null,
  mutationReply: null as Reply | null,
};

function respond(reply: { status: number; body: unknown }) {
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
}
async function resolveReply(reply: Reply) {
  if (reply === "network") throw new TypeError("Failed to fetch");
  return respond(typeof reply === "function" ? await reply() : reply);
}

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = (init?.headers ?? {}) as Record<string, string>;
  server.calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: headers.Authorization });
  if (url === "/api/profile/me" && method === "GET") return resolveReply(server.profileReply ?? { status: 200, body: server.profile });
  if (url === "/api/work-items" && method === "GET") return resolveReply(server.itemsReply ?? { status: 200, body: { items: server.items } });
  if (url === "/api/profile/me" && method === "PUT") {
    if (server.mutationReply) return resolveReply(server.mutationReply);
    const patch = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const current = (server.profile as { profile: Record<string, unknown> }).profile;
    return respond({ status: 200, body: { profile: { ...current, ...patch } } });
  }
  if (url === "/api/work-items" && method === "POST") {
    if (server.mutationReply) return resolveReply(server.mutationReply);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return respond({ status: 201, body: { item: { id: 9, pinned: false, ...body, source: body.source || null, url: body.url || null } } });
  }
  const one = /^\/api\/work-items\/(\d+)$/.exec(url);
  if (one && method === "PATCH") {
    if (server.mutationReply) return resolveReply(server.mutationReply);
    const current = (server.items as Record<string, unknown>[]).find(item => item.id === Number(one[1]));
    return respond({ status: 200, body: { item: { ...current, ...JSON.parse(String(init?.body ?? "{}")) } } });
  }
  if (one && method === "DELETE") return server.mutationReply ? resolveReply(server.mutationReply) : respond({ status: 204, body: {} });
  throw new Error(`unexpected fetch ${method} ${url}`);
}));

import Profile from "@/pages/Profile";
import Work from "@/pages/Work";
import { GOAL_PAGE as PROFILE_GOAL_PAGE } from "@/pages/goal/profile/GoalProfile";
import { GOAL_PAGE as WORK_GOAL_PAGE } from "@/pages/goal/profile/GoalWork";
import { assertGoalPage } from "@/test/goalPageContract";

const primaries = () => document.querySelectorAll("[data-g-primary]");
const putCalls = () => server.calls.filter(call => call.method !== "GET");

// Warm the lazily loaded goal chunks so a cold transform on a busy runner
// never outlasts findBy's timeout.
beforeAll(async () => {
  await import("@/pages/goal/profile/GoalProfile");
  await import("@/pages/goal/profile/GoalWork");
}, 60_000);

beforeEach(() => {
  authState.isLoaded = true; authState.isSignedIn = true; flagState.on = true;
  server.calls = []; server.items = [...ITEMS]; server.profileReply = null; server.itemsReply = null; server.mutationReply = null;
  server.profile = { displayName: "Meera Iyer", profile: { headline: "Product designer", company: null, workEmailDomain: null, workEmailVerifiedAt: null, handle: "meera", profileVisibility: "private" } };
  window.history.replaceState({}, "", "/profile");
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => { cleanup(); });

describe("goal /profile", () => {
  it("flag off keeps the kit page", async () => {
    flagState.on = false;
    render(<Profile />);
    expect(await screen.findByRole("heading", { level: 1, name: /Profile & privacy/ })).toBeTruthy();
    expect(document.querySelector('[data-goal-page="profile"]')).toBeNull();
  });

  it("opens on the goal with one black commit and the saved headline", async () => {
    const { container } = render(<Profile />);
    expect(await screen.findByRole("heading", { level: 1, name: "Choose what referrers see." })).toBeTruthy();
    const headline = await screen.findByLabelText("Headline") as HTMLInputElement;
    expect(headline.value).toBe("Product designer");
    expect((screen.getByLabelText("Display name") as HTMLInputElement).readOnly).toBe(true);
    expect(primaries()).toHaveLength(1);
    expect(primaries()[0]?.textContent).toMatch(/Save profile/);
    expect(document.querySelector('[data-goal-page="profile"]')).toBeTruthy();
    assertGoalPage(container, PROFILE_GOAL_PAGE);
  });

  it("states what a referrer sees from the saved page visibility, per role", async () => {
    render(<Profile />);
    const preview = await screen.findByRole("region", { name: "What a referrer sees" });
    expect(within(preview).getByText("Not publicly discoverable")).toBeTruthy();
    expect(within(preview).getByText(/Only referrers reviewing your referral request see context/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Referrer profile" }));
    expect(within(preview).getByText(/Your name is shown only after you accept/)).toBeTruthy();
    cleanup();
    server.profile = { displayName: "Meera Iyer", profile: { headline: null, company: null, workEmailDomain: null, workEmailVerifiedAt: null, handle: "meera", profileVisibility: "public" } };
    render(<Profile />);
    const publicPreview = await screen.findByRole("region", { name: "What a referrer sees" });
    expect(within(publicPreview).getByText("Publicly discoverable")).toBeTruthy();
    expect(within(publicPreview).queryByText("Not publicly discoverable")).toBeNull();
  });

  it("shows loading while the profile is on its way (contract-exempt: no next-step block before data loads)", async () => {
    let release: () => void = () => {};
    server.profileReply = () => new Promise(resolve => { release = () => resolve({ status: 200, body: server.profile }); });
    render(<Profile />);
    expect(await screen.findByText("Loading your profile…")).toBeTruthy();
    expect(screen.queryByLabelText("Headline")).toBeNull();
    release();
    expect(await screen.findByLabelText("Headline")).toBeTruthy();
  });

  it("a failed load renders its error and a retry, never an empty form (contract-exempt: no next-step block when data failed to load)", async () => {
    server.profileReply = { status: 500, body: { error: "Profile service is down" } };
    render(<Profile />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Profile service is down/);
    expect(screen.queryByLabelText("Headline")).toBeNull();
    expect(screen.queryByRole("region", { name: "What a referrer sees" })).toBeNull();
    server.profileReply = null;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Headline")).toBeTruthy();
  });

  it("an unreachable server says so in plain words", async () => {
    server.profileReply = "network";
    render(<Profile />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not reach skipwait\.me/);
  });

  it("offline: says changes cannot be saved and holds the save", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    render(<Profile />);
    await screen.findByLabelText("Headline");
    expect(screen.getByTestId("goal-offline-state").textContent).toMatch(/offline/);
    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));
    expect(putCalls()).toHaveLength(0);
  });

  it("saves only the headline through the partial update and confirms it", async () => {
    render(<Profile />);
    fireEvent.change(await screen.findByLabelText("Headline"), { target: { value: "Senior product designer" } });
    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));
    await screen.findByText("Profile saved.");
    expect(putCalls()).toEqual([{ url: "/api/profile/me", method: "PUT", body: { headline: "Senior product designer" }, auth: "Bearer tok" }]);
  });

  it("a failed save shows the server's words and keeps the typed headline", async () => {
    server.mutationReply = { status: 400, body: { error: "Headline is too long" } };
    render(<Profile />);
    fireEvent.change(await screen.findByLabelText("Headline"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Headline is too long/);
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("x");
  });

  it("?focus=handle opens the profile-link dialog once the profile is known and saves a trimmed lowercase handle", async () => {
    window.history.replaceState({}, "", "/profile?focus=handle");
    render(<Profile />);
    const dialog = await screen.findByRole("dialog", { name: /profile link/i });
    const input = within(dialog).getByLabelText("Profile link") as HTMLInputElement;
    expect(input.value).toBe("meera");
    fireEvent.change(input, { target: { value: "  Meera-Iyer " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(putCalls()).toEqual([{ url: "/api/profile/me", method: "PUT", body: { handle: "meera-iyer" }, auth: "Bearer tok" }]);
  });

  it("signed out: the one next step is sign-in and nothing is fetched", async () => {
    authState.isSignedIn = false;
    const { container } = render(<Profile />);
    expect(await screen.findByRole("heading", { level: 1, name: "Choose what referrers see." })).toBeTruthy();
    expect(within(await screen.findByTestId("sign-in-button")).getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(server.calls).toHaveLength(0);
    assertGoalPage(container, PROFILE_GOAL_PAGE);
  });

  it("never names the retired nouns", async () => {
    render(<Profile />);
    await screen.findByLabelText("Headline");
    fireEvent.click(screen.getByRole("button", { name: "Referrer profile" }));
    expect(document.body.textContent ?? "").not.toMatch(/\bcredits?\b|\bask\b/i);
  });
});

describe("goal /work", () => {
  beforeEach(() => { window.history.replaceState({}, "", "/work"); });

  it("flag off keeps the kit page", async () => {
    flagState.on = false;
    render(<Work />);
    expect(await screen.findByRole("heading", { level: 1, name: /Your work, in one quiet place/ })).toBeTruthy();
    expect(document.querySelector('[data-goal-page="work"]')).toBeNull();
  });

  it("opens on the goal with every piece, its visibility in words, and one black commit", async () => {
    const { container } = render(<Work />);
    expect(await screen.findByRole("heading", { level: 1, name: "Choose what referrers see." })).toBeTruthy();
    expect(await screen.findByText("Checkout redesign")).toBeTruthy();
    expect(screen.getByText("Private sketchbook")).toBeTruthy();
    expect(screen.getAllByText("Only me").length).toBeGreaterThan(0);
    expect(primaries()).toHaveLength(1);
    expect(primaries()[0]?.textContent).toMatch(/Add work/);
    expect(screen.getByTestId("pin-count").textContent).toBe("1 pinned");
    assertGoalPage(container, WORK_GOAL_PAGE);
  });

  it("what a referrer sees never includes a piece marked Only me", async () => {
    render(<Work />);
    await screen.findByText("Private sketchbook");
    fireEvent.click(screen.getByRole("button", { name: "What a referrer sees" }));
    expect(screen.getByText("Checkout redesign")).toBeTruthy();
    expect(screen.queryByText("Private sketchbook")).toBeNull();
    expect(screen.queryByLabelText(/Who can see Checkout redesign/)).toBeNull();
  });

  it("an empty list is shown only after a successful load", async () => {
    server.items = [];
    render(<Work />);
    expect(await screen.findByText("Add one piece you're proud of.")).toBeTruthy();
  });

  it("a failed load renders its error and a retry, never the empty state", async () => {
    server.itemsReply = { status: 500, body: { error: "Work service is down" } };
    const { container } = render(<Work />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Work service is down/);
    expect(screen.queryByText("Add one piece you're proud of.")).toBeNull();
    // A count is a fact: while the list is unknown the card states none, so it
    // never reads "0 pinned" beside an alert saying nothing was changed.
    expect(screen.queryByTestId("pin-count")).toBeNull();
    assertGoalPage(container, WORK_GOAL_PAGE);
    server.itemsReply = null;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Checkout redesign")).toBeTruthy();
  });

  it("shows loading while the work is on its way", async () => {
    let release: () => void = () => {};
    server.itemsReply = () => new Promise(resolve => { release = () => resolve({ status: 200, body: { items: server.items } }); });
    const { container } = render(<Work />);
    expect(await screen.findByText("Loading your work…")).toBeTruthy();
    expect(screen.queryByText("Add one piece you're proud of.")).toBeNull();
    expect(screen.queryByTestId("pin-count")).toBeNull();
    assertGoalPage(container, WORK_GOAL_PAGE);
    release();
    expect(await screen.findByText("Checkout redesign")).toBeTruthy();
    // Once the list is known both counts arrive together.
    expect(screen.getByTestId("pin-count").textContent).toBe("1 pinned");
  });

  it("changes who can see a piece and pins one through the existing PATCH", async () => {
    render(<Work />);
    await screen.findByText("Checkout redesign");
    fireEvent.change(screen.getByLabelText("Who can see Checkout redesign"), { target: { value: "hidden" } });
    await waitFor(() => expect(putCalls()).toEqual([{ url: "/api/work-items/1", method: "PATCH", body: { visibleOnProfile: false }, auth: "Bearer tok" }]));
    fireEvent.click(screen.getByRole("button", { name: "Pin Private sketchbook" }));
    await waitFor(() => expect(putCalls()[1]).toEqual({ url: "/api/work-items/2", method: "PATCH", body: { pinned: true }, auth: "Bearer tok" }));
  });

  it("a failed visibility change says so and keeps the saved value", async () => {
    server.mutationReply = { status: 500, body: { error: "Could not change visibility" } };
    render(<Work />);
    await screen.findByText("Checkout redesign");
    fireEvent.change(screen.getByLabelText("Who can see Checkout redesign"), { target: { value: "hidden" } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not change visibility/);
    expect((screen.getByLabelText("Who can see Checkout redesign") as HTMLSelectElement).value).toBe("visible");
  });

  it("adds a piece privately through the existing POST", async () => {
    render(<Work />);
    await screen.findByText("Checkout redesign");
    fireEvent.click(screen.getByRole("button", { name: /Add work/ }));
    const dialog = await screen.findByRole("dialog", { name: "Add work" });
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "  Design system audit " } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Only me" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save privately" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(putCalls()).toEqual([{ url: "/api/work-items", method: "POST", body: { title: "Design system audit", kind: "project", source: "", url: "", visibleOnProfile: false }, auth: "Bearer tok" }]);
    expect(screen.getByText("Design system audit")).toBeTruthy();
  });

  it("an untitled piece is not sent", async () => {
    render(<Work />);
    await screen.findByText("Checkout redesign");
    fireEvent.click(screen.getByRole("button", { name: /Add work/ }));
    const dialog = await screen.findByRole("dialog", { name: "Add work" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish to profile" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/Give each work item a title/);
    expect(putCalls()).toHaveLength(0);
  });

  it("edits and removes a piece through the existing PATCH and DELETE", async () => {
    render(<Work />);
    await screen.findByText("Checkout redesign");
    fireEvent.click(screen.getByRole("button", { name: "Edit Private sketchbook" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit work" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove work" }));
    await waitFor(() => expect(screen.queryByText("Private sketchbook")).toBeNull());
    expect(putCalls()).toEqual([{ url: "/api/work-items/2", method: "DELETE", body: undefined, auth: "Bearer tok" }]);
  });

  it("sets the profile link from the owner card", async () => {
    server.profile = { displayName: "Meera Iyer", profile: { headline: null, handle: null } };
    render(<Work />);
    fireEvent.click(await screen.findByRole("button", { name: "Set your profile link" }));
    const dialog = await screen.findByRole("dialog", { name: /profile link/i });
    fireEvent.change(within(dialog).getByLabelText("Profile link"), { target: { value: "meera" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save link" }));
    expect(await screen.findByText("meera")).toBeTruthy();
    expect(putCalls()).toEqual([{ url: "/api/profile/me", method: "PUT", body: { handle: "meera" }, auth: "Bearer tok" }]);
  });

  it("offline: says changes cannot be saved", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    render(<Work />);
    await screen.findByText("Checkout redesign");
    expect(screen.getByTestId("goal-offline-state").textContent).toMatch(/offline/);
  });

  it("signed out: the one next step is sign-in and nothing is fetched", async () => {
    authState.isSignedIn = false;
    const { container } = render(<Work />);
    expect(await screen.findByRole("heading", { level: 1, name: "Choose what referrers see." })).toBeTruthy();
    expect(within(await screen.findByTestId("sign-in-button")).getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(server.calls).toHaveLength(0);
    assertGoalPage(container, WORK_GOAL_PAGE);
  });
});
