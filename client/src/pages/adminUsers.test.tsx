// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminUsers from "./AdminUsers";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("admin-token") }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));

const users = [
  { id: 9, email: "avery@example.com", name: "Avery Cole", role: "user", accountType: "job_seeker", company: null, workEmailVerifiedAt: null, suspended: false, createdAt: "2026-09-01T08:00:00.000Z" },
  { id: 10, email: "blake@acme.com", name: "Blake Ray", role: "user", accountType: "referrer", company: "Acme", workEmailVerifiedAt: "2026-09-02T08:00:00.000Z", suspended: false, createdAt: "2026-08-28T08:00:00.000Z" },
  { id: 11, email: "skye@forwarder.com", name: "Skye Fox", role: "user", accountType: null, company: null, workEmailVerifiedAt: null, suspended: true, createdAt: "2026-08-20T08:00:00.000Z" },
];

function stubUsersFetch() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return { ok: true, status: 200, json: async () => ({ user: { suspended: String(init.body).includes("true") } }) };
    return { ok: true, status: 200, json: async () => ({ users }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><AdminUsers /></QueryClientProvider>,
);
const row = (who: RegExp) => screen.getByRole("button", { name: who });
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const posts = (fetchMock: { mock: { calls: [RequestInfo | URL, RequestInit?][] } }) => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
const suspensionCall = ["/api/admin/users/9/suspend", expect.objectContaining({ method: "POST", body: JSON.stringify({ suspended: true }) })];
async function openSuspendDialog() {
  fireEvent.click(await screen.findByRole("button", { name: /avery@example\.com/ }));
  fireEvent.click(within(nextStep()).getByRole("button", { name: "Suspend account" }));
  return screen.findByRole("dialog");
}

beforeAll(async () => { await import("./goal/admin-people/GoalAdminUsers"); });
beforeEach(() => { stubUsersFetch(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("admin users directory", () => {
  it("renders account rows with role badges, verified marker, and Suspended badge", async () => {
    renderPage();
    await screen.findByText("avery@example.com");
    expect(within(row(/avery@example\.com/)).getByText("Job Seeker")).toBeTruthy();
    const blake = row(/blake@acme\.com/);
    expect(within(blake).getByText("Referrer")).toBeTruthy();
    expect(within(blake).getByText("Work email verified")).toBeTruthy();
    expect(within(blake).getByText(/Joined Aug 28, 2026/)).toBeTruthy();
    expect(within(row(/skye@forwarder\.com/)).getByText("Suspended")).toBeTruthy();
  });

  it("filters rows client-side by email or name", async () => {
    renderPage();
    await screen.findByText("avery@example.com");
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "blake@acme.com" } });
    expect(screen.getByText("blake@acme.com")).toBeTruthy();
    expect(screen.queryByText("avery@example.com")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "Avery Cole" } });
    expect(screen.getByText("avery@example.com")).toBeTruthy();
    expect(screen.queryByText("blake@acme.com")).toBeNull();
  });

  it("suspends from the confirm dialog with a server-confirmed badge update", async () => {
    const fetchMock = stubUsersFetch();
    renderPage();
    const dialog = await openSuspendDialog();
    expect(within(dialog).getByRole("heading", { name: "Suspend this user?" })).toBeTruthy();
    expect(within(dialog).getByText("avery@example.com will lose access immediately. You can unsuspend them at any time.")).toBeTruthy();
    expect(posts(fetchMock)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend user" }));
    await waitFor(() => expect(posts(fetchMock)).toEqual([suspensionCall]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await within(row(/avery@example\.com/)).findByText("Suspended")).toBeTruthy();
    expect(within(nextStep()).getByRole("button", { name: "Unsuspend account" })).toBeTruthy();
  });

  it("keeps the account unchanged after a failed suspension and confirms a deliberate retry", async () => {
    let postCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        postCount += 1;
        return postCount === 1
          ? { ok: false, status: 500, json: async () => ({ error: "We could not update this user account" }) }
          : { ok: true, status: 200, json: async () => ({ user: { suspended: true } }) };
      }
      return { ok: true, status: 200, json: async () => ({ users }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.click(within(await openSuspendDialog()).getByRole("button", { name: "Suspend user" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Update failed — We could not update this user account. The account is unchanged.");
    expect(within(row(/avery@example\.com/)).queryByText("Suspended")).toBeNull();
    expect(within(row(/avery@example\.com/)).getByText("Job Seeker")).toBeTruthy();
    expect(postCount).toBe(1);
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await within(row(/avery@example\.com/)).findByText("Suspended")).toBeTruthy();
    expect(within(nextStep()).getByRole("button", { name: "Unsuspend account" })).toBeTruthy();
    expect(posts(fetchMock)).toEqual([suspensionCall, suspensionCall]);
    expect(postCount).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the administrator-required card on a 403 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 403, ok: false, json: async () => ({ error: "Administrator access is required" }) })));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Administrator access is required/)).toBeTruthy();
    expect(within(alert).getByText(/Sign in with the designated administrator account/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Accounts" })).toBeNull();
    expect(screen.queryByLabelText("Search users")).toBeNull();
    expect(screen.queryByText("avery@example.com")).toBeNull();
    expect(screen.getByRole("link", { name: "skipwait.me home" }).getAttribute("href")).toBe("/");
  });

  it("keeps a D-400 protected account unsuspended after one confirmed server refusal", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: false, status: 403, json: async () => ({ error: "The founder's account cannot be suspended" }) };
      return { ok: true, status: 200, json: async () => ({ users }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    const dialog = await openSuspendDialog();
    expect(posts(fetchMock)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend user" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The account is unchanged.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const selectedRow = row(/avery@example\.com/);
    expect(selectedRow.getAttribute("aria-current")).toBe("true");
    expect(within(selectedRow).getByText("Job Seeker")).toBeTruthy();
    expect(within(selectedRow).queryByText("Suspended")).toBeNull();
    expect(within(selectedRow).queryByText(/Unsuspend/)).toBeNull();
    expect(within(nextStep()).queryByRole("button", { name: "Unsuspend account" })).toBeNull();
    expect(within(nextStep()).getByRole("button", { name: "Suspend account" })).toBeTruthy();
    expect(screen.queryByText(/The update was saved|Its confirmation was lost/)).toBeNull();
    expect(posts(fetchMock)).toEqual([suspensionCall]);
  });
});
