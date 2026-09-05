// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUsers from "./AdminUsers";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("admin-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

const users = [
  { id: 9, email: "avery@example.com", name: "Avery Cole", role: "user", accountType: "job_seeker", company: null, workEmailVerifiedAt: null, suspended: false, createdAt: "2026-09-01T08:00:00.000Z" },
  { id: 10, email: "blake@acme.com", name: "Blake Ray", role: "user", accountType: "referrer", company: "Acme", workEmailVerifiedAt: "2026-09-02T08:00:00.000Z", suspended: false, createdAt: "2026-08-28T08:00:00.000Z" },
  { id: 11, email: "skye@forwarder.com", name: "Skye Fox", role: "user", accountType: null, company: null, workEmailVerifiedAt: null, suspended: true, createdAt: "2026-08-20T08:00:00.000Z" },
];

function stubUsersFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return { ok: true, json: async () => ({ user: { suspended: String(init.body).includes("true") } }) };
    return { ok: true, json: async () => ({ users }) };
  }));
}

beforeEach(stubUsersFetch);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("admin users directory", () => {
  it("renders account rows with role badges, verified marker, and Suspended badge", async () => {
    render(<AdminUsers />);
    await waitFor(() => expect(screen.getByText("avery@example.com")).toBeTruthy());
    const avery = screen.getByText("avery@example.com").closest("li")!;
    const blake = screen.getByText("blake@acme.com").closest("li")!;
    const skye = screen.getByText("skye@forwarder.com").closest("li")!;
    expect(within(avery).getByText("Job Seeker")).toBeTruthy();
    expect(within(blake).getByText("Referrer")).toBeTruthy();
    expect(within(blake).getByText("Verified")).toBeTruthy();
    expect(within(blake).getByText(/Joined Aug 28, 2026/)).toBeTruthy();
    expect(within(skye).getByText("Suspended")).toBeTruthy();
  });

  it("filters rows client-side by email or name", async () => {
    render(<AdminUsers />);
    await waitFor(() => expect(screen.getByText("avery@example.com")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "blake" } });
    expect(screen.getByText("blake@acme.com")).toBeTruthy();
    expect(screen.queryByText("avery@example.com")).toBeNull();
  });

  it("suspends from the confirm dialog with an optimistic badge update", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, json: async () => ({ user: { suspended: true } }) };
      return { ok: true, json: async () => ({ users }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminUsers />);
    await waitFor(() => expect(screen.getByText("avery@example.com")).toBeTruthy());
    const avery = screen.getByText("avery@example.com").closest("li")!;
    fireEvent.click(within(avery).getByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Suspend this user?");
    expect(dialog.textContent).toContain("will lose access immediately");
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend user" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/9/suspend", expect.objectContaining({ method: "POST" })));
    const averyCard = screen.getByText("avery@example.com").closest("li")!;
    await waitFor(() => expect(within(averyCard).getByText("Suspended")).toBeTruthy());
    expect(averyCard.textContent).toContain("Unsuspend");
  });

  it("reverts the badge and offers Retry when the suspend request fails", async () => {
    let postCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        postCount += 1;
        return postCount === 1
          ? { ok: false, status: 500, json: async () => ({ error: "We could not update this user account" }) }
          : { ok: true, json: async () => ({ user: { suspended: true } }) };
      }
      return { ok: true, json: async () => ({ users }) };
    }));
    render(<AdminUsers />);
    await waitFor(() => expect(screen.getByText("avery@example.com")).toBeTruthy());
    const avery = screen.getByText("avery@example.com").closest("li")!;
    fireEvent.click(within(avery).getByRole("button", { name: "Suspend" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Suspend user" }));
    await waitFor(() => expect(screen.getByText(/Update failed — We could not update this user account. The account is unchanged./)).toBeTruthy());
    expect(within(avery).queryByText("Suspended")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(within(avery).getByText("Suspended")).toBeTruthy());
  });

  it("shows the administrator-required card on a 403 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 403, ok: false, json: async () => ({ error: "Administrator access is required" }) })));
    render(<AdminUsers />);
    expect(await screen.findByText("Administrator access is required")).toBeTruthy();
    expect(screen.getByText(/The users directory is available only to the designated administrator account/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to skipwait.me" })).toBeTruthy();
  });
});
