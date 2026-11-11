// @vitest-environment jsdom
// D-048-p3-admin-people goal /admin/users (D-048-admin.md §3-§5): the people
// surface opens "Act on people requests." and the suspension confirm stays
// exactly as the kit page had it - same two steps, same consequence copy, same
// POST /api/admin/users/:id/suspend with { suspended } and nothing else
// (guardrail 1). Loading, empty, error, the failed-update revert and the access
// gate are pinned. Fixtures are synthetic.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminUsers, { GOAL_PAGE } from "./GoalAdminUsers";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));

const USERS = [
  { id: 9, email: "avery@example.com", name: "Avery Nair", role: "user", accountType: "job_seeker", company: null, workEmailVerifiedAt: null, suspended: false, createdAt: "2026-10-02T08:00:00.000Z" },
  { id: 12, email: "ravi@example.com", name: "Ravi Menon", role: "user", accountType: "referrer", company: "Acme Corp", workEmailVerifiedAt: "2026-10-03T08:00:00.000Z", suspended: true, createdAt: "2026-10-01T08:00:00.000Z" },
  { id: 15, email: null, name: null, role: "user", accountType: null, company: null, workEmailVerifiedAt: null, suspended: false, createdAt: "2026-10-04T08:00:00.000Z" },
];

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, json: async () => body });

function stub(overrides: { list?: Reply | (() => Promise<Reply>); suspend?: (url: string, body: unknown) => Reply } = {}) {
  const list = () => (typeof overrides.list === "function" ? overrides.list() : overrides.list ?? reply({ users: USERS }));
  const suspend = overrides.suspend ?? ((url, body) => reply({ user: { suspended: (body as { suspended?: boolean }).suspended, id: Number(String(url).match(/users\/(\d+)/)?.[1]) } }));
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/suspend")) return suspend(String(url), JSON.parse(String(init?.body)));
    if (String(url).startsWith("/api/admin/users")) return list();
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const row = (who: RegExp) => screen.getByRole("button", { name: who });
const posts = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([url], index) => String(url).includes("/suspend") && (fetchMock.mock.calls[index] as [string, RequestInit?])[1]?.method === "POST");

afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.isSignedIn = true; });

describe("goal /admin/users (D-048-p3-admin-people)", () => {
  it("opens with the goal line and one next step over the roster", async () => {
    stub();
    const { container } = renderPage(<GoalAdminUsers />);
    expect(await screen.findByText("avery@example.com")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Act on people requests.");
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    expect(container.querySelector("[data-skipwait-screen='admin-users']")).toBeTruthy();
    expect(within(nextStep()).getByRole("button", { name: "Choose an account" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("shows every account's state as dot + text, never colour alone", async () => {
    stub();
    renderPage(<GoalAdminUsers />);
    await screen.findByText("avery@example.com");
    expect(within(row(/avery@example.com/)).getByText("Job Seeker")).toBeTruthy();
    expect(within(row(/ravi@example.com/)).getByText("Suspended")).toBeTruthy();
    expect(within(row(/ravi@example.com/)).getByText("Work email verified")).toBeTruthy();
    expect(within(row(/User #15/)).getByText("No profile")).toBeTruthy();
  });

  it("filters the roster on the client, as the kit page did", async () => {
    stub();
    renderPage(<GoalAdminUsers />);
    await screen.findByText("avery@example.com");
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "ravi" } });
    expect(screen.getByText("ravi@example.com")).toBeTruthy();
    expect(screen.queryByText("avery@example.com")).toBeNull();
    expect(screen.queryByText("User #15")).toBeNull();
  });

  it("asks for a confirm before suspending, then posts the same call and body", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminUsers />);
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Suspend account" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Suspend this user?" })).toBeTruthy();
    expect(within(dialog).getByText("avery@example.com will lose access immediately. You can unsuspend them at any time.")).toBeTruthy();
    expect(posts(fetchMock)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend user" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(String(fetchMock.mock.calls.find(([url]) => String(url).includes("/suspend"))?.[0])).toBe("/api/admin/users/9/suspend");
    expect(JSON.parse(String((posts(fetchMock)[0] as [string, RequestInit])[1].body))).toEqual({ suspended: true });
    expect(await within(row(/avery@example.com/)).findByText("Suspended")).toBeTruthy();
  });

  it("keeps the cancel step: closing the confirm sends nothing", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminUsers />);
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Suspend account" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts(fetchMock)).toHaveLength(0);
    expect(within(nextStep()).getByRole("button", { name: "Suspend account" })).toBeTruthy();
  });

  it("unsuspends on its own confirm copy and body", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminUsers />);
    fireEvent.click(await screen.findByRole("button", { name: /ravi@example.com/ }));
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Unsuspend account" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Unsuspend this user?" })).toBeTruthy();
    expect(within(dialog).getByText("ravi@example.com regains access immediately.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unsuspend user" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(String((posts(fetchMock)[0] as [string, RequestInit])[1].body))).toEqual({ suspended: false });
    expect(await within(row(/ravi@example.com/)).findByText("Referrer")).toBeTruthy();
  });

  it("holds exactly one black commit: the confirm takes over from the page", async () => {
    stub();
    renderPage(<GoalAdminUsers />);
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    expect(Array.from(document.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Suspend account"]);
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Suspend account" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(document.querySelectorAll("[data-g-primary]").length).toBe(1));
    expect(dialog.contains(document.querySelector("[data-g-primary]"))).toBe(true);
    expect(within(nextStep()).getByRole("button", { name: "Suspend account" }).getAttribute("data-g-primary")).toBeNull();
  });

  it("says the account is unchanged when the update fails, and retries the same call", async () => {
    const fetchMock = stub({ suspend: () => reply({ error: "User suspension is unavailable right now" }, 503) });
    renderPage(<GoalAdminUsers />);
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Suspend account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Suspend user" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Update failed — User suspension is unavailable right now. The account is unchanged.");
    expect(within(row(/avery@example.com/)).queryByText("Suspended")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(2));
    expect(JSON.parse(String((posts(fetchMock)[1] as [string, RequestInit])[1].body))).toEqual({ suspended: true });
  });

  it("shows a loading state without claiming an empty directory", async () => {
    stub({ list: () => new Promise<Reply>(() => {}) });
    const { container } = renderPage(<GoalAdminUsers />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("No accounts yet")).toBeNull();
  });

  it("says so honestly when the directory is empty", async () => {
    stub({ list: reply({ users: [] }) });
    renderPage(<GoalAdminUsers />);
    expect(await screen.findByText("No accounts yet")).toBeTruthy();
  });

  it("shows a failed load with a retry that runs the request again", async () => {
    const fetchMock = stub({ list: reply({ error: "boom" }, 500) });
    renderPage(<GoalAdminUsers />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    const before = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/users")).length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/users")).length).toBeGreaterThan(before));
    expect(screen.queryByText("No accounts yet")).toBeNull();
  });

  it("keeps the directory hidden without administrator access", async () => {
    stub({ list: reply({ error: "Administrator access is required" }, 403) });
    renderPage(<GoalAdminUsers />);
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    expect(screen.queryByText(/avery@example.com|ravi@example.com/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    renderPage(<GoalAdminUsers />);
    expect(screen.getByRole("button", { name: /Sign in/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
