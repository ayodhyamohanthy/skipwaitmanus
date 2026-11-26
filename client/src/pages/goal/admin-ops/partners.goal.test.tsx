// @vitest-environment jsdom
// D-048-p3-admin-ops /admin/partners (D-048-admin.md §3): the B2B inventory in
// goal UI. Every call is the kit page's own — the two parallel GETs, the 403
// that denies the whole surface, the create POST with the kit form's exact JSON
// body and key order, the optimistic pause PATCH and its revert copy, and the
// end-sponsorship POST with no body. The one change a goal page forces is the
// commit: the kit's per-row destructive button becomes an explicit choice plus
// one "End sponsorship", so nothing ends until the admin selects a role.
// Fixtures are synthetic.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminPartners, { GOAL_PAGE } from "./GoalAdminPartners";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() } }));

// SignInButton is deliberately absent: a page that wraps GoalButton in it nests
// one <button> inside another, which only a real browser reports.
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin-partners", vi.fn()],
  useSearch: () => "",
}));

beforeEach(() => { authState.isSignedIn = true; authState.getToken.mockResolvedValue("test-token"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

const ACTIVE_MODULE = { id: 7, partnerName: "PrepLab", category: "interview_prep", headline: "Mock interviews with senior engineers", description: "Practice before you apply.", targetRoles: "frontend, react", ctaLabel: "Learn more", ctaUrl: "https://preplab.example/tool", isActive: true, impressions: 128, clicks: 9 };
const PAUSED_MODULE = { id: 8, partnerName: "VetRight", category: "resume_vetting", headline: "Resume check", description: null, targetRoles: null, ctaLabel: "Try it", ctaUrl: "https://vetright.example", isActive: false, impressions: 0, clicks: 0 };
const WEEK_SPONSOR = { id: 4, companyDomain: "acme.example", roleTitle: "Senior Frontend Engineer", sponsoredTier: "week", sponsoredUntil: "2026-11-30T00:00:00.000Z" };
const OPEN_SPONSOR = { id: 5, companyDomain: "globex.example", roleTitle: "Data Analyst", sponsoredTier: null, sponsoredUntil: null };

type Key = "modules" | "sponsorships" | "create" | "patch" | "end";
function stub(overrides: Partial<Record<Key, Reply | (() => Promise<Reply>)>> = {}) {
  const pick = (key: Key, fallback: Reply): Reply | Promise<Reply> => {
    const value = overrides[key];
    return typeof value === "function" ? value() : value ?? fallback;
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && path.includes("/end-sponsorship")) return pick("end", reply({ ok: true }));
    if (method === "PATCH") return pick("patch", reply({ module: {} }));
    if (method === "POST") return pick("create", reply({ module: {} }));
    if (path.includes("/api/admin/sponsorships")) return pick("sponsorships", reply({ sponsorships: [WEEK_SPONSOR, OPEN_SPONSOR] }));
    return pick("modules", reply({ modules: [ACTIVE_MODULE, PAUSED_MODULE] }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}>{ui}</QueryClientProvider>);
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const callsTo = (fetchMock: ReturnType<typeof stub>, predicate: (url: string, init: RequestInit | undefined) => boolean) => fetchMock.mock.calls.filter(([url, init]) => predicate(String(url), init as RequestInit | undefined));
const sent = (fetchMock: ReturnType<typeof stub>, predicate: (url: string, init: RequestInit | undefined) => boolean) => {
  const found = fetchMock.mock.calls.find(([url, init]) => predicate(String(url), init as RequestInit | undefined));
  return { url: String(found?.[0]), init: found?.[1] as RequestInit | undefined };
};
const shown = async (text: string | RegExp) => screen.findByText(text);
const statusLabels = (container: HTMLElement) => Array.from(container.querySelectorAll("[data-testid='goal-status']")).map(node => node.textContent);
const loaded = async () => { await shown("Mock interviews with senior engineers"); };
const sponsoredTab = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Sponsored roles/ }));
  await shown("Senior Frontend Engineer");
};

describe("goal /admin/partners (D-048-p3-admin-ops)", () => {
  it("opens with the goal line and the module form as the one next step", async () => {
    stub();
    const { container } = renderPage(<GoalAdminPartners />);
    await loaded();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Curate partner slots and sponsored roles.");
    expect(Array.from(container.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Create module"]);
  });

  it("reads both inventories with the kit page's GETs, bearer and cookies", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminPartners />);
    await loaded();
    const reads = callsTo(fetchMock, (url, init) => init?.method === undefined && url.startsWith("/api/admin/")).map(([url]) => String(url)).sort();
    expect(reads).toEqual(["/api/admin/partners", "/api/admin/sponsorships"]);
    for (const [, init] of callsTo(fetchMock, url => url.startsWith("/api/admin/"))) {
      expect(init).toEqual({ headers: { Authorization: "Bearer test-token" }, credentials: "include" });
    }
  });

  it("lists each slot with the kit row's own meta line, figures and CTA", async () => {
    stub();
    const { container } = renderPage(<GoalAdminPartners />);
    await loaded();
    expect(await shown("PrepLab · Interview prep · frontend, react")).toBeTruthy();
    expect(await shown("VetRight · Resume vetting · All roles")).toBeTruthy();
    expect(container.textContent).toContain("128 views · 9 clicks");
    expect(await shown("https://preplab.example/tool")).toBeTruthy();
    expect(statusLabels(container)).toEqual(["Active", "Paused"]);
  });

  it("keeps the kit form's required fields, including the URL check", async () => {
    stub();
    const { container } = renderPage(<GoalAdminPartners />);
    await loaded();
    const required = Array.from(container.querySelectorAll<HTMLInputElement>("input[required], textarea[required]"));
    expect(required.map(node => node.type).sort()).toEqual(["text", "text", "text", "url"]);
    expect(within(nextStep()).getByRole("combobox", { name: "Category" }).textContent).toContain("Interview prep");
  });

  it("posts the kit form's exact JSON body, then resets and reloads the inventory", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminPartners />);
    await loaded();
    const form = nextStep();
    fireEvent.change(within(form).getByLabelText("Partner name"), { target: { value: "PrepLab" } });
    fireEvent.change(within(form).getByLabelText("Category"), { target: { value: "skill_assessment" } });
    fireEvent.change(within(form).getByLabelText("Headline"), { target: { value: "Assess the stack" } });
    fireEvent.change(within(form).getByLabelText("Target roles (comma-separated keywords)"), { target: { value: "node, react" } });
    fireEvent.change(within(form).getByLabelText("Description"), { target: { value: "Twenty-minute technical check." } });
    fireEvent.change(within(form).getByLabelText("CTA label"), { target: { value: "Book a check" } });
    fireEvent.change(within(form).getByLabelText("CTA URL"), { target: { value: "https://assess.example/tool" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create module" }));

    await waitFor(() => expect(callsTo(fetchMock, (_url, init) => init?.method === "POST")).toHaveLength(1));
    const posted = sent(fetchMock, (_url, init) => init?.method === "POST");
    const body = JSON.parse(String(posted.init?.body)) as Record<string, string>;
    expect(Object.keys(body)).toEqual(["partnerName", "category", "headline", "description", "targetRoles", "ctaLabel", "ctaUrl"]);
    expect(body).toEqual({ partnerName: "PrepLab", category: "skill_assessment", headline: "Assess the stack", description: "Twenty-minute technical check.", targetRoles: "node, react", ctaLabel: "Book a check", ctaUrl: "https://assess.example/tool" });
    expect(posted.url).toBe("/api/admin/partners");
    expect(posted.init?.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer test-token" });
    expect(posted.init?.credentials).toBe("include");

    // The kit page clears the form and reloads both lists after a create.
    await waitFor(() => expect(callsTo(fetchMock, (url, init) => init?.method === undefined && url.startsWith("/api/admin/"))).toHaveLength(4));
    expect((within(nextStep()).getByLabelText("Headline") as HTMLInputElement).value).toBe("");
    expect((within(nextStep()).getByLabelText("CTA label") as HTMLInputElement).value).toBe("Learn more");
  });

  it("paints the pause before the PATCH answers, as the kit page does", async () => {
    let settle: ((reply: Reply) => void) | undefined;
    const fetchMock = stub({ patch: () => new Promise<Reply>(resolve => { settle = resolve; }) });
    const { container } = renderPage(<GoalAdminPartners />);
    await loaded();
    expect(statusLabels(container)).toEqual(["Active", "Paused"]);
    fireEvent.click(screen.getByRole("button", { name: "Pause module" }));
    await waitFor(() => expect(statusLabels(container)).toEqual(["Paused", "Paused"]));
    settle?.(reply({ module: {} }));
    await waitFor(() => expect(callsTo(fetchMock, (_u, init) => init?.method === "PATCH")).toHaveLength(1));
    const patch = sent(fetchMock, (_u, init) => init?.method === "PATCH");
    expect(patch.url).toBe("/api/admin/partners/7");
    expect(patch.init?.body).toBe(JSON.stringify({ isActive: false }));
    expect(patch.init?.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer test-token" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reverts the row and shows the kit page's exact revert copy", async () => {
    stub({ patch: reply({ error: "We could not update the partner module" }, 500) });
    const { container } = renderPage(<GoalAdminPartners />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Activate module" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('We could not update "Resume check". The module is unchanged — try again.');
    await waitFor(() => expect(statusLabels(container)).toEqual(["Active", "Paused"]));
  });

  it("ends a chosen sponsorship with the kit POST and no body, then drops the row", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminPartners />);
    await loaded();
    await sponsoredTab();
    fireEvent.click(screen.getByRole("radio", { name: /Senior Frontend Engineer/ }));
    fireEvent.click(within(nextStep()).getByRole("button", { name: "End sponsorship" }));
    await waitFor(() => expect(callsTo(fetchMock, url => url.includes("/end-sponsorship"))).toHaveLength(1));
    const ended = sent(fetchMock, url => url.includes("/end-sponsorship"));
    expect(ended.url).toBe("/api/admin/opportunities/4/end-sponsorship");
    expect(ended.init).toEqual({ method: "POST", headers: { Authorization: "Bearer test-token" }, credentials: "include" });
    expect(ended.init?.body).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Senior Frontend Engineer/ })).toBeNull());
    expect(screen.getByRole("radio", { name: /Data Analyst/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sponsored roles/ }).textContent).toContain("1");
  });

  it("holds the destructive commit until a role is chosen and sends nothing", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminPartners />);
    await loaded();
    await sponsoredTab();
    const commit = within(nextStep()).getByRole("button", { name: "End sponsorship" });
    expect(commit.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Choose a sponsored role first.")).toBeTruthy();
    fireEvent.click(commit);
    expect(callsTo(fetchMock, url => url.includes("/end-sponsorship"))).toHaveLength(0);
  });

  it("shows the audit line with the kit row's tier and expiry wording", async () => {
    stub();
    renderPage(<GoalAdminPartners />);
    await loaded();
    await sponsoredTab();
    expect(await shown(/^acme\.example · Tier: week · Until /)).toBeTruthy();
    expect(await shown("globex.example")).toBeTruthy();
  });

  it("surfaces the kit's failure copy and keeps the sponsorship listed", async () => {
    stub({ end: reply({ error: "Sponsorship could not be ended" }, 500) });
    renderPage(<GoalAdminPartners />);
    await loaded();
    await sponsoredTab();
    fireEvent.click(screen.getByRole("radio", { name: /Data Analyst/ }));
    fireEvent.click(within(nextStep()).getByRole("button", { name: "End sponsorship" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not end this sponsorship");
    expect(screen.getByRole("radio", { name: /Data Analyst/ })).toBeTruthy();
  });

  it("shows a loading state before the first inventory instead of claiming zero slots", async () => {
    stub({ modules: () => new Promise<Reply>(() => {}) });
    const { container } = renderPage(<GoalAdminPartners />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("No partner modules yet.")).toBeNull();
    expect(screen.queryByText("Mock interviews with senior engineers")).toBeNull();
  });

  it("shows a failed load with a retry that asks again", async () => {
    const fetchMock = stub({ modules: reply({}, 500) });
    renderPage(<GoalAdminPartners />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByRole("alert").textContent).toContain("We could not load partner modules");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("says when an inventory is genuinely empty, and keeps the commit inert", async () => {
    stub({ modules: reply({ modules: [] }), sponsorships: reply({ sponsorships: [] }) });
    renderPage(<GoalAdminPartners />);
    expect(await shown("No partner modules yet.")).toBeTruthy();
    expect(await shown("Add the first contextual slot with the form in Your next step.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Sponsored roles/ }));
    expect(await shown("No active sponsorships.")).toBeTruthy();
    expect(await shown("Employer-sponsored roles appear here for audit and early termination.")).toBeTruthy();
    expect(within(nextStep()).getByRole("button", { name: "End sponsorship" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("denies the whole inventory on a 403, as the kit gate does", async () => {
    const fetchMock = stub({ modules: reply({ error: "Administrator access is required." }, 403) });
    renderPage(<GoalAdminPartners />);
    expect(await shown("Administrator access is required.")).toBeTruthy();
    expect(screen.queryByText("Mock interviews with senior engineers")).toBeNull();
    expect(callsTo(fetchMock, (_u, init) => init?.method === "POST" || init?.method === "PATCH")).toHaveLength(0);
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    const { container } = renderPage(<GoalAdminPartners />);
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
