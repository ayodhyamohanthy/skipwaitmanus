// @vitest-environment jsdom
// D-094-ai-in-ui.status-help (packet §4.8, §7 T8-T9): with the switch on,
// each ask row whose state has a catalogue entry gets one "What this means"
// disclosure, closed by default, aria-expanded, keyboard reachable, and it
// shows that state's own body. A held_for_credit row has no disclosure, and
// askNextLine's shipped sentences render unchanged beside it. With the switch
// off the page renders exactly today's rows (T0).
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";
import { STATUS_HELP } from "@/components/requests/statusHelp";

const { go, getToken, auth, flags } = vi.hoisted(() => ({
  go: vi.fn(),
  getToken: vi.fn().mockResolvedValue("test-token"),
  auth: { openSignIn: vi.fn() },
  flags: { help: true },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 4106, getToken, openSignIn: auth.openSignIn }),
  useUser: () => ({ user: { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/requests", go],
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));
// The switch is the only thing this seam forces; the catalogue and lookup stay real.
vi.mock("@/components/requests/statusHelp", async () => ({
  ...(await vi.importActual<typeof import("@/components/requests/statusHelp")>("@/components/requests/statusHelp")),
  get STATUS_HELP_ENABLED() { return flags.help; },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}

const base = { targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: "Acme", companyInitials: "A", referrerName: null, referrerTitle: null, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T09:41:00.000Z", updatedAt: "2026-09-02T14:05:00.000Z", attachmentCount: 1 };
const rows = [
  { ...base, id: 11, title: "Product Designer", status: "pending", referrerId: null, queueStatus: "waiting_for_coverage" },
  { ...base, id: 12, title: "Backend Engineer", status: "pending", referrerId: 77, queueStatus: "available_for_review" },
  { ...base, id: 13, title: "Design Lead", status: "approved", referrerId: 78 },
  { ...base, id: 14, title: "Data Analyst", status: "declined", referrerId: 79 },
  { ...base, id: 15, title: "Platform Engineer", status: "pending", referrerId: null, queueStatus: "held_for_credit" },
];

function stubRequests(requests: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/api/credits/summary")
    ? { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) }
    : { ok: true, status: 200, json: async () => ({ requests }) }));
}

beforeEach(() => { flags.help = true; stubRequests(rows); });
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("My asks status help (D-094 item 3)", () => {
  it("adds one closed-by-default disclosure per row whose state has an entry", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Design Lead")).toBeTruthy());
    const buttons = screen.getAllByRole("button", { name: "What this means" });
    expect(buttons.length).toBe(4);
    for (const button of buttons) expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(STATUS_HELP["waiting:waiting_for_coverage"].body)).toBeNull();
  });

  it("opens the entry for that row's own state and closes it again", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Design Lead")).toBeTruthy());
    const row = screen.getByText("Product Designer").closest("li") as HTMLElement;
    const button = row.querySelector('button[aria-expanded]') as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(STATUS_HELP["waiting:waiting_for_coverage"].body)).toBeTruthy();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(STATUS_HELP["waiting:waiting_for_coverage"].body)).toBeNull();
  });

  it("gives a held_for_credit row no disclosure", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Platform Engineer")).toBeTruthy());
    const row = screen.getByText("Platform Engineer").closest("li") as HTMLElement;
    expect(row.querySelector('button[aria-expanded]')).toBeNull();
    expect(row.textContent).not.toContain("What this means");
  });

  it("keeps askNextLine's shipped sentences on every row", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Design Lead")).toBeTruthy());
    expect(screen.getByText("Your referrer submits it through Acme’s process, then marks it Referred.")).toBeTruthy();
    expect(screen.getByText("The referrer declined this ask.")).toBeTruthy();
    expect(screen.getByText("Waiting for coverage")).toBeTruthy();
  });

  it("renders exactly today's rows with the switch off", async () => {
    flags.help = false;
    renderPage();
    await waitFor(() => expect(screen.getByText("Design Lead")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "What this means" })).toBeNull();
    expect(screen.queryByText(STATUS_HELP.accepted.body)).toBeNull();
  });
});
