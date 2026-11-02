// @vitest-environment jsdom
// D-048-p3-employer-talent (docs/plans/D-048-employer.md §3, §4 rules 1a and 2,
// §5): the goal /employer/talent opens "Meet opt-in talent." It renders the
// server's talent privacy states and never relaxes them: a locked row shows
// only what the list endpoint returns, unlock goes through the same server
// call, a low balance (402) restores the row and routes to billing, the
// profile is fetched only for an unlocked row, the intro goes through the
// platform. Anonymization is stated beside every profile action, and no
// employer-facing string says "credit"/"credits" (rule 1a). Fixtures are
// synthetic.
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalEmployerTalent, { GOAL_PAGE, TALENT_UNLOCK_COST } from "./GoalEmployerTalent";

const { go, toast } = vi.hoisted(() => ({ go: vi.fn(), toast: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/employer/talent", go] }));
vi.mock("sonner", () => ({ toast }));

type Reply = { ok: boolean; status: number; headers: Headers; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body });

const LOCKED = { displayRef: "Talent #A1", headline: "Backend engineer", location: "Pune", skills: ["Go", "Postgres"], isUnlocked: false };
const UNLOCKED = { displayRef: "Talent #B2", headline: "Product designer", location: null, skills: ["Figma"], isUnlocked: true };
const PROFILE = { displayRef: "Talent #B2", headline: "Product designer", location: null, skills: ["Figma"], experience: "6 years in fintech", expertise: "Design systems" };

type Route = (url: string, init?: RequestInit) => Reply | Promise<Reply>;
function stub(overrides: { talent?: Route; account?: Route; unlock?: Route; profile?: Route; intro?: Route } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/unlock")) return (overrides.unlock ?? (() => reply({ unlocked: true, remaining: 15 })))(url, init);
    if (url.endsWith("/intro")) return (overrides.intro ?? (() => reply({ ok: true })))(url, init);
    if (url.startsWith("/api/employer/talent/")) return (overrides.profile ?? (() => reply({ profile: PROFILE })))(url, init);
    if (url.startsWith("/api/employer/talent")) return (overrides.talent ?? (() => reply({ talent: [LOCKED, UNLOCKED] })))(url, init);
    if (url === "/api/employer/account") return (overrides.account ?? (() => reply({ account: { credits: 20 } })))(url, init);
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const calls = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? "GET"} ${url}`);
const card = (ref: string) => screen.getByRole("listitem", { name: ref });

beforeEach(() => { go.mockReset(); toast.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /employer/talent (D-048-p3-employer-talent)", () => {
  it("opens with the goal line, the balance in plain words and anonymization beside every profile action", async () => {
    stub();
    const { container } = render(<GoalEmployerTalent />);
    expect(await screen.findByRole("listitem", { name: "Talent #A1" })).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Meet opt-in talent.");
    expect(container.querySelector("[data-goal-page='employer-talent']")).toBeTruthy();
    expect(screen.getByText(/Talent unlock balance/).textContent).toContain("20");
    for (const ref of ["Talent #A1", "Talent #B2"]) expect(within(card(ref)).getByText(/without a name or contact details/i)).toBeTruthy();
    expect(within(card("Talent #A1")).getByText("Locked")).toBeTruthy();
    expect(within(card("Talent #B2")).getByText("Unlocked")).toBeTruthy();
    expect(within(card("Talent #A1")).queryByRole("button", { name: /View profile/ })).toBeNull();
    expect(within(card("Talent #A1")).getByRole("button", { name: `Unlock profile · costs ${TALENT_UNLOCK_COST}` })).toBeTruthy();
  });

  it("never says credit or credits to an employer (rule 1a)", async () => {
    stub();
    const { container } = render(<GoalEmployerTalent />);
    await screen.findByRole("listitem", { name: "Talent #A1" });
    expect(container.textContent ?? "").not.toMatch(/\bcredits?\b/i);
  });

  it("keeps the kit page's unlock cost (no retyped money line)", () => {
    const kit = readFileSync(join(process.cwd(), "client/src/pages/TalentDiscovery.tsx"), "utf8");
    expect(kit).toMatch(new RegExp(`const UNLOCK_CREDIT_COST = ${TALENT_UNLOCK_COST};`));
  });

  it("unlocks through the same server call and updates the balance from the server", async () => {
    const fetchMock = stub();
    render(<GoalEmployerTalent />);
    fireEvent.click(await screen.findByRole("button", { name: `Unlock profile · costs ${TALENT_UNLOCK_COST}` }));
    await waitFor(() => expect(calls(fetchMock)).toContain("POST /api/employer/talent/Talent%20%23A1/unlock"));
    await waitFor(() => expect(within(card("Talent #A1")).getByText("Unlocked")).toBeTruthy());
    expect(screen.getByText(/Talent unlock balance/).textContent).toContain("15");
  });

  it("restores the row and routes to billing when the balance is too low (402)", async () => {
    stub({ unlock: () => reply({ error: "Not enough credits" }, 402) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await screen.findByRole("button", { name: `Unlock profile · costs ${TALENT_UNLOCK_COST}` }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/employer/billing"));
    expect(within(card("Talent #A1")).getByText("Locked")).toBeTruthy();
    expect(screen.getByText(/Talent unlock balance/).textContent).toContain("20");
    expect(String(toast.mock.calls.at(-1)?.[0])).not.toMatch(/\bcredits?\b/i);
  });

  it("opens an unlocked profile only through the profile endpoint and shows only the fields it returns", async () => {
    const fetchMock = stub();
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: "Talent #B2" })).findByRole("button", { name: /View profile/ }));
    expect(await within(card("Talent #B2")).findByText(/6 years in fintech/)).toBeTruthy();
    expect(calls(fetchMock)).toContain("GET /api/employer/talent/Talent%20%23B2");
    expect(calls(fetchMock).some(line => line.includes("Talent%20%23A1") && !line.endsWith("/unlock"))).toBe(false);
  });

  it("sends the intro through the platform and marks it sent", async () => {
    const fetchMock = stub();
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: "Talent #B2" })).findByRole("button", { name: /Send intro request/ }));
    await waitFor(() => expect(calls(fetchMock)).toContain("POST /api/employer/talent/Talent%20%23B2/intro"));
    expect(await within(card("Talent #B2")).findByText("Intro sent")).toBeTruthy();
  });

  it("searches with the same query parameters", async () => {
    const fetchMock = stub();
    render(<GoalEmployerTalent />);
    await screen.findByRole("listitem", { name: "Talent #A1" });
    fireEvent.change(screen.getByLabelText("Search talent"), { target: { value: "go" } });
    fireEvent.change(screen.getByLabelText("Filter by location"), { target: { value: "Pune" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls(fetchMock)).toContain("GET /api/employer/talent?query=go&location=Pune"));
  });

  it("shows a loading state without claiming an empty list", () => {
    stub({ talent: () => new Promise<Reply>(() => {}) });
    render(<GoalEmployerTalent />);
    expect(screen.getByRole("status", { name: /Loading talent/ })).toBeTruthy();
    expect(screen.queryByText(/No opt-in talent matches yet/)).toBeNull();
  });

  it("says so honestly when no opt-in talent matches", async () => {
    stub({ talent: () => reply({ talent: [] }) });
    render(<GoalEmployerTalent />);
    expect(await screen.findByText("No opt-in talent matches yet.")).toBeTruthy();
  });

  it("shows a failed load with a retry that runs the request again", async () => {
    let fail = true;
    const fetchMock = stub({ talent: () => (fail ? reply({ error: "Employer access is required" }, 403) : reply({ talent: [LOCKED] })) });
    render(<GoalEmployerTalent />);
    expect(await screen.findByText("Employer access is required")).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: "Talent #A1" })).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("listitem", { name: "Talent #A1" })).toBeTruthy();
    expect(calls(fetchMock).filter(line => line.startsWith("GET /api/employer/talent")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("goal employer-talent sources", () => {
  it("carry no inline hex colour", () => {
    const source = readFileSync(join(process.cwd(), "client/src/pages/goal/employer-talent/GoalEmployerTalent.tsx"), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
