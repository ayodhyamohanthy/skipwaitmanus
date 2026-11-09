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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalEmployerTalent, { GOAL_PAGE, TALENT_UNLOCK_COST } from "./GoalEmployerTalent";

const { go, toast } = vi.hoisted(() => ({ go: vi.fn(), toast: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/employer/talent", go] }));
vi.mock("sonner", () => ({ toast }));

type Reply = { ok: boolean; status: number; headers: Headers; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body });

// Route-shaped fixtures (server/db.ts + server/employerRoutes.ts at main
// 4d939e8b): displayRef is ensureTalentRef's `tal_` + base64url(18 bytes)
// (28 chars); the list row is AnonymizedSeekerProfile; GET /talent/:ref
// returns { profile: { ...talentSnapshot, unlockedAt, expiresAt } } with NO
// displayRef, only the consented keys, and expertise as string[]
// (firstSkillKeywords) and experience coarsened ("6-10 years").
const REF_A = "tal_nfAQM_mhMoW-xVAnLby9eKLM";
const REF_B = "tal_sj50_1A9Gy4ztL3B_o7TbNls";
const REF_C = "tal_Qw3rTy-uI0pAsDfGhJkLzXcV";
const LOCKED = { displayRef: REF_A, headline: "Backend engineer", location: "Pune", skills: ["Go", "Postgres"], isUnlocked: false };
const UNLOCKED = { displayRef: REF_B, headline: "Product designer", location: null, skills: ["Figma"], isUnlocked: true };
const PROFILE = { headline: "Product designer", skills: ["Figma"], experience: "6-10 years", expertise: ["Design systems", "Figma"], unlockedAt: "2026-11-01T10:00:00.000Z", expiresAt: "2026-12-01T10:00:00.000Z" };

type Route = (url: string, init?: RequestInit) => Reply | Promise<Reply>;
function stub(overrides: { talent?: Route; account?: Route; unlock?: Route; profile?: Route; intro?: Route } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/unlock")) return (overrides.unlock ?? (() => reply({ unlocked: true, remaining: 15 }, 201)))(url, init);
    if (url.endsWith("/intro")) return (overrides.intro ?? (() => reply({ requested: true }, 201)))(url, init);
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
const balanceText = () => screen.getByText(/Talent unlock balance/).querySelector("[data-testid='goal-num']")?.textContent ?? "";

beforeEach(() => { go.mockReset(); toast.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /employer/talent (D-048-p3-employer-talent)", () => {
  it("opens with the goal line, the balance in plain words and anonymization beside every profile action", async () => {
    stub();
    const { container } = render(<GoalEmployerTalent />);
    expect(await screen.findByRole("listitem", { name: REF_A })).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Meet opt-in talent.");
    expect(container.querySelector("[data-goal-page='employer-talent']")).toBeTruthy();
    expect(screen.getByText(/Talent unlock balance/).textContent).toContain("20");
    for (const ref of [REF_A, REF_B]) expect(within(card(ref)).getByText(/No name or contact fields are listed/)).toBeTruthy();
    expect(within(card(REF_A)).getByText("Locked")).toBeTruthy();
    expect(within(card(REF_B)).getByText("Unlocked")).toBeTruthy();
    expect(within(card(REF_A)).queryByRole("button", { name: /View profile/ })).toBeNull();
    expect(within(card(REF_A)).getByRole("button", { name: `Unlock profile · costs ${TALENT_UNLOCK_COST}` })).toBeTruthy();
  });

  it("never says credit or credits to an employer (rule 1a)", async () => {
    stub();
    const { container } = render(<GoalEmployerTalent />);
    await screen.findByRole("listitem", { name: REF_A });
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
    await waitFor(() => expect(calls(fetchMock)).toContain("POST /api/employer/talent/tal_nfAQM_mhMoW-xVAnLby9eKLM/unlock"));
    await waitFor(() => expect(within(card(REF_A)).getByText("Unlocked")).toBeTruthy());
    expect(screen.getByText(/Talent unlock balance/).textContent).toContain("15");
  });

  it("restores the row and routes to billing when the balance is too low (402)", async () => {
    stub({ unlock: () => reply({ error: "Not enough credits" }, 402) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await screen.findByRole("button", { name: `Unlock profile · costs ${TALENT_UNLOCK_COST}` }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/employer/billing"));
    expect(within(card(REF_A)).getByText("Locked")).toBeTruthy();
    expect(screen.getByText(/Talent unlock balance/).textContent).toContain("20");
    expect(String(toast.mock.calls.at(-1)?.[0])).not.toMatch(/\bcredits?\b/i);
  });

  it("opens an unlocked profile only through the profile endpoint and shows only the fields it returns", async () => {
    const fetchMock = stub();
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: REF_B })).findByRole("button", { name: /View profile/ }));
    expect(await within(card(REF_B)).findByText(/6-10 years/)).toBeTruthy();
    expect(calls(fetchMock)).toContain("GET /api/employer/talent/tal_sj50_1A9Gy4ztL3B_o7TbNls");
    expect(calls(fetchMock).some(line => line.includes("tal_nfAQM_mhMoW-xVAnLby9eKLM") && !line.endsWith("/unlock"))).toBe(false);
  });

  it("sends the intro through the platform and marks it sent", async () => {
    const fetchMock = stub();
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: REF_B })).findByRole("button", { name: /Send intro request/ }));
    await waitFor(() => expect(calls(fetchMock)).toContain("POST /api/employer/talent/tal_sj50_1A9Gy4ztL3B_o7TbNls/intro"));
    expect(await within(card(REF_B)).findByText("Intro sent")).toBeTruthy();
  });

  it("searches with the same query parameters", async () => {
    const fetchMock = stub();
    render(<GoalEmployerTalent />);
    await screen.findByRole("listitem", { name: REF_A });
    fireEvent.change(screen.getByLabelText("Search talent"), { target: { value: "go" } });
    fireEvent.change(screen.getByLabelText("Filter by location"), { target: { value: "Pune" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls(fetchMock)).toContain("GET /api/employer/talent?query=go&location=Pune"));
  });

  it("drops a previously opened profile when a refreshed server row is locked", async () => {
    let refresh = false;
    stub({ talent: () => reply({ talent: [refresh ? { ...UNLOCKED, isUnlocked: false } : UNLOCKED] }) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await screen.findByRole("button", { name: "View profile" }));
    await screen.findByRole("group", { name: "Shared profile" });
    refresh = true;
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await within(await screen.findByRole("listitem", { name: REF_B })).findByText("Locked");
    expect(screen.queryByRole("group", { name: "Shared profile" })).toBeNull();
    expect(screen.queryByText(/6-10 years/)).toBeNull();
  });

  it("keeps the latest search when an older search completes last", async () => {
    const releases: ((value: Reply) => void)[] = [];
    let initial = true;
    stub({ talent: () => { if (initial) { initial = false; return reply({ talent: [LOCKED] }); } return new Promise<Reply>(resolve => releases.push(resolve)); } });
    render(<GoalEmployerTalent />);
    await screen.findByRole("listitem", { name: REF_A });
    fireEvent.change(screen.getByLabelText("Search talent"), { target: { value: "older" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search talent"), { target: { value: "latest" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(releases).toHaveLength(2);
    await act(async () => { releases[1](reply({ talent: [UNLOCKED] })); });
    await screen.findByRole("listitem", { name: REF_B });
    await act(async () => { releases[0](reply({ talent: [LOCKED] })); });
    expect(screen.queryByRole("listitem", { name: REF_A })).toBeNull();
    expect(screen.getByRole("listitem", { name: REF_B })).toBeTruthy();
  });

  it("ignores an older error and finally while the latest search is pending", async () => {
    const releases: ((value: Reply) => void)[] = [];
    let initial = true;
    stub({ talent: () => { if (initial) { initial = false; return reply({ talent: [LOCKED] }); } return new Promise<Reply>(resolve => releases.push(resolve)); } });
    render(<GoalEmployerTalent />);
    await screen.findByRole("listitem", { name: REF_A });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await act(async () => { releases[0](reply({ error: "Older failed search" }, 500)); });
    expect(screen.queryByText("Older failed search")).toBeNull();
    expect(screen.getByRole("status", { name: /Loading talent/ })).toBeTruthy();
    await act(async () => { releases[1](reply({ talent: [UNLOCKED] })); });
    expect(await screen.findByRole("listitem", { name: REF_B })).toBeTruthy();
  });

  it("does not let the pending mount overwrite a newer search and still loads its balance", async () => {
    let releaseMount: (value: Reply) => void = () => {};
    let initial = true;
    stub({ talent: () => { if (initial) { initial = false; return new Promise<Reply>(resolve => { releaseMount = resolve; }); } return reply({ talent: [UNLOCKED] }); } });
    render(<GoalEmployerTalent />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("listitem", { name: REF_B });
    await act(async () => { releaseMount(reply({ talent: [LOCKED] })); });
    expect(screen.queryByRole("listitem", { name: REF_A })).toBeNull();
    expect(screen.getByRole("listitem", { name: REF_B })).toBeTruthy();
    expect(balanceText()).toBe("20");
  });

  it("does not reopen a pending old profile after a list refresh", async () => {
    let releaseProfile: (value: Reply) => void = () => {};
    stub({ talent: () => reply({ talent: [UNLOCKED] }), profile: () => new Promise<Reply>(resolve => { releaseProfile = resolve; }) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await screen.findByRole("button", { name: "View profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("listitem", { name: REF_B });
    await act(async () => { releaseProfile(reply({ profile: PROFILE })); });
    expect(screen.queryByRole("group", { name: "Shared profile" })).toBeNull();
  });

  it("narrows the anonymity line to what the structured fields omit (the headline is free text)", async () => {
    stub();
    const { container } = render(<GoalEmployerTalent />);
    await screen.findByRole("listitem", { name: REF_A });
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Shown without a name or contact details/);
    expect(within(card(REF_A)).getByText(/headline is in this person's own words/)).toBeTruthy();
  });

  it("never says every profile stays hidden until the person responds (untrue once unlocked), in the subtitle or the SEO description", async () => {
    stub();
    const { container } = render(<GoalEmployerTalent />);
    await screen.findByRole("listitem", { name: REF_A });
    const hidden = /Every profile stays hidden until the person chooses to respond/;
    const subtitle = screen.getByRole("heading", { level: 1, name: GOAL_PAGE.goalLine }).nextElementSibling;
    expect(subtitle?.textContent ?? "").not.toMatch(hidden);
    expect(container.textContent ?? "").not.toMatch(hidden);
    const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "";
    expect(description).not.toMatch(hidden);
    expect(document.head.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ?? "").not.toMatch(hidden);
    const honest = "Browse opt-in talent. Unlocking shows only the fields they chose to share, and they decide whether to respond.";
    expect(subtitle?.textContent).toBe(honest);
    expect(description).toBe(honest);
  });

  it("renders the profile the server returns even though it carries no displayRef (bound to the requested row)", async () => {
    stub();
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: REF_B })).findByRole("button", { name: /View profile/ }));
    const opened = await within(card(REF_B)).findByRole("group", { name: "Shared profile" });
    expect(opened.textContent).toContain("6-10 years");
    expect(within(card(REF_A)).queryByRole("group", { name: "Shared profile" })).toBeNull();
  });

  it("shows expertise values separately, never concatenated", async () => {
    stub();
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: REF_B })).findByRole("button", { name: /View profile/ }));
    const opened = await within(card(REF_B)).findByRole("group", { name: "Shared profile" });
    expect(within(opened).getByText((_, node) => node?.tagName === "P" && node.textContent === "Expertise: Design systems, Figma")).toBeTruthy();
    expect(opened.textContent).not.toContain("Design systemsFigma");
  });

  it("an empty expertise array or an undisclosed field adds no empty heading", async () => {
    stub({ profile: () => reply({ profile: { headline: "Product designer", expertise: [], unlockedAt: PROFILE.unlockedAt, expiresAt: PROFILE.expiresAt } }) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: REF_B })).findByRole("button", { name: /View profile/ }));
    const opened = await within(card(REF_B)).findByRole("group", { name: "Shared profile" });
    expect(opened.textContent).not.toMatch(/Expertise/);
    expect(opened.textContent).not.toMatch(/Experience/);
    expect(opened.textContent).toContain("No additional details shared yet.");
  });

  it("marks a repeated intro (200) as sent", async () => {
    stub({ intro: () => reply({ requested: true }, 200) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: REF_B })).findByRole("button", { name: /Send intro request/ }));
    expect(await within(card(REF_B)).findByText("Intro sent")).toBeTruthy();
  });

  it("does not claim an intro was sent when the server refuses it (409) and keeps retry available", async () => {
    const fetchMock = stub({ intro: () => reply({ error: "Unlock this profile before requesting an intro" }, 409) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: REF_B })).findByRole("button", { name: /Send intro request/ }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(within(card(REF_B)).queryByText("Intro sent")).toBeNull();
    expect(String(toast.mock.calls.at(-1)?.[0])).toMatch(/not sent/i);
    const retry = within(card(REF_B)).getByRole("button", { name: /Send intro request/ });
    expect(retry.getAttribute("aria-disabled")).not.toBe("true");
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);
    await waitFor(() => expect(calls(fetchMock).filter(line => line === `POST /api/employer/talent/${REF_B}/intro`).length).toBe(2));
  });

  it("offers no profile or intro action while an unlock is still pending", async () => {
    let release: (value: Reply) => void = () => {};
    const fetchMock = stub({ unlock: () => new Promise<Reply>(resolve => { release = resolve; }) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await screen.findByRole("button", { name: `Unlock profile · costs ${TALENT_UNLOCK_COST}` }));
    await waitFor(() => expect(calls(fetchMock)).toContain(`POST /api/employer/talent/${REF_A}/unlock`));
    expect(within(card(REF_A)).queryByRole("button", { name: /View profile/ })).toBeNull();
    expect(within(card(REF_A)).queryByRole("button", { name: /Send intro request/ })).toBeNull();
    release(reply({ unlocked: true, remaining: 15 }, 201));
    expect(await within(card(REF_A)).findByRole("button", { name: /View profile/ })).toBeTruthy();
    expect(calls(fetchMock).some(line => line.includes(REF_A) && !line.endsWith("/unlock"))).toBe(false);
  });

  it("a pending unlock that ends in 402 never exposed the profile actions and restores the row", async () => {
    let release: (value: Reply) => void = () => {};
    stub({ unlock: () => new Promise<Reply>(resolve => { release = resolve; }) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await screen.findByRole("button", { name: `Unlock profile · costs ${TALENT_UNLOCK_COST}` }));
    expect(within(card(REF_A)).queryByRole("button", { name: /View profile/ })).toBeNull();
    release(reply({ error: "Not enough unlock credits", credits: 3 }, 402));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/employer/billing"));
    expect(within(card(REF_A)).getByText("Locked")).toBeTruthy();
    // The 402 body's numeric `credits` (server/employerRoutes.ts) is the
    // authoritative balance; the captured 20 is stale.
    expect(balanceText()).toBe("3");
  });

  // Two locked rows: unlocks are serialized. While one is pending every other
  // Unlock is inert and the handler ignores re-entry, so no second optimistic
  // row, no shared pending guard to clear, and no stale rollback to race.
  describe("two locked rows (serialized unlocks)", () => {
    const LOCKED_C = { displayRef: REF_C, headline: "Data analyst", location: "Chennai", skills: ["SQL"], isUnlocked: false };
    const twoLocked = () => reply({ talent: [LOCKED, LOCKED_C, UNLOCKED] });
    const unlockButton = (ref: string) => within(card(ref)).getByRole("button", { name: /Unlock profile|Unlocking/ });
    const unlockPosts = (fetchMock: ReturnType<typeof stub>) => calls(fetchMock).filter(line => line.endsWith("/unlock"));

    it("blocks B while A is pending: B's Unlock is inert, a click sends nothing, and neither row offers profile or intro", async () => {
      let releaseA: (value: Reply) => void = () => {};
      const fetchMock = stub({ talent: twoLocked, unlock: () => new Promise<Reply>(resolve => { releaseA = resolve; }) });
      render(<GoalEmployerTalent />);
      await screen.findByRole("listitem", { name: REF_C });
      fireEvent.click(unlockButton(REF_A));
      await waitFor(() => expect(unlockPosts(fetchMock)).toEqual([`POST /api/employer/talent/${REF_A}/unlock`]));
      expect(unlockButton(REF_C).getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(unlockButton(REF_C));
      fireEvent.click(unlockButton(REF_A));
      expect(unlockPosts(fetchMock)).toEqual([`POST /api/employer/talent/${REF_A}/unlock`]);
      for (const ref of [REF_A, REF_C]) {
        expect(within(card(ref)).getByText("Locked")).toBeTruthy();
        expect(within(card(ref)).queryByRole("button", { name: /View profile/ })).toBeNull();
        expect(within(card(ref)).queryByRole("button", { name: /Send intro request/ })).toBeNull();
      }
      expect(balanceText()).toBe("15");
      releaseA(reply({ unlocked: true, remaining: 15 }, 201));
      expect(await within(card(REF_A)).findByRole("button", { name: /View profile/ })).toBeTruthy();
    });

    it("keeps the guard until A settles, then B unlocks on its own request and the server's balance stands", async () => {
      const releases: Array<(value: Reply) => void> = [];
      const fetchMock = stub({ talent: twoLocked, unlock: () => new Promise<Reply>(resolve => { releases.push(resolve); }) });
      render(<GoalEmployerTalent />);
      await screen.findByRole("listitem", { name: REF_C });
      fireEvent.click(unlockButton(REF_A));
      await waitFor(() => expect(releases.length).toBe(1));
      // Still pending after other renders: the guard has not been dropped.
      fireEvent.change(screen.getByLabelText("Search talent"), { target: { value: "x" } });
      expect(unlockButton(REF_C).getAttribute("aria-disabled")).toBe("true");
      releases[0](reply({ error: "Not enough unlock credits", credits: 0 }, 402));
      await waitFor(() => expect(within(card(REF_A)).getByText("Locked")).toBeTruthy());
      await waitFor(() => expect(unlockButton(REF_C).getAttribute("aria-disabled")).not.toBe("true"));
      expect(balanceText()).toBe("0");
      fireEvent.click(unlockButton(REF_C));
      await waitFor(() => expect(unlockPosts(fetchMock)).toEqual([`POST /api/employer/talent/${REF_A}/unlock`, `POST /api/employer/talent/${REF_C}/unlock`]));
      expect(unlockButton(REF_A).getAttribute("aria-disabled")).toBe("true");
      releases[1](reply({ unlocked: true, remaining: 5 }, 201));
      expect(await within(card(REF_C)).findByRole("button", { name: /View profile/ })).toBeTruthy();
      expect(within(card(REF_A)).getByText("Locked")).toBeTruthy();
      expect(balanceText()).toBe("5");
      expect(unlockButton(REF_A).getAttribute("aria-disabled")).not.toBe("true");
    });

    it("the handler ignores re-entry: two clicks before React re-renders (A then B) send one request", async () => {
      let releaseA: (value: Reply) => void = () => {};
      const fetchMock = stub({ talent: twoLocked, unlock: () => new Promise<Reply>(resolve => { releaseA = resolve; }) });
      render(<GoalEmployerTalent />);
      await screen.findByRole("listitem", { name: REF_C });
      const a = unlockButton(REF_A); const c = unlockButton(REF_C);
      // Both clicks land inside one act(), so neither button is inert yet;
      // only the handler's own guard can stop the second.
      act(() => { a.click(); c.click(); a.click(); });
      await waitFor(() => expect(unlockPosts(fetchMock).length).toBe(1));
      expect(unlockPosts(fetchMock)).toEqual([`POST /api/employer/talent/${REF_A}/unlock`]);
      expect(within(card(REF_C)).getByText("Locked")).toBeTruthy();
      expect(balanceText()).toBe("15");
      releaseA(reply({ unlocked: true, remaining: 15 }, 201));
      expect(await within(card(REF_A)).findByRole("button", { name: /View profile/ })).toBeTruthy();
    });

    it("on a 402 with no numeric credits restores only that row and the captured balance", async () => {
      stub({ talent: twoLocked, unlock: () => reply({ error: "Not enough unlock credits", credits: "3" }, 402) });
      render(<GoalEmployerTalent />);
      await screen.findByRole("listitem", { name: REF_C });
      fireEvent.click(unlockButton(REF_A));
      await waitFor(() => expect(go).toHaveBeenCalledWith("/employer/billing"));
      expect(balanceText()).toBe("20");
      expect(within(card(REF_A)).getByText("Locked")).toBeTruthy();
      expect(within(card(REF_C)).getByText("Locked")).toBeTruthy();
      expect(within(card(REF_B)).getByText("Unlocked")).toBeTruthy();
    });
  });

  it("a non-array expertise value in the profile renders no Expertise line", async () => {
    stub({ profile: () => reply({ profile: { headline: "Product designer", experience: "6-10 years", expertise: "Design systems" } }) });
    render(<GoalEmployerTalent />);
    fireEvent.click(await within(await screen.findByRole("listitem", { name: REF_B })).findByRole("button", { name: /View profile/ }));
    const opened = await within(card(REF_B)).findByRole("group", { name: "Shared profile" });
    expect(opened.textContent).toContain("6-10 years");
    expect(opened.textContent).not.toMatch(/Expertise/);
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
    expect(screen.queryByRole("listitem", { name: REF_A })).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("listitem", { name: REF_A })).toBeTruthy();
    expect(calls(fetchMock).filter(line => line.startsWith("GET /api/employer/talent")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("goal employer-talent sources", () => {
  it("carry no inline hex colour", () => {
    const source = readFileSync(join(process.cwd(), "client/src/pages/goal/employer-talent/GoalEmployerTalent.tsx"), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
