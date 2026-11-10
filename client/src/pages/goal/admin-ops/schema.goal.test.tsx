// @vitest-environment jsdom
// D-048-p3-admin-ops /admin/schema (D-048-admin.md §3): "Run reconcile" is the
// one commit and keeps the kit page's exact POST - same path, method, headers,
// cookies and no body, because only the server's allowlisted statement list may
// run (no free-form SQL input exists on either page). Status and each
// statement outcome are dot + text; loading, error+retry, denied wording and
// the empty run list are pinned. Fixtures are synthetic.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminSchema, { GOAL_PAGE } from "./GoalAdminSchema";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() } }));

// SignInButton is deliberately absent: a page that wraps GoalButton in it nests
// one <button> inside another, which only a real browser reports.
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin-schema", vi.fn()],
  useSearch: () => "",
}));

beforeEach(() => { authState.isSignedIn = true; authState.getToken.mockResolvedValue("test-token"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

const PENDING = { reconciled: false, firstError: "Unknown column 'jobFunction' in 'field list'", results: [{ statement: "ALTER TABLE jobs ADD COLUMN jobFunction VARCHAR(64) NULL", ok: false, error: "Unknown column 'jobFunction' in 'field list'" }, { statement: "CREATE TABLE IF NOT EXISTS companyDomains (id INT)", ok: true }] };
const CLEAN = { reconciled: true, firstError: null, results: [{ statement: "ALTER TABLE jobs ADD COLUMN jobFunction VARCHAR(64) NULL", ok: true }, { statement: "CREATE TABLE IF NOT EXISTS companyDomains (id INT)", ok: true }] };

type Key = "status" | "run";
function stub(overrides: Partial<Record<Key, Reply | (() => Promise<Reply>)>> = {}) {
  const pick = (key: Key, fallback: Reply): Reply | Promise<Reply> => {
    const value = overrides[key];
    return typeof value === "function" ? value() : value ?? fallback;
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return pick("run", reply(CLEAN));
    void url;
    return pick("status", reply(PENDING));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}>{ui}</QueryClientProvider>);
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const post = (fetchMock: ReturnType<typeof stub>) => {
  const found = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
  return { url: String(found?.[0]), init: found?.[1] as RequestInit | undefined };
};

describe("goal /admin/schema (D-048-p3-admin-ops)", () => {
  it("opens with the goal line and the run as the one next step", async () => {
    stub();
    const { container } = renderPage(<GoalAdminSchema />);
    expect(await screen.findByText("Not fully reconciled")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Reconcile the database schema.");
    expect(within(nextStep()).getByRole("button", { name: "Run reconcile" })).toBeTruthy();
    expect(Array.from(container.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Run reconcile"]);
  });

  it("reads the status with the kit page's GET, headers and cookies", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminSchema />);
    await screen.findByText("Not fully reconciled");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/schema/reconcile");
    expect(init).toEqual({ credentials: "include", headers: { Authorization: "Bearer test-token" } });
  });

  it("runs the same allowlisted POST with no body, and shows its result", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminSchema />);
    await screen.findByText("Not fully reconciled");
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Run reconcile" }));
    await screen.findByText("Reconciled");
    const sent = post(fetchMock);
    expect(sent.url).toBe("/api/admin/schema/reconcile");
    expect(sent.init?.method).toBe("POST");
    expect(sent.init?.body).toBeUndefined();
    expect(sent.init?.headers).toEqual({ Authorization: "Bearer test-token" });
    expect(sent.init?.credentials).toBe("include");
  });

  it("offers no free-form SQL: the only controls are the run and the sign-in", async () => {
    stub();
    const { container } = renderPage(<GoalAdminSchema />);
    await screen.findByText("Not fully reconciled");
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0);
  });

  it("lists each statement outcome as dot + text, with its error", async () => {
    stub();
    const { container } = renderPage(<GoalAdminSchema />);
    await screen.findByText("Not fully reconciled");
    expect(screen.getAllByTestId("goal-status").map(node => node.textContent)).toEqual(["Not fully reconciled", "One statement failed", "Failed", "Ran"]);
    for (const node of Array.from(container.querySelectorAll("[data-testid='goal-status']"))) expect(node.querySelector("span[aria-hidden='true']")).toBeTruthy();
    // The same server message shows twice, as on the kit page: once in the
    // first-error card and once under the statement that produced it.
    expect(screen.getAllByText("Unknown column 'jobFunction' in 'field list'")).toHaveLength(2);
  });

  it("says when nothing has run yet, without hiding the run control", async () => {
    stub({ status: reply({ reconciled: false, firstError: null, results: [] }) });
    renderPage(<GoalAdminSchema />);
    expect(await screen.findByText(/No run has happened yet in this server process/)).toBeTruthy();
    expect(screen.getByText("None recorded — the last run had no statement failures.")).toBeTruthy();
    expect(within(nextStep()).getByRole("button", { name: "Run reconcile" })).toBeTruthy();
  });

  it("shows a loading state before the first snapshot", async () => {
    stub({ status: () => new Promise<Reply>(() => {}) });
    const { container } = renderPage(<GoalAdminSchema />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText(/Per-statement results/)).toBeNull();
  });

  it("shows a failed status load with a retry that asks again", async () => {
    const fetchMock = stub({ status: reply({ error: "We could not load the schema reconcile status" }, 500) });
    renderPage(<GoalAdminSchema />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByRole("alert").textContent).toContain("We could not load the schema reconcile status");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("keeps the snapshot and surfaces a rejected run", async () => {
    stub({ run: reply({ error: "Administrator access is required" }, 403) });
    renderPage(<GoalAdminSchema />);
    await screen.findByText("Not fully reconciled");
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Run reconcile" }));
    expect(await within(nextStep()).findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Not fully reconciled")).toBeTruthy();
  });

  it("shows the denied wording without a snapshot", async () => {
    stub({ status: reply({ error: "Administrator access is required" }, 403) });
    renderPage(<GoalAdminSchema />);
    expect(await screen.findByText("Administrator access is required")).toBeTruthy();
    expect(screen.queryByText(/Per-statement results/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    const { container } = renderPage(<GoalAdminSchema />);
    const signIn = screen.getByRole("button", { name: /Sign in/ });
    expect(signIn).toBeTruthy();
    expect(signIn.closest("button")).toBe(signIn);
    expect(container.querySelector("button button")).toBeNull();
    authState.openSignIn.mockClear();
    fireEvent.click(signIn);
    expect(authState.openSignIn).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
