// @vitest-environment jsdom
// D-048-p3-admin-ops /admin/smoke (D-048-admin.md §3): the fixture keeps every
// load-bearing behaviour of AdminSmoke.tsx - no bearer anywhere, cookie + CSRF
// actions with the kit's own failure copy, `window.location.reload()` after
// activate and exit, a re-read after reset, the `noindex` robots meta and the
// "Not found" screen while the fixture is disabled. The four role buttons
// become one role choice plus one black commit (D-150). Fixtures are synthetic.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminSmoke, { GOAL_PAGE } from "./GoalAdminSmoke";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin/smoke", vi.fn()],
  useSearch: () => "",
}));

const SNAPSHOT = { asks: [{ ref: "SW-0001", status: "open" }], synthetic: true };

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

type Key = "status" | "snapshot" | "activate" | "exit" | "reset";
function stub(overrides: Partial<Record<Key, Reply>> = {}) {
  const route = (key: Key, fallback: Reply) => overrides[key] ?? fallback;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/status")) return route("status", reply({ enabled: true, active: false, csrf: "csrf-token" }));
    if (url.includes("/snapshot")) return route("snapshot", reply(SNAPSHOT));
    if (url.includes("/activate")) return route("activate", reply({ ok: true }));
    if (url.includes("/exit")) return route("exit", reply({ ok: true }));
    if (url.includes("/reset")) return route("reset", reply({ ok: true }));
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}>{ui}</QueryClientProvider>);
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const callFor = (fetchMock: ReturnType<typeof stub>, part: string) => {
  const found = fetchMock.mock.calls.filter(([url]) => String(url).includes(part)).pop();
  return { url: String(found?.[0]), init: found?.[1] as RequestInit | undefined };
};

/** jsdom's Location is unforgeable, so the seam is the global itself. */
let reload: ReturnType<typeof vi.fn>;
beforeEach(() => { reload = vi.fn(); vi.stubGlobal("location", { reload }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /admin/smoke (D-048-p3-admin-ops)", () => {
  it("opens with the goal line and one commit that enters the fixture", async () => {
    stub();
    const { container } = renderPage(<GoalAdminSmoke />);
    expect(await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine })).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Open the synthetic smoke fixture.");
    expect(Array.from(container.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Enter as seeker"]);
  });

  it("never sends a bearer token: the fixture is cookie and CSRF gated", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminSmoke />);
    await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine });
    expect(callFor(fetchMock, "/status").init).toEqual({ credentials: "include" });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Enter as seeker" }));
    await waitFor(() => expect(callFor(fetchMock, "/activate").url).toBe("/api/admin/smoke/activate"));
    const sent = callFor(fetchMock, "/activate");
    expect(sent.init?.method).toBe("POST");
    expect(sent.init?.credentials).toBe("include");
    expect(sent.init?.headers).toEqual({ "Content-Type": "application/json", "x-csrf-token": "csrf-token" });
    expect(JSON.parse(String(sent.init?.body))).toEqual({ role: "seeker", csrf: "csrf-token" });
  });

  it("enters the chosen plane and reloads, as the kit page does", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminSmoke />);
    await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine });
    fireEvent.click(screen.getByRole("radio", { name: "referrer" }));
    expect(within(nextStep()).getByRole("button", { name: "Enter as referrer" })).toBeTruthy();
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Enter as referrer" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(JSON.parse(String(callFor(fetchMock, "/activate").init?.body))).toEqual({ role: "referrer", csrf: "csrf-token" });
  });

  it("shows the seeded state and makes exit the one commit", async () => {
    stub({ status: reply({ enabled: true, active: true, role: "seeker", csrf: "csrf-token" }) });
    const { container } = renderPage(<GoalAdminSmoke />);
    expect(await screen.findByText(/"synthetic": true/)).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(Array.from(container.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Exit the fixture"]);
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
  });

  it("reloads on exit", async () => {
    const fetchMock = stub({ status: reply({ enabled: true, active: true, csrf: "csrf-token" }) });
    renderPage(<GoalAdminSmoke />);
    await screen.findByText(/"synthetic": true/);
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Exit the fixture" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(JSON.parse(String(callFor(fetchMock, "/exit").init?.body))).toEqual({ csrf: "csrf-token" });
  });

  it("re-reads the fixture after a reset instead of reloading", async () => {
    const fetchMock = stub({ status: reply({ enabled: true, active: true, csrf: "csrf-token" }) });
    renderPage(<GoalAdminSmoke />);
    await screen.findByText(/"synthetic": true/);
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    expect(callFor(fetchMock, "/reset").url).toBe("/api/admin/smoke/reset");
    expect(reload).not.toHaveBeenCalled();
  });

  it("surfaces the action error in the kit page's own words", async () => {
    stub({ activate: reply({ error: "Smoke fixture is not enabled" }, 403) });
    renderPage(<GoalAdminSmoke />);
    await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Enter as seeker" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Smoke fixture is not enabled");
    expect(reload).not.toHaveBeenCalled();
  });

  it("names the status code when the action answer carries no message", async () => {
    stub({ reset: reply({ "": "" }, 500), status: reply({ enabled: true, active: true, csrf: "csrf-token" }) });
    renderPage(<GoalAdminSmoke />);
    await screen.findByText(/"synthetic": true/);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Smoke action failed (500)");
  });

  it("reads as Not found while the fixture is disabled, with no admin chrome", async () => {
    stub({ status: reply({ enabled: false }) });
    const { container } = renderPage(<GoalAdminSmoke />);
    expect(await screen.findByRole("heading", { level: 1, name: "Not found" })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeNull();
  });

  it("reads as Not found when the route is absent, exactly as the kit page", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply({}, 404) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPage(<GoalAdminSmoke />);
    expect(await screen.findByRole("heading", { level: 1, name: "Not found" })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/admin/smoke/status");
  });

  it("keeps the fixture out of search engines while it is mounted", async () => {
    stub();
    const { unmount } = renderPage(<GoalAdminSmoke />);
    await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine });
    expect(document.querySelector("meta[name='robots']")?.getAttribute("content")).toBe("noindex,nofollow,noarchive");
    unmount();
    expect(document.querySelector("meta[name='robots']")).toBeNull();
  });

  it("warns that the state is synthetic without hiding the goal line", async () => {
    stub();
    renderPage(<GoalAdminSmoke />);
    await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine });
    expect(screen.getByText("Smoke test · synthetic data")).toBeTruthy();
    expect(screen.getByText("Isolated synthetic state. No live users, messages, payments or files.")).toBeTruthy();
  });
});
