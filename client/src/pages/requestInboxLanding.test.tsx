// @vitest-environment jsdom
// D-089.ui (packet docs/plans/D-089-request-inbox.md §4.7, §4.9, §5.2 U1, U6): the seeker landing
// names the referrer's chosen screen name, and the referral queue marks a request sent to the
// referrer directly. Both only while REQUEST_INBOX_LINK_ENABLED is on; with it off the landing and
// the queue render exactly as before.
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { LINK_LANDING_PRIVACY_LINE } from "@shared/requestInboxLink";
import FastTrackLink from "./FastTrackLink";
import VanityFastTrackLink from "./VanityFastTrackLink";
import MyCompanyInbox from "./MyCompanyInbox";

const { switchState, go, route } = vi.hoisted(() => ({
  switchState: { on: true },
  go: vi.fn(),
  route: { params: {} as Record<string, string> | undefined },
}));
vi.mock("@shared/requestInboxLink", async importOriginal => {
  const actual = await importOriginal<typeof import("@shared/requestInboxLink")>();
  return { ...actual, get REQUEST_INBOX_LINK_ENABLED() { return switchState.on; } };
});
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, userId: "11", getToken: vi.fn().mockResolvedValue("test-token") }),
  useUser: () => ({ user: null }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/", go],
  useRoute: () => [route.params !== undefined, route.params],
  useSearch: () => "",
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => ({ status: "verified", access: { verified: true, domain: "wipro.com", companyName: "Wipro", companyInitials: "W" } }),
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const OLD_BODY = /A verified employee at acme\.example shared this link\. They choose whether to review your request, and their identity stays private\./;

beforeAll(async () => { await import("./goal/links/GoalPrivateLinkLanding"); }, 30_000);
beforeEach(() => { switchState.on = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); });

describe("§4.9 the seeker landing", () => {
  beforeEach(() => { route.params = { companySlug: "acme", vanityAlias: "maple-owl" }; });

  it("U1: switch off keeps the landed copy, even when a server already sends a screen name", async () => {
    switchState.on = false;
    vi.stubGlobal("fetch", vi.fn(async () => ok({ link: { companyDomain: "acme.example", isActive: true, screenName: "maple-owl" } })));
    const { container } = render(<VanityFastTrackLink />);
    expect(await screen.findByRole("heading", { level: 1, name: "Get referred at acme.example." })).toBeTruthy();
    assertGoalPage(container, { goalLine: "Get referred at acme.example." });
    expect(screen.getByText(OLD_BODY)).toBeTruthy();
    expect(screen.queryByText(LINK_LANDING_PRIVACY_LINE)).toBeNull();
    expect(container.textContent).not.toContain("maple-owl");
  });

  it("switch on names the chosen screen name and keeps the one black commit and the /start handoff", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ link: { companyDomain: "acme.example", isActive: true, screenName: "maple-owl" } })));
    const { container } = render(<VanityFastTrackLink />);
    const goalLine = "Ask maple-owl, a verified employee at acme.example.";
    expect(await screen.findByRole("heading", { level: 1, name: goalLine })).toBeTruthy();
    assertGoalPage(container, { goalLine });
    expect(screen.getByText(LINK_LANDING_PRIVACY_LINE)).toBeTruthy();
    expect(screen.queryByText(/identity stays private/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start your referral request" }));
    expect(go).toHaveBeenCalledWith("/start?referCompany=acme&referAlias=maple-owl");
  });

  it("switch on without a chosen name says a verified employee, on both landings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ link: { companyDomain: "acme.example", isActive: true, screenName: null } })));
    route.params = { linkCode: "abc123" };
    const { container } = render(<FastTrackLink />);
    const goalLine = "Ask a verified employee at acme.example.";
    expect(await screen.findByRole("heading", { level: 1, name: goalLine })).toBeTruthy();
    assertGoalPage(container, { goalLine });
    expect(screen.getByText(LINK_LANDING_PRIVACY_LINE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start your referral request" }));
    expect(go).toHaveBeenCalledWith("/start?fast=abc123");
  });

  it("U6: never renders a generated ref- alias as a name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ link: { companyDomain: "acme.example", isActive: true, screenName: "ref-0a1b2c3d4e" } })));
    const { container } = render(<VanityFastTrackLink />);
    expect(await screen.findByRole("heading", { level: 1, name: "Ask a verified employee at acme.example." })).toBeTruthy();
    expect(container.textContent).not.toMatch(/ref-/);
  });

  it("names nobody when the payload carries anything beyond the strict public contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ link: { companyDomain: "acme.example", isActive: true, screenName: "maple-owl", referrerId: 7 } })));
    const { container } = render(<VanityFastTrackLink />);
    expect(await screen.findByRole("heading", { level: 1, name: "Ask a verified employee at acme.example." })).toBeTruthy();
    expect(container.textContent).not.toContain("maple-owl");
  });

  it("still opens, unnamed, when the API has not shipped the screen name yet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ link: { companyDomain: "acme.example", isActive: true } })));
    render(<VanityFastTrackLink />);
    expect(await screen.findByRole("heading", { level: 1, name: "Ask a verified employee at acme.example." })).toBeTruthy();
    expect(screen.getByText(LINK_LANDING_PRIVACY_LINE)).toBeTruthy();
  });
});

describe("§4.7 the referral queue marks a request sent to you directly", () => {
  const now = Date.now();
  const row = (id: number, title: string, extra: Record<string, unknown>) => ({
    id, targetRoleUrl: null, companyDomain: "wipro.com", companyName: "Wipro", status: "pending", createdAt: new Date(now - 86400000).toISOString(), attachmentCount: 0, jobTitle: title, ...extra,
  });
  const stubQueue = () => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = String(url);
    if (path.includes("scope=new")) return ok({ requests: [
      row(51, "Data engineer", { isClaimedByYou: true, askedYouDirectly: true }),
      row(52, "Product designer", { isClaimedByYou: false, askedYouDirectly: false }),
    ] });
    if (path.includes("scope=saved")) return ok({ requests: [] });
    return ok({});
  }));
  const renderQueue = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MyCompanyInbox /></QueryClientProvider>);
  const rowFor = async (title: string) => (await screen.findByText(title)).closest("[data-testid='goal-list-row']") as HTMLElement;

  it("switch on: a dot-and-text marker on the direct row only, read as 'Asked you directly'", async () => {
    stubQueue();
    renderQueue();
    const direct = await rowFor("Data engineer");
    const pool = await rowFor("Product designer");
    const marker = within(direct).getByTestId("asked-you-directly");
    expect(marker.textContent).toContain("Sent to you directly");
    expect(within(direct).getByText("Asked you directly").className).toContain("sr-only");
    expect(marker.querySelector("[aria-hidden='true'].rounded-full")).toBeTruthy();
    expect(within(pool).queryByTestId("asked-you-directly")).toBeNull();
  });

  it("U1: switch off shows no marker, even when a server already sends the flag", async () => {
    switchState.on = false;
    stubQueue();
    renderQueue();
    const direct = await rowFor("Data engineer");
    expect(within(direct).queryByTestId("asked-you-directly")).toBeNull();
    expect(screen.queryByText("Sent to you directly")).toBeNull();
  });
});
