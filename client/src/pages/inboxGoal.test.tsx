// @vitest-environment jsdom
// Goal inbox (D-048-p3-inbox): the page contract (one goal line, one next-step
// block with the page's only black commit), the waiting-on-you hierarchy,
// dot+text status, the /thread list alias, pre-acceptance privacy (no seeker
// identity before a referrer's own acceptance), loading, empty, error, partial,
// filtered and offline states. The data contract is the shared inboxThreads
// model, so these tests pin exactly the API calls the kit page makes.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UnifiedInbox from "./UnifiedInbox";
import { ThreadListAlias } from "./ThreadAlias";
import { assertGoalPage } from "@/test/goalPageContract";

const { authState, accessState, flags, go } = vi.hoisted(() => ({
  authState: { isSignedIn: true },
  accessState: { status: "unverified" as string },
  flags: { inbox: true },
  go: vi.fn(),
}));

vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => (flags as Record<string, boolean>)[id] === true }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken: vi.fn().mockResolvedValue("t"), openSignIn: vi.fn() }),
  useUser: () => ({ user: { id: "u1", emailAddresses: [{ emailAddress: "seeker@example.com" }] } }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/inbox", go],
  useRoute: () => [false, {}],
  Redirect: () => null,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => accessState.status === "verified"
    ? { status: "verified", access: { verified: true, domain: "quillmint.com", companyName: "Quillmint", companyInitials: "QU" } }
    : accessState.status === "checking"
      ? { status: "checking" }
      : accessState.status === "error"
        ? { status: "error", error: new Error("verification check failed"), retrying: false, retry: vi.fn() }
        : { status: "unverified", access: { verified: false } },
}));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div> }));

const GOAL_LINE = "Keep your referrals moving.";
const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const Page = () => <QueryClientProvider client={queryClient()}><UnifiedInbox /></QueryClientProvider>;

const now = new Date().toISOString();
const askingRow = (id: number, extra: Record<string, unknown> = {}) => ({ id, title: `Product Designer ${id}`, companyDomain: "quillmint.com", companyName: "Quillmint", companyInitials: "QU", status: "approved", referrerId: 42, unreadMessageCount: 0, updatedAt: now, ...extra });
const referringRow = (id: number, extra: Record<string, unknown> = {}) => ({ id, companyDomain: "quillmint.com", companyName: "Quillmint", companyInitials: "QU", status: "pending", unreadMessageCount: 0, jobTitle: "Backend Engineer", updatedAt: now, ...extra });

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = handler(String(url), init) as { __status?: number } | undefined;
    if (body && typeof body === "object" && "__status" in body) return { ok: false, status: body.__status, json: async () => ({ error: (body as { error?: string }).error }) };
    return { ok: true, json: async () => body ?? {} };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** jsdom's navigator.onLine is a getter; the page reads it through useOnlineStatus. */
function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

const nextStepBlock = () => screen.getByRole("heading", { name: "Your next step" }).closest("section") as HTMLElement;

beforeEach(() => { authState.isSignedIn = true; accessState.status = "unverified"; flags.inbox = true; go.mockClear(); setOnline(true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal inbox", () => {
  it("meets the goal page contract and puts the unread conversation first", async () => {
    stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) return { requests: [askingRow(5, { unreadMessageCount: 2 }), askingRow(7, { status: "pending", referrerId: null, queueStatus: "available_for_review" })] };
      return { requests: [] };
    });
    const { container } = render(<Page />);
    const reply = await screen.findByRole("link", { name: "Reply" });
    expect(reply.getAttribute("href")).toBe("/conversation/5");
    // One h1 with the goal line, one next-step block, one black commit inside it, no kit classes.
    expect(() => assertGoalPage(container, { goalLine: GOAL_LINE })).not.toThrow();
    // Review finding 3: the target is named once; the detail carries the count.
    expect(within(nextStepBlock()).getAllByText(/Quillmint/).length).toBe(1);
    expect(within(nextStepBlock()).getByText("2 unread messages.")).toBeTruthy();
    // Waiting-on-you hierarchy and dot+text status, never kit pills.
    expect(screen.getByRole("heading", { name: /Waiting on you/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Waiting on them/ })).toBeTruthy();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByLabelText(/2 unread/)).toBeTruthy();
  });

  it("shows the loading skeleton while the lists are still in flight, never an empty inbox", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<Page />);
    const status = await screen.findByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(within(status).getByText("Loading your conversations…")).toBeTruthy();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
  });

  it("gives a verified referrer the fresh ask to review and never shows seeker identity pre-acceptance", async () => {
    accessState.status = "verified";
    stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) return { requests: [] };
      if (url.includes("scope=new")) return { requests: [referringRow(9)] };
      return { requests: [] };
    });
    render(<Page />);
    expect((await screen.findAllByText("Seeker · identity hidden")).length).toBeGreaterThan(0);
    expect(screen.getByText("New referral request")).toBeTruthy();
    const review = screen.getByRole("link", { name: "Review the request" });
    expect(review.getAttribute("href")).toBe("/conversation/9?from=inbox");
    // The list payload carries no seeker identity and the UI invents none.
    expect(screen.queryByText(/candidate/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Referring/ })).toBeTruthy();
  });

  it("gives the true empty state one black commit inside the next-step block", async () => {
    stubFetch(() => ({ requests: [] }));
    const { container } = render(<Page />);
    expect(await screen.findByText("No conversations yet.")).toBeTruthy();
    // Review finding 2: the empty state follows the one-black-commit pattern.
    expect(() => assertGoalPage(container, { goalLine: GOAL_LINE })).not.toThrow();
    const block = nextStepBlock();
    expect(block.className).toContain("border");
    const cta = screen.getByRole("link", { name: "Find a referrer" });
    expect(cta.getAttribute("href")).toBe("/explore");
    expect(block.contains(cta)).toBe(true);
    expect(container.querySelectorAll("[data-g-primary]").length).toBe(1);
  });

  it("turns a load failure into a visible retry, never an empty inbox", async () => {
    let calls = 0;
    const fetchMock = stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) { calls += 1; return calls <= 2 ? { __status: 500, error: "boom" } : { requests: [askingRow(5)] }; }
      return { requests: [] };
    });
    const { container } = render(<Page />);
    expect(await screen.findByText(/We couldn't load your inbox/)).toBeTruthy();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
    // Review finding 2 (#815): one honest reason plus the preserved-data line, never the server's sentence appended.
    expect(within(nextStepBlock()).getByText("We couldn't load your inbox.")).toBeTruthy();
    expect(within(nextStepBlock()).getByText("Your conversations are still there — nothing was lost.")).toBeTruthy();
    expect(within(nextStepBlock()).queryByText(/boom/)).toBeNull();
    // The failure still offers exactly one commitment: retry.
    expect(() => assertGoalPage(container, { goalLine: GOAL_LINE })).not.toThrow();
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(nextStepBlock().contains(retry)).toBe(true);
    fireEvent.click(retry);
    expect(await screen.findByText(/Quillmint/)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/mine")).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps loaded rows visible when one source fails", async () => {
    accessState.status = "verified";
    stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) return { requests: [askingRow(5)] };
      if (url.includes("scope=new")) return { __status: 500, error: "down" };
      return { requests: [] };
    });
    render(<Page />);
    expect(await screen.findByText("Some conversations could not load.")).toBeTruthy();
    expect(screen.getByText(/Quillmint/)).toBeTruthy();
    expect(screen.queryByText(/We couldn't load your inbox/)).toBeNull();
  });

  it("gates a signed-out visitor on one sign-in commit and fetches nothing", async () => {
    authState.isSignedIn = false;
    const fetchMock = stubFetch(() => ({ requests: [] }));
    const { container } = render(<Page />);
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(() => assertGoalPage(container, { goalLine: GOAL_LINE })).not.toThrow();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/company-referrals")).length).toBe(0);
  });

  it("filters by search text and offers one honest next step when nothing matches", async () => {
    stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) return { requests: [askingRow(5), askingRow(7, { companyDomain: "nordisk.io", companyName: "Nordisk", companyInitials: "NO" })] };
      return { requests: [] };
    });
    const { container } = render(<Page />);
    expect(await screen.findByText(/Nordisk/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search conversations"), { target: { value: "zzz" } });
    expect(await screen.findByText("No matching conversations.")).toBeTruthy();
    expect(() => assertGoalPage(container, { goalLine: GOAL_LINE })).not.toThrow();
    fireEvent.click(screen.getByRole("button", { name: "Show all conversations" }));
    expect(await screen.findByText(/Nordisk/)).toBeTruthy();
  });

  it("says it is offline and clears the notice on reconnect", async () => {
    stubFetch((url) => (url.includes("/api/company-referrals/mine") ? { requests: [askingRow(5)] } : { requests: [] }));
    render(<Page />);
    expect(await screen.findByText(/Quillmint/)).toBeTruthy();
    expect(screen.queryByText(/You're offline/)).toBeNull();

    setOnline(false);
    fireEvent(window, new Event("offline"));
    expect(await screen.findByText(/You're offline/)).toBeTruthy();
    // Reading still works offline: the loaded conversation stays.
    expect(screen.getByText(/Quillmint/)).toBeTruthy();

    setOnline(true);
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(screen.queryByText(/You're offline/)).toBeNull());
  });

  it("uses referral-only words in every state it renders (D-180, review finding 1 on #815)", async () => {
    const retired = /\basks?\b/i;
    const states: Array<() => void> = [
      () => stubFetch((url) => (url.includes("/api/company-referrals/mine") ? { requests: [askingRow(5, { unreadMessageCount: 2 })] } : { requests: [] })),
      () => stubFetch(() => ({ requests: [] })),
      () => stubFetch((url) => (url.includes("/api/company-referrals/mine") ? { requests: [askingRow(5)] } : { requests: [] })),
      () => { accessState.status = "verified"; stubFetch((url) => (url.includes("scope=new") ? { requests: [referringRow(9)] } : { requests: [] })); },
    ];
    for (const arrange of states) {
      arrange();
      const { container, unmount } = render(<Page />);
      await screen.findByRole("heading", { name: "Your next step" });
      expect(container.textContent ?? "").not.toMatch(retired);
      unmount();
      accessState.status = "unverified";
    }
  });

  it("keeps the retired noun out of the owned source strings (D-180)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const file of ["goal/inbox/GoalInbox.tsx", "goal/inbox/inboxRows.tsx"]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      const pattern = /"([^"\\]*)"|>([^<>{}]+)</g;
      const strings: string[] = [];
      for (let m = pattern.exec(source); m !== null; m = pattern.exec(source)) strings.push((m[1] ?? m[2] ?? "").trim());
      const visible = strings.filter(Boolean).filter(text => /\s/.test(text) || /^[A-Z]/.test(text));
      expect(visible.filter(text => /\basks?\b/i.test(text))).toEqual([]);
    }
  });

  it("renders the kit inbox untouched while the surface is off (release control)", async () => {
    flags.inbox = false;
    stubFetch((url) => (url.includes("/api/company-referrals/mine") ? { requests: [askingRow(5)] } : { requests: [] }));
    render(<Page />);
    expect(await screen.findByText("Inbox")).toBeTruthy();
    expect(screen.getByText("MESSAGES")).toBeTruthy();
    expect(screen.queryByText(GOAL_LINE)).toBeNull();
  });

  it("renders the same goal inbox through the /thread list alias", async () => {
    stubFetch((url) => (url.includes("/api/company-referrals/mine") ? { requests: [askingRow(5, { unreadMessageCount: 1 })] } : { requests: [] }));
    render(<QueryClientProvider client={queryClient()}><ThreadListAlias /></QueryClientProvider>);
    expect(await screen.findByText(GOAL_LINE)).toBeTruthy();
    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Reply" })).toBeTruthy();
  });
});
