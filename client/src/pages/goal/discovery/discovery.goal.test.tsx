// @vitest-environment jsdom
// D-048-p3-discovery: the goal /wall and /jobs (packet docs/plans/D-048-marketing.md).
// Pins: goal-page contract (one h1 goal line, one next step holding the one
// black commit, no kit classes), D-040 labelling (a paid placement stays
// labelled; partner tips stay labelled), the anonymity line, the referral
// draft hand-off, and the loading / empty / error states. Fixtures are
// synthetic (example domains only).
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { readReferralDraft } from "@/lib/pwaContinuity";
import GoalWall, { GOAL_PAGE as WALL_GOAL } from "./GoalWall";
import GoalJobs, { GOAL_PAGE as JOBS_GOAL } from "./GoalJobs";

const { auth, go } = vi.hoisted(() => ({ auth: { isSignedIn: false }, go: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: auth.isSignedIn }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>, useLocation: () => ["/", go] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

type Json = Record<string, unknown>;
const ok = (body: Json) => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => body, text: async () => JSON.stringify(body) });
const fail = (body: Json, status = 500) => ({ ok: false, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body, text: async () => JSON.stringify(body) });

const opening = (over: Json = {}) => ({ id: 1, companyDomain: "synthetic.example", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.synthetic.example/jobs/design", location: "Remote", compensation: null, walkInAt: null, walkInEndsAt: null, createdAt: "2026-10-01T00:00:00.000Z", poster: { kind: "anonymous" }, ...over });

function stubWall({ opportunities = [opening()], partners = [], companies = [], wallStatus = 200 }: { opportunities?: Json[]; partners?: Json[]; companies?: Json[]; wallStatus?: number } = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/partners/")) return ok({});
    if (url === "/api/partners") return ok({ modules: partners });
    if (url === "/api/companies") return ok({ companies });
    return wallStatus === 200 ? ok({ opportunities }) : fail({ error: "Openings are unavailable right now" }, wallStatus);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const jobs = [
  { id: 11, title: "Senior Product Designer", company: "Synthetic Co", location: "Bengaluru", seniority: "Senior", workMode: "Hybrid", targetRoleUrl: "https://careers.synthetic.example/jobs/11" },
  { id: 12, title: "Backend Engineer", company: "Example Labs", location: "Remote", seniority: "Mid", workMode: "Remote", targetRoleUrl: null },
];

function stubJobs({ list = jobs, jobsStatus = 200, saved = [] as number[], toggleStatus = 200 } = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/saved-roles/")) return toggleStatus === 200 ? ok({ saved: init?.method === "PUT" }) : fail({ error: "We could not update your saved roles" });
    if (url === "/api/saved-roles") return ok({ saved: saved.map(jobId => ({ jobId })) });
    return jobsStatus === 200 ? ok({ jobs: list }) : fail({ error: "We could not load the job list" }, jobsStatus);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => { localStorage.clear(); auth.isSignedIn = false; window.history.replaceState(null, "", "/"); });
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("goal /wall", () => {
  it("meets the goal-page contract with the anonymity line and one black commit", async () => {
    stubWall();
    const { container } = render(<GoalWall />);
    await screen.findByRole("heading", { level: 2, name: "Product Designer" });
    assertGoalPage(container, WALL_GOAL);
    expect(WALL_GOAL.goalLine).toBe("See openings shared by verified employees.");
    expect(screen.getByText(/never shows an employee name, a candidate name or a resume/)).toBeTruthy();
    expect(screen.getByText("Identity hidden")).toBeTruthy();
    expect(container.textContent).not.toMatch(/@/);
  });

  it("hands the chosen opening to /start as the referral draft", async () => {
    stubWall({ opportunities: [opening({ compensation: "₹12–18 LPA" })] });
    render(<GoalWall />);
    await screen.findByRole("heading", { level: 2, name: "Product Designer" });
    fireEvent.click(screen.getByRole("button", { name: "Request a referral" }));
    expect(localStorage.getItem("bridge-target-url")).toBe("https://careers.synthetic.example/jobs/design");
    expect(localStorage.getItem("bridge-target-compensation")).toBe("₹12–18 LPA");
    expect(readReferralDraft()?.targetUrl).toBe("https://careers.synthetic.example/jobs/design");
    expect(go).toHaveBeenCalledWith("/start");
  });

  it("keeps a paid placement labelled (D-040) and an organic one marked as employee-shared", async () => {
    stubWall({ opportunities: [opening({ id: 1, roleTitle: "Data Analyst", isSponsored: true }), opening({ id: 2, roleTitle: "QA Engineer" })] });
    render(<GoalWall />);
    const list = await screen.findByRole("list", { name: "Openings" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0].textContent).toContain("Featured listing · paid placement");
    expect(rows[1].textContent).toContain("Employee-shared opening");
    expect(rows[1].textContent).not.toContain("Featured listing");
    // The selected sponsored opening's detail says so too.
    const step = screen.getByRole("region", { name: "Your next step" });
    expect(step.textContent).toContain("Featured listing · paid placement");
  });

  it("selects another opening and shows a named poster only when they chose to", async () => {
    stubWall({ opportunities: [opening({ id: 1 }), opening({ id: 2, roleTitle: "QA Engineer", poster: { kind: "firstName", firstName: "Ravi" } })], companies: [{ slug: "synthetic", name: "Synthetic Co", domains: ["synthetic.example"] }] });
    render(<GoalWall />);
    await screen.findByRole("heading", { level: 2, name: "Product Designer" });
    fireEvent.click(screen.getByRole("button", { name: /QA Engineer/ }));
    expect(screen.getByRole("heading", { level: 2, name: "QA Engineer" })).toBeTruthy();
    expect(screen.getByText("Posted by Ravi")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Synthetic Co" })[0].getAttribute("href")).toBe("/explore/synthetic"));
  });

  it("opens the deep-linked opening from ?opening=<id>", async () => {
    window.history.replaceState(null, "", "/wall?opening=2");
    stubWall({ opportunities: [opening({ id: 1 }), opening({ id: 2, roleTitle: "QA Engineer" })] });
    render(<GoalWall />);
    expect(await screen.findByRole("heading", { level: 2, name: "QA Engineer" })).toBeTruthy();
  });

  it("labels partner tips and keeps them out of the referral commit", async () => {
    stubWall({ opportunities: [opening({ id: 1 }), opening({ id: 2, roleTitle: "B" }), opening({ id: 3, roleTitle: "C" })], partners: [{ id: 7, partnerName: "Prep Partner", headline: "Practice interviews", description: null, ctaLabel: "Try it", ctaUrl: "https://partner.synthetic.example" }] });
    render(<GoalWall />);
    await screen.findByRole("heading", { level: 2, name: "Product Designer" });
    expect(screen.getByText("Partner tip · Prep Partner")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Try it/ }).getAttribute("target")).toBe("_blank");
  });

  it("a walk-in without a role link explains itself instead of committing", async () => {
    stubWall({ opportunities: [opening({ kind: "walk_in", targetRoleUrl: null, walkInAt: "2026-11-02T04:30:00.000Z" })] });
    const { container } = render(<GoalWall />);
    await screen.findByRole("heading", { level: 2, name: "Product Designer" });
    assertGoalPage(container, WALL_GOAL);
    const commit = screen.getByRole("button", { name: "Request a referral" });
    expect(commit.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/no role link yet/)).toBeTruthy();
    fireEvent.click(commit);
    expect(go).not.toHaveBeenCalled();
  });

  it("an empty wall still meets the contract and offers a referral request", async () => {
    stubWall({ opportunities: [] });
    const { container } = render(<GoalWall />);
    await screen.findByText("No openings shared yet.");
    assertGoalPage(container, WALL_GOAL);
    fireEvent.click(screen.getByRole("button", { name: "Request a referral" }));
    expect(go).toHaveBeenCalledWith("/start");
  });

  it("shows loading, then a plain error with a retry that refetches", async () => {
    const fetch = stubWall({ wallStatus: 503 });
    render(<GoalWall />);
    expect(screen.getByTestId("goal-skeleton-rows")).toBeTruthy();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load openings");
    const before = fetch.mock.calls.filter(([url]) => String(url) === "/api/opportunities").length;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetch.mock.calls.filter(([url]) => String(url) === "/api/opportunities").length).toBe(before + 1));
  });
});

describe("goal /jobs", () => {
  it("meets the goal-page contract with save and paste as quiet actions", async () => {
    stubJobs();
    const { container } = render(<GoalJobs />);
    await screen.findByRole("heading", { level: 2, name: "Senior Product Designer" });
    assertGoalPage(container, JOBS_GOAL);
    expect(JOBS_GOAL.goalLine).toBe("Browse roles worth a referral.");
    expect(screen.getByRole("button", { name: "Paste it instead." })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Save/ }).length).toBeGreaterThan(0);
  });

  it("carries the selected job into the referral draft", async () => {
    stubJobs();
    localStorage.setItem("bridge-target-compensation", "Old");
    localStorage.setItem("skipwait-job-source", "sample");
    render(<GoalJobs />);
    await screen.findByRole("heading", { level: 2, name: "Senior Product Designer" });
    fireEvent.click(screen.getByRole("button", { name: "Request a referral" }));
    expect(readReferralDraft()?.targetUrl).toBe("https://careers.synthetic.example/jobs/11");
    expect(localStorage.getItem("bridge-target-url")).toBe("https://careers.synthetic.example/jobs/11");
    expect(localStorage.getItem("bridge-target-compensation")).toBeNull();
    expect(localStorage.getItem("skipwait-job-source")).toBeNull();
    expect(go).toHaveBeenCalledWith("/start");
  });

  it("a role without a job link cannot commit and says why", async () => {
    stubJobs();
    render(<GoalJobs />);
    await screen.findByRole("heading", { level: 2, name: "Senior Product Designer" });
    fireEvent.click(screen.getByRole("button", { name: /Backend Engineer/ }));
    const commit = screen.getByRole("button", { name: "Request a referral" });
    expect(commit.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/This role has no job link/)).toBeTruthy();
    fireEvent.click(commit);
    expect(go).not.toHaveBeenCalled();
  });

  it("signed in, saves a role and filters to saved roles", async () => {
    auth.isSignedIn = true;
    const fetch = stubJobs({ saved: [12] });
    render(<GoalJobs />);
    await screen.findByRole("heading", { level: 2, name: "Senior Product Designer" });
    await screen.findByRole("button", { name: /^Saved roles/, pressed: false });
    fireEvent.click(screen.getByRole("button", { name: "Save Senior Product Designer" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/saved-roles/11", expect.objectContaining({ method: "PUT" })));
    fireEvent.click(screen.getByRole("button", { name: /^Saved roles/, pressed: false }));
    const list = screen.getByRole("list", { name: "Roles" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("signed out, Save opens the sign-in step instead of saving", async () => {
    const fetch = stubJobs();
    render(<GoalJobs />);
    await screen.findByRole("heading", { level: 2, name: "Senior Product Designer" });
    fireEvent.click(screen.getByRole("button", { name: "Save Senior Product Designer" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to save roles." })).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => String(url).startsWith("/api/saved-roles/"))).toBe(false);
  });

  it("shows the honest empty state and still offers the paste path as the commit", async () => {
    stubJobs({ list: [] });
    const { container } = render(<GoalJobs />);
    await screen.findByText("No jobs match. Try a broader search.");
    assertGoalPage(container, JOBS_GOAL);
    fireEvent.click(screen.getByRole("button", { name: "Paste a job link" }));
    expect(go).toHaveBeenCalledWith("/start");
  });

  it("shows a plain error with a retry", async () => {
    const fetch = stubJobs({ jobsStatus: 500 });
    render(<GoalJobs />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load the job list");
    const before = fetch.mock.calls.length;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(before));
  });

  it("keeps the canonical ?q= search URL and seeds the search from it", async () => {
    window.history.replaceState(null, "", "/jobs?q=designer");
    const fetch = stubJobs();
    render(<GoalJobs />);
    await screen.findByRole("heading", { level: 2, name: "Senior Product Designer" });
    expect(fetch).toHaveBeenCalledWith("/api/jobs?query=designer");
    expect(window.location.search).toBe("?q=designer");
    expect((screen.getByRole("searchbox", { name: "Search roles" }) as HTMLInputElement).value).toBe("designer");
  });
});
