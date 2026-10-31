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

describe("Ask composer page (goal, W2)", () => {
  it("renders the goal composer: one black Send ask, the cost line and the refund rules from the first moment, no kit chrome", async () => {
    stub();
    renderPage();
    await waitFor(() => expect(page().getByRole("heading", { name: "Ask for a referral" })).toBeTruthy());
    expect(screen.getByText("Referrers see your job link and reasons. Your name and resume are shared only if one accepts.")).toBeTruthy();
    expect(screen.getByLabelText("Job link")).toBeTruthy();
    expect(screen.getByText("ada-resume.pdf")).toBeTruthy();
    expect(screen.getByText("Shared after a referrer accepts")).toBeTruthy();
    expect(screen.getByText("Why me")).toBeTruthy();
    expect(screen.getAllByText(/\/ 140|\/140/).length).toBe(3);
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Uses 1 credit when a verified employee can see it"));
    expect(screen.getByText(/Comes back if you withdraw before anyone picks it up/)).toBeTruthy();
    expect(screen.getByText(/Once picked up, it stays spent, even if they pass\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send ask" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    // No kit composer survives: no strength meter, no function eyebrow, no panels.
    expect(screen.queryByText("Write a great ask.")).toBeNull();
    expect(screen.queryByText("ASK STRENGTH")).toBeNull();
    expect(screen.queryByLabelText("Job function")).toBeNull();
    expect(document.querySelector(".page-content, .page-heading")).toBeNull();
    expect(document.querySelector("[data-skipwait-screen='ask']")).toBeTruthy();
  });

  it("resolves the company from the job link: verified mark, back link and honest hint follow", async () => {
    stub();
    renderPage();
    expect((await screen.findByRole("link", { name: /All companies/ })).getAttribute("href")).toBe("/explore");
    fillLink();
    expect(await screen.findByTestId("goal-verified-mark")).toBeTruthy();
    expect(screen.getByTestId("goal-verified-mark").textContent).toContain("Goes to verified Wipro employees");
    expect(screen.getByText("Matches Wipro’s careers site")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Wipro/ }).getAttribute("href")).toBe("/explore/wipro");
    expect(screen.getByText("Wipro · Product Designer")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Uses 1 of your 4 credits"));
  });

  it("keeps composing behind sign-in and hands the draft to sign-in on send", async () => {
    authState.isSignedIn = false;
    stub();
    renderPage();
    await waitFor(() => expect(page().getByRole("heading", { name: "Ask for a referral" })).toBeTruthy());
    expect(screen.getByText("You’ll sign in before it’s sent. We keep your link and reasons.")).toBeTruthy();
    fillLink();
    fillReasons();
    fireEvent.click(screen.getByRole("button", { name: "Sign in and send" }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("/ask"));
    const saved = JSON.parse(sessionStorage.getItem(ASK_PREFILL_KEY) ?? "null");
    expect(saved).toMatchObject({ targetRoleUrl: "https://careers.wipro.com/jobs/1234567-product-designer" });
    expect(posts(vi.mocked(globalThis.fetch as never) as never)).toEqual([]);
  });

  it("picks up the sign-in handoff prefill for its company and clears it once sent", async () => {
    const fetchMock = stub();
    sessionStorage.setItem(ASK_PREFILL_KEY, JSON.stringify({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1234567-product-designer", note: "Led a checkout redesign that cut drop-off 18%.\nShipped a design system used by 40 teams.", savedAt: Date.now() }));
    renderPage();
    await waitFor(() => expect((screen.getByLabelText("Job link") as HTMLInputElement).value).toBe("https://careers.wipro.com/jobs/1234567-product-designer"));
    expect((screen.getByPlaceholderText(/One result/) as HTMLTextAreaElement).value).toBe("Led a checkout redesign that cut drop-off 18%.");
    expect((screen.getByPlaceholderText(/Another result/) as HTMLTextAreaElement).value).toBe("Shipped a design system used by 40 teams.");
    expect(await screen.findByTestId("goal-verified-mark")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(sessionStorage.getItem(ASK_PREFILL_KEY)).toBeNull();
  });

  it("an ask from a posted role says the poster sees it first and sends the post id", async () => {
    const fetchMock = stub();
    window.history.replaceState(null, "", "/ask?post=91&job=https%3A%2F%2Fcareers.wipro.com%2Fjobs%2F1234567-product-designer");
    renderPage();
    await waitFor(() => expect((screen.getByLabelText("Job link") as HTMLInputElement).value).toBe("https://careers.wipro.com/jobs/1234567-product-designer"));
    expect(screen.getByText("The employee who posted this role sees your ask first, for 24 hours. After that, other verified referrers at the company can pick it up.")).toBeTruthy();
    fillReasons();
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
    await screen.findByRole("status");
    const call = posts(fetchMock as never)[0] as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toMatchObject({ opportunityId: 91, companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1234567-product-designer" });
  });

  it("sends the live contract: idempotency key, composed note, setup resume, and the sent state with See my asks", async () => {
    const fetchMock = stub();
    renderPage();
    fillLink();
    fillReasons();
    await screen.findByTestId("goal-verified-mark");
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
    const status = await screen.findByRole("status");
    expect(within(status).getByRole("heading", { name: "Ask sent to Wipro." })).toBeTruthy();
    expect(within(status).getByTestId("goal-status").textContent).toContain("Waiting");
    expect(within(status).getByText(/Verified wipro\.com employees can see it now/)).toBeTruthy();
    expect(within(status).getByRole("link", { name: "See my asks" }).getAttribute("href")).toBe("/requests");
    expect(within(status).getByRole("link", { name: "Ask another company" }).getAttribute("href")).toBe("/explore");
    const call = posts(fetchMock as never)[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(call[1].headers["Idempotency-Key"]).toMatch(/^[\x21-\x7E]{16,64}$/);
    expect(JSON.parse(call[1].body)).toMatchObject({
      targetRoleUrl: "https://careers.wipro.com/jobs/1234567-product-designer",
      attachmentIds: [77],
      companySlug: "wipro",
      candidateMessage: "Led a checkout redesign that cut drop-off 18%.\nShipped a design system used by 40 teams.\nBuilt the onboarding flow end to end.",
    });
  });

  it("rejects an unsupported resume type before any upload", async () => {
    const fetchMock = stub();
    renderPage();
    await waitFor(() => expect(page().getByRole("heading", { name: "Ask for a referral" })).toBeTruthy());
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["x"], "resume.txt", { type: "text/plain" })] } });
    expect(screen.getByText(/Use a PDF, Word document, PNG, or JPEG resume/)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/uploads"))).toBe(false);
  });

  it("saves a draft for the resolved company", async () => {
    const fetchMock = stub();
    renderPage();
    fillLink();
    fillReasons();
    await screen.findByTestId("goal-verified-mark");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("button", { name: "Draft saved" });
    const put = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/ask-drafts" && (init as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse(String((put as unknown as [string, { body: string }])[1].body))).toMatchObject({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1234567-product-designer" });
  });
});
