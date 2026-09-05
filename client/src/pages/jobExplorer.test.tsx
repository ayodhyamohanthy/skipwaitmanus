// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import JobExplorer from "./JobExplorer";

const { isSignedIn } = vi.hoisted(() => ({ isSignedIn: { value: true } }));
const go = vi.fn();

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: isSignedIn.value }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/jobs", go] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const jobs = [
  { id: 11, title: "Senior Product Designer", company: "Acme", location: "Bengaluru", seniority: "Senior", workMode: "Hybrid" },
  { id: 12, title: "Backend Engineer", company: "Globex", location: "Remote", seniority: "Mid", workMode: "Remote" },
];

function stubFetch(overrides: { jobsOk?: boolean; savedError?: boolean; toggleError?: boolean } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/saved-roles/") && init?.method === "POST") return overrides.toggleError ? { ok: false, status: 500, json: async () => ({ error: "We could not update your saved roles" }) } : { ok: true, json: async () => ({ saved: true }) };
    if (url === "/api/saved-roles") return overrides.savedError ? { ok: false, status: 500, json: async () => ({ error: "boom" }) } : { ok: true, json: async () => ({ saved: [{ jobId: 12 }] }) };
    return { ok: overrides.jobsOk !== false, json: async () => ({ jobs }) };
  }));
}

beforeEach(() => { isSignedIn.value = true; stubFetch(); });
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("JobExplorer", () => {
  it("renders job cards with the muted context line and a saved marker for already-saved roles", async () => {
    render(<JobExplorer />);
    await waitFor(() => expect(screen.getByText("Senior Product Designer")).toBeTruthy());
    expect(screen.getByText("Acme · Bengaluru · Senior · Hybrid")).toBeTruthy();
    const savedCard = screen.getByText("Backend Engineer").closest("li")!;
    expect(savedCard.textContent).toContain("Saved");
  });

  it("toggles save optimistically and reverts with a toast when the server fails", async () => {
    stubFetch({ toggleError: true });
    render(<JobExplorer />);
    await waitFor(() => expect(screen.getByText("Senior Product Designer")).toBeTruthy());
    const card = screen.getByText("Senior Product Designer").closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    expect(within(card).getByRole("button", { name: "Saved" })).toBeTruthy();
    await waitFor(() => expect(within(card).getByRole("button", { name: "Save" })).toBeTruthy());
    const { toast } = await import("sonner");
    expect(toast).toHaveBeenCalled();
  });

  it("shows the empty state for a search with no matches", async () => {
    stubFetch();
    render(<JobExplorer />);
    await waitFor(() => expect(screen.getByText("Senior Product Designer")).toBeTruthy());
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jobs: [] }) })));
    fireEvent.change(screen.getByLabelText("Search roles"), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No jobs match. Try a broader search.")).toBeTruthy();
  });

  it("shows the error card with Try again when the jobs request fails", async () => {
    stubFetch({ jobsOk: false });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "We could not load the job list" }) })));
    render(<JobExplorer />);
    expect(await screen.findByText("We could not load the job list")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("gates the save action behind sign-in for signed-out visitors", async () => {
    isSignedIn.value = false;
    render(<JobExplorer />);
    await waitFor(() => expect(screen.getByText("Senior Product Designer")).toBeTruthy());
    const card = screen.getByText("Senior Product Designer").closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Sign in to save roles.")).toBeTruthy();
  });
});
