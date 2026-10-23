// @vitest-environment jsdom
// The ask drawer on Find a referral (design/goal-ui/pick/find-a-referral.*):
// the job-link hint, the resume, three 140-character reasons (D-077(4)), the
// cost line from the first moment, the live send contract and every refusal
// the server can answer with. Nothing here invents money copy: the assertions
// read the shared strings the server and /ask already use.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { OPPORTUNITY_FIRST_LOOK_HOURS } from "@shared/companyOpportunities";
import { CREDIT_ENDED_CAVEAT, MONEY_SENTENCE } from "@shared/moneyCopy";
import { COMPANY_CAP_REACHED, companyCapCopy, SLOT_CAP_REACHED } from "@shared/openAskSlots";
import { ASK_PREFILL_KEY } from "@/lib/askPrefill";
import { ASK_NETWORK_ERROR } from "@/components/ask/askApi";
import Explore from "./Explore";

const { go, authState, accessState, signIn } = vi.hoisted(() => ({
  go: vi.fn(),
  authState: { isLoaded: true, isSignedIn: true },
  accessState: { status: "unverified" as "unverified" | "verified" | "signed-out" },
  signIn: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => accessState }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/explore", go],
  useSearch: () => "",
  useRoute: () => [false, null],
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
const WIPRO_CLOSED = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug, seed.slug !== "wipro")));
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
const setup = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };
const CREATED = { requestId: 501, companyDomain: "wipro.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } };

type Reply = { status: number; body: unknown };

function stub(options: { directory?: CompanyDirectoryResponse; credits?: number; send?: () => Reply; alert?: () => Reply } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies") return json(200, options.directory ?? ALL_OPEN);
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: options.credits ?? 4 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path === "/api/ask-drafts" && method === "PUT") return json(200, { draft: { ...(JSON.parse(String(init?.body)) as object), updatedAt: "x" } });
    if (path === "/api/ask-drafts" && method === "DELETE") return json(200, { ok: true });
    if (path === "/api/company-referrals" && method === "POST") { const reply = options.send?.() ?? { status: 200, body: CREATED }; return json(reply.status, reply.body); }
    if (path === "/api/seeker-alerts" && method === "POST") { const reply = options.alert?.() ?? { status: 200, body: { ok: true } }; return json(reply.status, reply.body); }
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Explore /></QueryClientProvider>);
const openWipro = async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("link", { name: "Wipro" }));
  return screen.findByTestId("goal-drawer");
};
const fillLink = (drawer: HTMLElement, value = "https://careers.wipro.com/jobs/1234567-product-designer") => {
  const input = within(drawer).getByLabelText("Job link");
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
};
const fillReasons = (drawer: HTMLElement) => {
  fireEvent.change(within(drawer).getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
  fireEvent.change(within(drawer).getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
  fireEvent.change(within(drawer).getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
};
const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/company-referrals" && (init as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  accessState.status = "unverified";
  sessionStorage.clear();
  signIn.mockReset();
  go.mockReset();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ask drawer", () => {
  it("opens from a company row with the privacy line and the cost from the first moment", async () => {
    stub();
    const drawer = await openWipro();
    expect(within(drawer).getByRole("heading", { name: "Ask for a referral" })).toBeTruthy();
    expect(within(drawer).getByTestId("goal-verified-mark").textContent).toContain("Goes to verified Wipro employees");
    expect(within(drawer).getByText("Referrers see your job link and reasons. Your name and resume are shared only if one accepts.")).toBeTruthy();
    await waitFor(() => expect(within(drawer).getByTestId("goal-ask-cost").textContent).toBe("Uses 1 of your 4 credits"));
    // The cost is stated in one shared sentence pair (D-063): no retyped price.
    expect(within(drawer).getByTestId("goal-money-sentence").textContent).toBe(MONEY_SENTENCE);
    expect(within(drawer).getByText("ada-resume.pdf")).toBeTruthy();
    expect(within(drawer).getByText("Shared after a referrer accepts")).toBeTruthy();
    expect(within(drawer).getByRole("group", { name: "Why me" })).toBeTruthy();
    expect(within(drawer).getAllByTestId("goal-reason-input")).toHaveLength(3);
    expect(within(drawer).getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Send ask" })).toBeTruthy();
  });

  it("reads the job link honestly: another employer is an error, Wipro's own site passes, a job board is confirmed on send", async () => {
    stub();
    const drawer = await openWipro();
    fillLink(drawer, "https://careers.acme.com/jobs/senior-designer");
    expect(within(drawer).getByText("This link isn’t from Wipro. Paste a job link from Wipro’s own careers page.")).toBeTruthy();
    expect(within(drawer).getByLabelText("Job link").getAttribute("aria-invalid")).toBe("true");
    fillLink(drawer);
    expect(within(drawer).getByText("Matches Wipro’s careers site")).toBeTruthy();
    expect(within(drawer).getByText("Wipro · Product Designer")).toBeTruthy();
    fillLink(drawer, "https://www.linkedin.com/jobs/view/4446365088");
    expect(within(drawer).getByText("We’ll confirm it’s a Wipro role when you send.")).toBeTruthy();
  });

  it("sends the live ask contract and reports the sent ask truthfully", async () => {
    const fetchMock = stub();
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    const sent = await screen.findByText("Ask sent to Wipro.");
    expect(sent).toBeTruthy();
    const call = posts(fetchMock)[0];
    if (!call) throw new Error("the ask was never posted");
    const [url, init] = call;
    expect(url).toBe("/api/company-referrals");
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body).toEqual({
      targetRoleUrl: "https://careers.wipro.com/jobs/1234567-product-designer",
      attachmentIds: [77],
      candidateMessage: "Led a checkout redesign that cut drop-off 18%.\nShipped a design system used by 40 teams.\nBuilt the onboarding flow end to end.",
      companySlug: "wipro",
    });
    expect((init as RequestInit).headers).toMatchObject({ "Idempotency-Key": expect.stringMatching(/^[0-9a-f-]{36}$/) });
    const active = await screen.findByTestId("goal-drawer");
    expect(within(active).getByText(`Verified wipro.com employees can see it now. If nobody picks it up within ${ASK_TTL_DAYS} days, it closes and the credit comes back, ${CREDIT_ENDED_CAVEAT}; once someone picks it up, the credit stays spent.`)).toBeTruthy();
    expect(within(active).getByText("Open asks 1 of 3")).toBeTruthy();
    expect(within(active).getByRole("link", { name: "Track this ask" }).getAttribute("href")).toBe("/conversation/501");
    await waitFor(() => expect(fetchMock.mock.calls.some(([path, init2]) => String(path) === "/api/ask-drafts" && (init2 as RequestInit | undefined)?.method === "DELETE")).toBe(true));
    fireEvent.click(within(active).getByRole("button", { name: "Ask at another company" }));
    await waitFor(() => expect(screen.queryByTestId("goal-drawer")).toBeNull());
    expect(go).toHaveBeenCalledWith("/explore", { replace: true });
  });

  it("says the poster sees a post-bound ask first, then the pool, with the money sentence verbatim (D-174)", async () => {
    stub({ send: () => ({ status: 200, body: { ...CREATED, fromPost: true, firstLook: true } }) });
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    const active = await screen.findByTestId("goal-drawer");
    expect(within(active).getByText(`The employee who posted this role sees your ask first. If they pass, or don’t accept within ${OPPORTUNITY_FIRST_LOOK_HOURS} hours, other verified wipro.com employees can see it. If nobody picks it up within ${ASK_TTL_DAYS} days, it closes and the credit comes back, ${CREDIT_ENDED_CAVEAT}; once someone picks it up, the credit stays spent.`)).toBeTruthy();
    expect(within(active).queryByText(/^Verified wipro.com employees can see it now\./)).toBeNull();
  });

  it("states the uncovered company's free wait and the later hold, verbatim (D-034, D-047)", async () => {
    stub({ send: () => ({ status: 200, body: { ...CREATED, coverageStatus: "waiting_for_company_coverage" } }) });
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    const active = await screen.findByTestId("goal-drawer");
    expect(within(active).getByText(`No verified employee there can see it yet, so nothing was spent. It waits for free up to ${COVERAGE_WAIT_DAYS} days: when one can see it, 1 credit is used and it goes live; if you have no credit then, we hold it until you add one.`)).toBeTruthy();
    expect(within(active).getByRole("link", { name: "Track this ask" }).getAttribute("href")).toBe("/conversation/501");
  });

  it("holds the send until the link, resume and reasons are there", async () => {
    const fetchMock = stub();
    const drawer = await openWipro();
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    expect(within(drawer).getAllByRole("alert").map(alert => alert.textContent)).toContain("Add the official job link first.");
    fillLink(drawer);
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    expect(within(drawer).getAllByRole("alert").map(alert => alert.textContent)).toContain("Write your reasons first (at least a sentence or two).");
    fireEvent.change(within(drawer).getByPlaceholderText(/One result/), { target: { value: "x".repeat(141) } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    expect(within(drawer).getAllByRole("alert").map(alert => alert.textContent)).toContain("Keep each reason to 140 characters.");
    expect(within(drawer).getByPlaceholderText(/One result/).getAttribute("aria-invalid")).toBe("true");
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it("sends on Cmd+Enter too", async () => {
    const fetchMock = stub();
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.keyDown(within(drawer).getByLabelText("Job link"), { key: "Enter", metaKey: true });
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
  });

  it("shows the server's slot-cap refusal without pretending the ask was sent", async () => {
    stub({ send: () => ({ status: 409, body: { error: "All 3 slots are in use.", code: SLOT_CAP_REACHED, slots: { plan: "free", planLabel: "Free", open: 3, cap: 3, full: true, nextPlan: null } } }) });
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    const alert = await within(drawer).findByRole("alert");
    expect(alert.textContent).toContain("Your 3 requests are all open.");
    expect(alert.textContent).toContain("Queue position stays equal either way.");
    expect(screen.queryByText(/Ask sent to/)).toBeNull();
    expect(within(drawer).getByLabelText("Job link")).toBeTruthy();
  });

  it("explains the per-company cap as the same limit on every plan", async () => {
    stub({ send: () => ({ status: 409, body: { error: "cap", code: COMPANY_CAP_REACHED, companyDomain: "wipro.com", open: 2, cap: 2 } }) });
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    const alert = await within(drawer).findByRole("alert");
    expect(alert.textContent).toBe(companyCapCopy("wipro.com"));
  });

  it("keeps the form when the network drops, with the plain network copy", async () => {
    stub({ send: () => { throw new TypeError("Failed to fetch"); } });
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    expect((await within(drawer).findByRole("alert")).textContent).toBe(ASK_NETWORK_ERROR);
    expect((within(drawer).getByLabelText("Job link") as HTMLInputElement).value).toBe("https://careers.wipro.com/jobs/1234567-product-designer");
    expect((within(drawer).getByPlaceholderText(/One result/) as HTMLTextAreaElement).value).toContain("checkout redesign");
  });

  it("says there are no credits and suppresses the send before any request", async () => {
    const fetchMock = stub({ credits: 0 });
    const drawer = await openWipro();
    await waitFor(() => expect(within(drawer).getByTestId("goal-ask-cost").textContent).toBe("You have no credits left"));
    const send = within(drawer).getByRole("button", { name: "Send ask" });
    expect(send.getAttribute("aria-disabled")).toBe("true");
    fillLink(drawer);
    fillReasons(drawer);
    fireEvent.click(send);
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it("hands a signed-out seeker to sign-in with the company, link and reasons kept", async () => {
    authState.isSignedIn = false;
    stub();
    const drawer = await openWipro();
    expect(within(drawer).getByText("You’ll sign in before it’s sent. We keep your link and reasons.")).toBeTruthy();
    expect(within(drawer).getByText("You’ll add your resume after you sign in.")).toBeTruthy();
    fillLink(drawer);
    fillReasons(drawer);
    fireEvent.click(within(drawer).getByRole("button", { name: "Sign in and send" }));
    expect(signIn).toHaveBeenCalledWith("/ask");
    const prefill = JSON.parse(sessionStorage.getItem(ASK_PREFILL_KEY) ?? "null") as Record<string, unknown>;
    expect(prefill).toMatchObject({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1234567-product-designer" });
    expect(String(prefill.note)).toContain("checkout redesign");
  });

  it("keeps a saved draft for the company it was written for", async () => {
    const fetchMock = stub();
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    fireEvent.click(within(drawer).getByRole("button", { name: "Save draft" }));
    expect(await within(drawer).findByRole("button", { name: "Draft saved" })).toBeTruthy();
    const put = fetchMock.mock.calls.find(([path, init]) => String(path) === "/api/ask-drafts" && (init as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse(String((put?.[1] as RequestInit | undefined)?.body))).toMatchObject({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1234567-product-designer", note: "Led a checkout redesign that cut drop-off 18%.\nShipped a design system used by 40 teams.\nBuilt the onboarding flow end to end." });
  });

  it("starts the next company empty instead of carrying another company's link and reasons", async () => {
    stub();
    const drawer = await openWipro();
    fillLink(drawer);
    fillReasons(drawer);
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("goal-drawer")).toBeNull());
    fireEvent.click(screen.getByRole("link", { name: "Merkle" }));
    const next = await screen.findByTestId("goal-drawer");
    expect((within(next).getByLabelText("Job link") as HTMLInputElement).value).toBe("");
    expect((within(next).getByPlaceholderText(/One result/) as HTMLTextAreaElement).value).toBe("");
    expect(within(next).getAllByText("0/140")).toHaveLength(3);
    // The resume belongs to the seeker, not the company: it stays available.
    expect(within(next).getByText("ada-resume.pdf")).toBeTruthy();
  });

  it("offers the alert on a company that is not open, and says an alert is not a referral", async () => {
    const fetchMock = stub({ directory: WIPRO_CLOSED });
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Wipro" }));
    const drawer = await screen.findByTestId("goal-drawer");
    fireEvent.click(within(drawer).getByRole("button", { name: "Get told when a referrer joins" }));
    expect(await within(drawer).findByText("We’ll tell you when a verified employee at Wipro joins.")).toBeTruthy();
    const alert = fetchMock.mock.calls.find(([path, init]) => String(path) === "/api/seeker-alerts" && (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((alert?.[1] as RequestInit | undefined)?.body))).toEqual({ companyDomain: "wipro.com" });
    expect(within(drawer).getByText("An alert is not a referral.")).toBeTruthy();
  });
});
