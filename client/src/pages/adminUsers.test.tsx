// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUsers from "./AdminUsers";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("admin-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));

const users = [
  { id: 9, email: "avery@example.com", name: "Avery Cole", role: "user", accountType: "job_seeker", company: null, workEmailVerifiedAt: null, suspended: false, createdAt: "2026-09-01T08:00:00.000Z" },
  { id: 10, email: "blake@acme.com", name: "Blake Ray", role: "user", accountType: "referrer", company: "Acme", workEmailVerifiedAt: "2026-09-02T08:00:00.000Z", suspended: false, createdAt: "2026-08-28T08:00:00.000Z" },
  { id: 11, email: "skye@forwarder.com", name: "Skye Fox", role: "user", accountType: null, company: null, workEmailVerifiedAt: null, suspended: true, createdAt: "2026-08-20T08:00:00.000Z" },
];

function stubUsersFetch() {
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ user: { suspended: String(init.body).includes("true") } });
    return Response.json({ users });
  }));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminUsers /></QueryClientProvider>);
}
const account = (email: string) => screen.getByRole("button", { name: new RegExp(email.replaceAll(".", "\\.")) });
const nextStep = () => within(screen.getByRole("region", { name: "Your next step" }));

beforeEach(stubUsersFetch);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("admin users directory", () => {
  it("renders account rows with role badges, verified marker, and Suspended badge", async () => {
    renderPage();
    await screen.findByText("avery@example.com");
    const avery = account("avery@example.com");
    const blake = account("blake@acme.com");
    const skye = account("skye@forwarder.com");
    expect(within(avery).getByText("Job Seeker")).toBeTruthy();
    expect(within(blake).getByText("Referrer")).toBeTruthy();
    expect(within(blake).getByText("Work email verified")).toBeTruthy();
    expect(within(blake).getByText(/Joined Aug 28, 2026/)).toBeTruthy();
    expect(within(skye).getByText("Suspended")).toBeTruthy();
  });

  it("filters rows client-side by email or name", async () => {
    renderPage();
    await screen.findByText("avery@example.com");
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "@acme.com" } });
    expect(screen.getByText("blake@acme.com")).toBeTruthy();
    expect(screen.queryByText("avery@example.com")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "Cole" } });
    expect(screen.getByText("avery@example.com")).toBeTruthy();
    expect(screen.queryByText("blake@acme.com")).toBeNull();
  });

  it("suspends from the confirm dialog with a server-confirmed badge update", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ user: { suspended: true } });
      return Response.json({ users });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    fireEvent.click(nextStep().getByRole("button", { name: "Suspend account" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Suspend this user?");
    expect(dialog.textContent).toContain("will lose access immediately");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend user" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/9/suspend", expect.objectContaining({ method: "POST", body: JSON.stringify({ suspended: true }), credentials: "include" })));
    await waitFor(() => expect(within(account("avery@example.com")).getByText("Suspended")).toBeTruthy());
    expect(nextStep().getByRole("button", { name: "Unsuspend account" })).toBeTruthy();
  });

  it("keeps the confirmed badge and offers retry when the suspend request fails", async () => {
    let postCount = 0;
    let serverSuspended = false;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) return Response.json({ error: "We could not update this user account" }, { status: 500 });
        serverSuspended = true;
        return Response.json({ user: { suspended: true } });
      }
      return Response.json({ users: users.map(user => user.id === 9 ? { ...user, suspended: serverSuspended } : user) });
    }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    fireEvent.click(nextStep().getByRole("button", { name: "Suspend account" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Suspend user" }));
    await screen.findByText("Update failed — We could not update this user account. The account is unchanged.");
    expect(within(account("avery@example.com")).queryByText("Suspended")).toBeNull();
    fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(account("avery@example.com")).getByText("Suspended")).toBeTruthy());
    expect(postCount).toBe(2);
  });

  it("shows the administrator-required card on a 403 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Administrator access is required" }, { status: 403 })));
    renderPage();
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    expect(screen.getByText("The users directory stays hidden without administrator access.")).toBeTruthy();
    expect(screen.getByText("Sign in with the designated administrator account.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "skipwait.me home" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText("avery@example.com")).toBeNull();
  });
});
