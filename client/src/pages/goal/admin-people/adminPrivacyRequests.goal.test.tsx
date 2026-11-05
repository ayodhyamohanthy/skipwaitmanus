// @vitest-environment jsdom
// D-048-p3-admin-people goal /admin/privacy-requests (D-048-admin.md §3-§5):
// the same people goal line, and the review keeps the kit page's exact server
// call and body - POST /api/admin/privacy-requests/:id/review with
// { status: "in_review" } plus the typed resolution note only when there is
// one (guardrail 1). Completion stays blocked: this page offers one commit and
// no way to record an erasure as done. Loading, empty, error and the access
// gate are pinned; fixtures are synthetic.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminPrivacyRequests, { GOAL_PAGE } from "./GoalAdminPrivacyRequests";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));

const REQUESTS = [
  { id: 7, kind: "erasure", status: "requested", source: "account", resolution: null, userId: 9, requesterName: "Avery Nair", requesterEmail: "avery@example.com", createdAt: "2026-10-05T09:00:00.000Z", updatedAt: "2026-10-05T09:00:00.000Z", reviewedAt: null },
  { id: 8, kind: "erasure", status: "in_review", source: "account", resolution: "Identity review started", userId: 12, requesterName: null, requesterEmail: null, createdAt: "2026-10-04T09:00:00.000Z", updatedAt: "2026-10-06T09:00:00.000Z", reviewedAt: "2026-10-06T09:00:00.000Z" },
  { id: 9, kind: "erasure", status: "completed", source: "account", resolution: "Every resource step recorded", userId: 21, requesterName: "Diya Rao", requesterEmail: "diya@example.com", createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z", reviewedAt: "2026-10-02T09:00:00.000Z" },
  { id: 10, kind: "erasure", status: "declined", source: "account", resolution: "Lawful basis to retain", userId: 24, requesterName: "Kabir Shah", requesterEmail: "kabir@example.com", createdAt: "2026-10-02T09:00:00.000Z", updatedAt: "2026-10-03T09:00:00.000Z", reviewedAt: "2026-10-03T09:00:00.000Z" },
];

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, json: async () => body });

function stub(overrides: { list?: Reply | (() => Promise<Reply>); review?: (body: unknown) => Reply } = {}) {
  const list = () => (typeof overrides.list === "function" ? overrides.list() : overrides.list ?? reply({ requests: REQUESTS }));
  const review = overrides.review ?? ((body) => reply({ request: { id: 7, status: "in_review", ...(body as object) } }));
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/review")) return review(JSON.parse(String(init?.body)));
    if (String(url).startsWith("/api/admin/privacy-requests")) return list();
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const row = (who: RegExp) => screen.getByRole("button", { name: who });
const reviewCall = (fetchMock: ReturnType<typeof stub>, index = 0) => {
  const call = fetchMock.mock.calls.filter(([url]) => String(url).includes("/review"))[index] as [string, RequestInit] | undefined;
  return call ? { url: call[0], method: call[1].method, body: JSON.parse(String(call[1].body)) } : null;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.isSignedIn = true; });

describe("goal /admin/privacy-requests (D-048-p3-admin-people)", () => {
  it("opens with the people goal line and one next step over the queue", async () => {
    stub();
    const { container } = renderPage(<GoalAdminPrivacyRequests />);
    // The queue arrives: the requester line is "Avery Nair · avery@example.com"
    // (the kit page's one line), so it is read off the row rather than as a lone node.
    expect((await screen.findByRole("button", { name: /avery@example.com/ })).textContent).toContain("avery@example.com");
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Act on people requests.");
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    expect(container.querySelector("[data-skipwait-screen='admin-privacy-requests']")).toBeTruthy();
    expect(within(nextStep()).getByRole("button", { name: "Choose a request" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("shows each request's state as dot + text", async () => {
    stub();
    renderPage(<GoalAdminPrivacyRequests />);
    await screen.findByRole("button", { name: /avery@example.com/ });
    const statuses = (await screen.findAllByTestId("goal-status")).map(node => node.textContent?.trim());
    expect(statuses).toContain("Requested");
    expect(statuses).toContain("In review");
    expect(statuses).toContain("Completed");
    expect(statuses).toContain("Declined");
  });

  it("starts a review on the kit page's exact call, with the typed note", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminPrivacyRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    fireEvent.change(screen.getByLabelText("Internal resolution note"), { target: { value: "Identity review started" } });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Start review" }));
    await waitFor(() => expect(reviewCall(fetchMock)).toBeTruthy());
    expect(reviewCall(fetchMock)).toEqual({ url: "/api/admin/privacy-requests/7/review", method: "POST", body: { status: "in_review", resolution: "Identity review started" } });
    expect(await within(row(/avery@example.com/)).findByText("In review")).toBeTruthy();
  });

  it("sends only the status when the note is left blank", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminPrivacyRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Start review" }));
    await waitFor(() => expect(reviewCall(fetchMock)).toBeTruthy());
    expect(reviewCall(fetchMock)!.body).toEqual({ status: "in_review" });
  });

  it("brings a request's recorded note back into the field, as the kit page did", async () => {
    stub();
    renderPage(<GoalAdminPrivacyRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /User 12/ }));
    const note = (await screen.findByLabelText("Internal resolution note")) as HTMLTextAreaElement;
    expect(note.value).toBe("Identity review started");
    expect(note.maxLength).toBe(500);
  });

  it("offers no way to record an erasure as complete, and says why", async () => {
    stub();
    renderPage(<GoalAdminPrivacyRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    await screen.findByRole("button", { name: "Start review" });
    // Every action control on the page, enumerated: starting a review is the only
    // one, so nothing here can record an erasure as complete (the server refuses
    // any status but in_review - server/privateReferralRoutes.ts:1683).
    expect(screen.getAllByTestId("goal-button").map(node => node.textContent?.trim())).toEqual(["Start review"]);
    expect(screen.getByText("Completion is blocked until a verified erasure workflow records every resource step and any approved retained-data exception.")).toBeTruthy();
  });

  it("surfaces the server's refusal in its own words", async () => {
    stub({ review: () => reply({ error: "Completion is blocked until a verified erasure workflow records every resource step and retained-data exception. This endpoint can only start review." }, 409) });
    renderPage(<GoalAdminPrivacyRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /avery@example.com/ }));
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Start review" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This endpoint can only start review.");
  });

  it("shows a loading state without claiming an empty queue", async () => {
    stub({ list: () => new Promise<Reply>(() => {}) });
    const { container } = renderPage(<GoalAdminPrivacyRequests />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("Nothing is waiting for review.")).toBeNull();
  });

  it("says so honestly when no request is waiting", async () => {
    stub({ list: reply({ requests: [] }) });
    renderPage(<GoalAdminPrivacyRequests />);
    expect(await screen.findByText("Nothing is waiting for review.")).toBeTruthy();
  });

  it("shows a failed load with a retry that runs the request again", async () => {
    const fetchMock = stub({ list: reply({ error: "boom" }, 500) });
    renderPage(<GoalAdminPrivacyRequests />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    const before = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/privacy-requests")).length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/privacy-requests")).length).toBeGreaterThan(before));
  });

  it("keeps the requests hidden without administrator access", async () => {
    stub({ list: reply({ error: "Administrator access is required" }, 403) });
    renderPage(<GoalAdminPrivacyRequests />);
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    expect(screen.queryByText(/avery@example.com|diya@example.com/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    renderPage(<GoalAdminPrivacyRequests />);
    expect(screen.getByRole("button", { name: /Sign in/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
