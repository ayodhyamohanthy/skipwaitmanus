// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FindReferral from "./FindReferral";

const state = vi.hoisted(() => ({ signedIn: true, path: "/explore", search: "", navigate: vi.fn(), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, userId: "u1", getToken: async () => null, openSignIn: state.openSignIn }) }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children, drawer }: { children: React.ReactNode; drawer?: React.ReactNode }) => <div>{children}{drawer}</div> }));
vi.mock("@/lib/seo", () => ({ applySeo: () => {} }));
const handoff = vi.hoisted(() => ({ goToSeekerSignIn: vi.fn() }));
vi.mock("./signInHandoff", () => handoff);
vi.mock("wouter", () => ({
  useLocation: () => [state.path, state.navigate],
  useSearch: () => state.search,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const company = (slug: string, name: string, open: boolean, functions = ["Engineering", "Data"]) => ({ slug, name, initials: "XX", industry: "Software", location: "Global", functions, blurb: "A company that hires.", domains: [`${slug}.example`], openToReferrals: open });
const DIRECTORY = { companies: [company("zeta", "Zeta Labs", true), company("acme", "Acme", true), company("orchid", "Orchid", false, ["Finance"])], openCount: 2 };
let sendResponse: { status: number; body: unknown } = { status: 201, body: { requestId: 91, companyDomain: "acme.example", coverageStatus: "covered", slots: { plan: "free", planLabel: "Free", open: 2, cap: 3, full: false, nextPlan: null } } };
const sent: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
let draft: unknown = null;

function setLocation(path: string, search = "") {
  state.path = path;
  state.search = search.replace(/^\?/, "");
  window.history.replaceState({}, "", `${path}${search}`);
}

beforeEach(() => {
  state.signedIn = true;
  state.navigate.mockClear();
  state.openSignIn.mockClear();
  setLocation("/explore");
  sent.length = 0;
  draft = null;
  sessionStorage.clear();
  sendResponse = { status: 201, body: { requestId: 91, companyDomain: "acme.example", coverageStatus: "covered", slots: { plan: "free", planLabel: "Free", open: 2, cap: 3, full: false, nextPlan: null } } };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url === "/api/companies") return json(DIRECTORY);
    if (url.startsWith("/api/credits/summary")) return json({ summary: { totalAvailable: 2 } });
    if (url === "/api/profile/setup") return json({ goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "Need sponsorship for some countries", resume: { id: 3101, fileName: "My_Resume.pdf" } });
    if (url === "/api/ask-drafts") return json({ draft });
    if (init?.method === "POST") {
      sent.push({ url, body: JSON.parse(String(init.body)), headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)) });
      if (url === "/api/company-referrals") return json(sendResponse.body, sendResponse.status);
      if (url === "/api/seeker-alerts") return json({ alert: { id: 1 } }, 201);
    }
    return json({ error: "not mocked" }, 404);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FindReferral /></QueryClientProvider>);
}
async function fillAsk(user: ReturnType<typeof userEvent.setup>, link: string) {
  const drawer = await screen.findByRole("dialog", { name: "Ask for a referral" });
  await user.clear(within(drawer).getByLabelText("Job link"));
  await user.type(within(drawer).getByLabelText("Job link"), link);
  await user.type(within(drawer).getByLabelText(/Reason 1/), "Built the payouts service for a lender and cut settlement mismatches by 75%.");
  await user.type(within(drawer).getByLabelText(/Reason 2/), "Ran on-call for 14 services.");
  return drawer;
}

describe("Find a referral (goal UI)", () => {
  it("lists companies alphabetically and filters by availability, function and search", async () => {
    const user = userEvent.setup();
    renderPage();
    const names = async () => (await screen.findAllByRole("button", { name: /open to requests|not open yet/ })).map(button => button.getAttribute("aria-label")?.split(",")[0]);
    expect(await names()).toEqual(["Acme", "Orchid", "Zeta Labs"]);
    await user.click(screen.getByRole("button", { name: "Open to requests" }));
    expect(await names()).toEqual(["Acme", "Zeta Labs"]);
    await user.click(screen.getByRole("button", { name: "All companies" }));
    await user.click(screen.getByRole("button", { name: "Finance" }));
    expect(await names()).toEqual(["Orchid"]);
    await user.click(screen.getByRole("button", { name: "Finance" }));
    await user.type(screen.getByRole("searchbox", { name: "Search companies" }), "nothing like this");
    expect(await screen.findByText("No matching companies yet")).toBeTruthy();
  });

  it("opens a company's ask through the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Acme, open to requests" }));
    expect(state.navigate).toHaveBeenCalledWith("/explore?company=acme", { replace: true });
  });

  it("sends with the resume on file, the three-line note, the company slug and an idempotency key", async () => {
    const user = userEvent.setup();
    setLocation("/explore", "?company=acme");
    renderPage();
    const drawer = await fillAsk(user, "https://careers.acme.example/jobs/backend-engineer");
    expect(within(drawer).getByText("Goes to verified Acme employees")).toBeTruthy();
    expect(within(drawer).getByText("My_Resume.pdf")).toBeTruthy();
    expect(await within(drawer).findByText("Uses 1 of your 2 credits")).toBeTruthy();
    expect(within(drawer).getByText("Matches Acme’s careers site")).toBeTruthy();
    await user.click(within(drawer).getByRole("button", { name: /Send ask/ }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].url).toBe("/api/company-referrals");
    expect(sent[0].body).toEqual({
      targetRoleUrl: "https://careers.acme.example/jobs/backend-engineer",
      attachmentIds: [3101],
      candidateMessage: "Built the payouts service for a lender and cut settlement mismatches by 75%.\nRan on-call for 14 services.",
      companySlug: "acme",
    });
    expect(sent[0].headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("Ask sent to Acme.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Track this ask" }).getAttribute("href")).toBe("/requests?ask=91");
    expect(sessionStorage.getItem("skipwait-ask-idempotency-key")).toBeNull();
  });

  it("keeps a personal-link ask with its referrer (D-017)", async () => {
    const user = userEvent.setup();
    setLocation("/ask", "?fast=abcdefabcdefabcd01");
    renderPage();
    await fillAsk(user, "https://careers.acme.example/jobs/backend-engineer");
    await user.click(screen.getByRole("button", { name: /Send ask/ }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toMatchObject({ fastTrackCode: "abcdefabcdefabcd01" });
    expect(sent[0].body).not.toHaveProperty("companySlug");
  });

  it("shows the plan's slot-cap refusal in plain words", async () => {
    const user = userEvent.setup();
    sendResponse = { status: 409, body: { error: "All open", code: "slot_cap_reached", slots: { plan: "free", planLabel: "Free", open: 3, cap: 3, full: true, nextPlan: null } } };
    setLocation("/explore", "?company=acme");
    renderPage();
    await fillAsk(user, "https://careers.acme.example/jobs/backend-engineer");
    await user.click(screen.getByRole("button", { name: /Send ask/ }));
    expect(await screen.findByText(/Your 3 requests are all open/)).toBeTruthy();
  });

  it("blocks a link from another company before anything is sent", async () => {
    const user = userEvent.setup();
    setLocation("/explore", "?company=acme");
    renderPage();
    const drawer = await fillAsk(user, "https://careers.zeta.example/jobs/backend-engineer");
    expect(within(drawer).getByText(/This link isn’t from Acme/)).toBeTruthy();
    await user.click(within(drawer).getByRole("button", { name: /Send ask/ }));
    expect(sent).toHaveLength(0);
  });

  it("hands a signed-out ask to job-seeker sign-in with the link and reasons kept", async () => {
    const user = userEvent.setup();
    state.signedIn = false;
    handoff.goToSeekerSignIn.mockClear();
    setLocation("/explore", "?company=acme");
    renderPage();
    await fillAsk(user, "https://careers.acme.example/jobs/backend-engineer");
    await user.click(screen.getByRole("button", { name: /Sign in and send/ }));
    expect(handoff.goToSeekerSignIn).toHaveBeenCalledWith("/ask");
    const prefill = JSON.parse(sessionStorage.getItem("skipwait-ask-prefill") ?? "{}");
    expect(prefill).toMatchObject({ companySlug: "acme", targetRoleUrl: "https://careers.acme.example/jobs/backend-engineer" });
    expect(prefill.note).toContain("Ran on-call for 14 services.");
    expect(sent).toHaveLength(0);
  });

  it("is honest about a company with no available employee, and offers an alert", async () => {
    const user = userEvent.setup();
    setLocation("/explore", "?company=orchid");
    renderPage();
    const drawer = await screen.findByRole("dialog", { name: "Ask for a referral" });
    expect(within(drawer).getByText("No credit used until a verified employee can see it")).toBeTruthy();
    expect(within(drawer).queryByText(/Goes to verified/)).toBeNull();
    await user.click(within(drawer).getByRole("button", { name: /Get told when a referrer joins/ }));
    await waitFor(() => expect(sent).toEqual([expect.objectContaining({ url: "/api/seeker-alerts", body: { companyDomain: "orchid.example" } })]));
    expect(await within(drawer).findByText("We’ll tell you when a verified employee at Orchid joins.")).toBeTruthy();
  });

  it("on /ask, a company page's prefill wins and a saved draft fills only what is empty", async () => {
    sessionStorage.setItem("skipwait-ask-prefill", JSON.stringify({ companySlug: "acme", targetRoleUrl: "https://careers.acme.example/jobs/data-engineer", note: "Built a data platform used by 40 teams.\nCut query costs by 30%.", savedAt: Date.now() }));
    draft = { companySlug: "zeta", targetRoleUrl: "https://careers.zeta.example/jobs/other", note: "Draft note", updatedAt: new Date().toISOString() };
    setLocation("/ask");
    renderPage();
    const drawer = await screen.findByRole("dialog", { name: "Ask for a referral" });
    expect((within(drawer).getByLabelText("Job link") as HTMLInputElement).value).toBe("https://careers.acme.example/jobs/data-engineer");
    expect((within(drawer).getByLabelText(/Reason 1/) as HTMLTextAreaElement).value).toBe("Built a data platform used by 40 teams.");
    expect((within(drawer).getByLabelText(/Reason 2/) as HTMLTextAreaElement).value).toBe("Cut query costs by 30%.");
    expect(await within(drawer).findByText("Goes to verified Acme employees")).toBeTruthy();
  });

  it("sends a posted role's id for the poster's first look (D-022)", async () => {
    const user = userEvent.setup();
    setLocation("/ask", "?post=42&job=https%3A%2F%2Fcareers.acme.example%2Fjobs%2Fbackend-engineer");
    renderPage();
    const drawer = await screen.findByRole("dialog", { name: "Ask for a referral" });
    expect(within(drawer).getByText(/The employee who posted this role sees your ask first, for 48 hours/)).toBeTruthy();
    expect((within(drawer).getByLabelText("Job link") as HTMLInputElement).value).toBe("https://careers.acme.example/jobs/backend-engineer");
    await user.type(within(drawer).getByLabelText(/Reason 1/), "Built the payouts service for a lender and cut settlement mismatches by 75%.");
    await user.click(within(drawer).getByRole("button", { name: /Send ask/ }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toMatchObject({ opportunityId: 42, targetRoleUrl: "https://careers.acme.example/jobs/backend-engineer" });
  });

  it("says nothing was spent when the ask waits for coverage (D-034)", async () => {
    const user = userEvent.setup();
    sendResponse = { status: 201, body: { requestId: 92, companyDomain: "orchid.example", coverageStatus: "waiting_for_company_coverage", slots: null } };
    setLocation("/explore", "?company=orchid");
    renderPage();
    await fillAsk(user, "https://careers.orchid.example/jobs/analyst");
    await user.click(screen.getByRole("button", { name: /Send ask/ }));
    expect(await screen.findByText(/nothing was spent/)).toBeTruthy();
  });
});
