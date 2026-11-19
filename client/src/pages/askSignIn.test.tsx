// @vitest-environment jsdom
// The ask composer page (design/goal-ui/w2/ask-*.png): the W1 drawer anatomy
// at full width on the goal shell. Flags off: "Uses 1 of your N credits" with
// the refund rules beside one black Send ask. The send contract (idempotency,
// composed note, attachment, company slug, posted-role id) never changes.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import { ASK_PREFILL_KEY } from "@/lib/askPrefill";
import Ask from "./Ask";

const { go, searchState, authState, signIn } = vi.hoisted(() => ({
  go: vi.fn(),
  searchState: { value: "" },
  authState: { isLoaded: true, isSignedIn: true },
  signIn: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/ask", go],
  useSearch: () => searchState.value,
  useRoute: () => [true, {}],
}));
vi.mock("./explore/signInHandoff", async importOriginal => ({
  ...await importOriginal<typeof import("./explore/signInHandoff")>(),
  goToSeekerSignIn: signIn,
}));

const company = (slug: string, openToReferrals = true): PublicCompany => {
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === slug);
  if (!seed) throw new Error(`unknown seed ${slug}`);
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals };
};
const directoryOf = (companies: PublicCompany[]): CompanyDirectoryResponse => ({ companies, openCount: companies.filter(item => item.openToReferrals).length });
const ALL_OPEN = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug)));
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
const setup = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };
const CREATED = { requestId: 501, companyDomain: "wipro.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } };

function stub(options: { send?: () => { status: number; body: unknown } } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies") return json(200, ALL_OPEN);
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path === "/api/ask-drafts" && method === "PUT") return json(200, { draft: { ...(JSON.parse(String(init?.body)) as object), updatedAt: "x" } });
    if (path === "/api/ask-drafts" && method === "DELETE") return json(200, { ok: true });
    if (path === "/api/company-referrals" && method === "POST") { const reply = options.send?.() ?? { status: 200, body: CREATED }; return json(reply.status, reply.body); }
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const page = () => within(document.querySelector("[data-skipwait-screen='ask']") as HTMLElement);
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Ask /></QueryClientProvider>);
const fillLink = (value = "https://careers.wipro.com/jobs/1234567-product-designer") => {
  const input = screen.getByLabelText("Job link");
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
};
const fillReasons = () => {
  fireEvent.change(screen.getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
  fireEvent.change(screen.getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
  fireEvent.change(screen.getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
};
const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/company-referrals" && (init as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  searchState.value = "";
  sessionStorage.clear();
  signIn.mockReset();
  go.mockReset();
  window.history.replaceState(null, "", "/ask");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });


describe("P0 personal-link sign-in round trip", () => {
  it.each([
    ["?fast=abc", { fastTrackCode: "abc" }],
    ["?referCompany=tcs&referAlias=asha", { fastTrackCompanySlug: "tcs", fastTrackAlias: "asha" }],
    ["?post=12", { opportunityId: 12 }],
    ["?fast=abc&post=12", { fastTrackCode: "abc", opportunityId: 12 }],
  ])("keeps %s through sign-in and the real POST body", async (search, routing) => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    window.history.replaceState(null, "", "/ask" + search);
    const first = renderPage();
    fillLink();
    fillReasons();
    await screen.findByTestId("goal-verified-mark");
    fireEvent.click(screen.getByRole("button", { name: "Sign in and send" }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("/ask" + search));
    expect(posts(fetchMock)).toHaveLength(0);
    const returnTo = signIn.mock.calls[0][0] as string;
    first.unmount();
    authState.isSignedIn = true;
    window.history.replaceState(null, "", returnTo);
    renderPage();
    await waitFor(() => expect((screen.getByLabelText("Job link") as HTMLInputElement).value).toContain("careers.wipro.com"));
    await screen.findByText("ada-resume.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    const body = JSON.parse(String((posts(fetchMock)[0][1] as RequestInit).body));
    expect(body).toMatchObject(routing);
    expect(body.candidateMessage).toContain("cut drop-off 18%");
  });

  it("drops every unrecognized query key, including an external return target and job", async () => {
    authState.isSignedIn = false;
    stub();
    window.history.replaceState(null, "", "/ask?fast=abc&post=12&returnTo=https%3A%2F%2Fexample.com&token=private&job=untrusted&other=value#ignored");
    renderPage();
    fillLink();
    fillReasons();
    await screen.findByTestId("goal-verified-mark");
    fireEvent.click(screen.getByRole("button", { name: "Sign in and send" }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("/ask?fast=abc&post=12"));
  });

  it("saves and restores the link and reasons when no directory company resolves", async () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    const link = "https://careers.example.com/jobs/engineer";
    window.history.replaceState(null, "", "/ask?fast=abc");
    const first = renderPage();
    fillLink(link);
    fillReasons();
    fireEvent.click(screen.getByRole("button", { name: "Sign in and send" }));
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(JSON.parse(sessionStorage.getItem(ASK_PREFILL_KEY) ?? "null")).toMatchObject({ targetRoleUrl: link });
    first.unmount();
    authState.isSignedIn = true;
    window.history.replaceState(null, "", "/ask?fast=abc");
    renderPage();
    await waitFor(() => expect((screen.getByLabelText("Job link") as HTMLInputElement).value).toBe(link));
    expect((screen.getByPlaceholderText(/One result/) as HTMLTextAreaElement).value).toBe("Led a checkout redesign that cut drop-off 18%.");
    expect(posts(fetchMock)).toHaveLength(0);
    await screen.findByText("ada-resume.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(String((posts(fetchMock)[0][1] as RequestInit).body))).toMatchObject({
      targetRoleUrl: link, fastTrackCode: "abc",
    });
  });

  it.each([null, "removed-company"])("restores an already-saved unresolved-company draft independently of the send fix (%s)", async companySlug => {
    stub();
    const link = "https://careers.example.com/jobs/engineer";
    sessionStorage.setItem(ASK_PREFILL_KEY, JSON.stringify({
      companySlug, targetRoleUrl: link,
      note: "Led a checkout redesign that cut drop-off 18%.", savedAt: Date.now(),
    }));
    renderPage();
    await waitFor(() => expect((screen.getByLabelText("Job link") as HTMLInputElement).value).toBe(link));
    expect((screen.getByPlaceholderText(/One result/) as HTMLTextAreaElement).value).toBe("Led a checkout redesign that cut drop-off 18%.");
  });

  it.each(["/explore?fast=other&post=91", "/explore/wipro?fast=other&post=91"])(
    "does not carry another surface's referral query from %s", async path => {
      authState.isSignedIn = false;
      stub();
      window.history.replaceState(null, "", path);
      renderPage();
      fillLink();
      fillReasons();
      await screen.findByTestId("goal-verified-mark");
      fireEvent.click(screen.getByRole("button", { name: "Sign in and send" }));
      await waitFor(() => expect(signIn).toHaveBeenCalledWith("/ask"));
    },
  );
});
