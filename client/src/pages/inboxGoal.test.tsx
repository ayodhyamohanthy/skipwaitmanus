// @vitest-environment jsdom
// Goal inbox (D-048-p3-inbox, in place): auth gating, the waiting-on-you
// hierarchy, one-commit next step, dot+text status, filters, partial failure,
// empty/error states, the /thread list alias, and pre-acceptance privacy (no
// seeker identity before a referrer's own acceptance). The data contract is
// the shared inboxThreads model; these tests pin the same API calls the kit
// page made.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UnifiedInbox from "./UnifiedInbox";
import { ThreadListAlias } from "./ThreadAlias";

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
      : { status: "unverified", access: { verified: false } },
}));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div> }));

const Page = () => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><UnifiedInbox /></QueryClientProvider>;

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

beforeEach(() => { authState.isSignedIn = true; accessState.status = "unverified"; flags.inbox = true; go.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal inbox", () => {
  it("puts the conversation that needs the seeker first, with dot+text status and no pills", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) return { requests: [askingRow(5, { unreadMessageCount: 2 }), askingRow(7, { status: "pending", referrerId: null, queueStatus: "available_for_review" })] };
      return { requests: [] };
    });
    render(<Page />);
    // Next step: the unread thread, one black commit.
    const reply = await screen.findByRole("link", { name: "Reply" });
    expect(screen.getByText("Keep your referrals moving.")).toBeTruthy();
    expect(reply.getAttribute("href")).toBe("/conversation/5");
    // Waiting-on-you hierarchy.
    expect(screen.getByRole("heading", { name: /Waiting on you/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Waiting on them/ })).toBeTruthy();
    // Dot + text status, no kit pills.
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(document.querySelector('[data-testid="goal-list-row"]')).toBeTruthy();
    expect(screen.getByLabelText(/2 unread/)).toBeTruthy();
    // A plain seeker never triggers the referring fetch or filter.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/company-referrals/mine"), expect.anything()));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("scope=new"))).toBe(false);
    expect(screen.queryByRole("button", { name: /Referring/ })).toBeNull();
  });

  it("gives a verified referrer the fresh ask to review and never shows seeker identity pre-acceptance", async () => {
    accessState.status = "verified";
    stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) return { requests: [] };
      if (url.includes("scope=new")) return { requests: [referringRow(9)] };
      if (url.includes("scope=completed")) return { requests: [] };
      return { requests: [] };
    });
    render(<Page />);
    expect((await screen.findAllByText("Seeker · identity hidden")).length).toBeGreaterThan(0);
    expect(screen.getByText("New ask")).toBeTruthy();
    const review = screen.getByRole("link", { name: "Review the ask" });
    expect(review.getAttribute("href")).toBe("/conversation/9?from=inbox");
    // The list payload carries no seeker name and the UI invents none.
    expect(screen.queryByText(/candidate/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Referring/ })).toBeTruthy();
  });

  it("shows the true empty state with one commit to find a referrer", async () => {
    stubFetch((url) => (url.includes("/api/company-referrals/mine") ? { requests: [] } : { requests: [] }));
    render(<Page />);
    expect(await screen.findByText("No conversations yet.")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "Find a referrer" });
    expect(cta.getAttribute("href")).toBe("/explore");
  });

  it("turns a load failure into a visible retry, never an empty inbox", async () => {
    let calls = 0;
    const fetchMock = stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) { calls += 1; return calls <= 2 ? { __status: 500, error: "boom" } : { requests: [askingRow(5)] }; }
      return { requests: [] };
    });
    render(<Page />);
    expect(await screen.findByText("We couldn't load your inbox")).toBeTruthy();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
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
  });

  it("gates a signed-out visitor on sign-in and fetches nothing", async () => {
    authState.isSignedIn = false;
    const fetchMock = stubFetch(() => ({ requests: [] }));
    render(<Page />);
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/company-referrals")).length).toBe(0);
  });

  it("filters by search text and reports a filtered empty honestly", async () => {
    stubFetch((url) => {
      if (url.includes("/api/company-referrals/mine")) return { requests: [askingRow(5), askingRow(7, { companyDomain: "nordisk.io", companyName: "Nordisk", companyInitials: "NO" })] };
      return { requests: [] };
    });
    render(<Page />);
    expect(await screen.findByText(/Nordisk/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search conversations"), { target: { value: "quill" } });
    await waitFor(() => expect(screen.queryByText(/Nordisk/)).toBeNull());
    fireEvent.change(screen.getByLabelText("Search conversations"), { target: { value: "zzz" } });
    expect(await screen.findByText("No matching conversations.")).toBeTruthy();
  });

  it("renders the kit inbox untouched while the surface is off (release control)", async () => {
    flags.inbox = false;
    stubFetch((url) => (url.includes("/api/company-referrals/mine") ? { requests: [askingRow(5)] } : { requests: [] }));
    render(<Page />);
    expect(await screen.findByText("Inbox")).toBeTruthy();
    expect(screen.getByText("MESSAGES")).toBeTruthy();
    expect(screen.queryByText("Keep your referrals moving.")).toBeNull();
  });

  it("renders the same goal inbox through the /thread list alias", async () => {
    stubFetch((url) => (url.includes("/api/company-referrals/mine") ? { requests: [askingRow(5)] } : { requests: [] }));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ThreadListAlias /></QueryClientProvider>);
    expect(await screen.findByText("Keep your referrals moving.")).toBeTruthy();
    expect(screen.getByTestId("app-shell")).toBeTruthy();
  });
});
