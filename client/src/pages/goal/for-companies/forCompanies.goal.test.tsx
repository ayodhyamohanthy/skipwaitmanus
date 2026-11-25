// @vitest-environment jsdom
// D-048-p3-for-companies: the goal /for-companies page (packet
// docs/plans/D-048-employer.md). Pins the goal contract, the honest loading,
// empty and error states of the company list, sourced employer price claims
// (components/employer/employerPlans.ts, read-only), the §4 rule 1a wording
// (no "credit"/"credits", no noun "ask"/"asks" on this employer page), D-040
// fairness (no outcome promise, no unbuilt programme) and the demo request
// that opens an email and submits nothing silently.
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { EMPLOYER_PLANS, employerPlanPriceLabel } from "@/components/employer/employerPlans";
import ForCompanies from "../../ForCompanies";
import GoalForCompanies, { GOAL_PAGE, goalDemoMailto } from "./GoalForCompanies";

const company = (slug: string, name: string) => ({ slug, name, initials: name.slice(0, 2).toUpperCase(), industry: "Software", location: "Remote", functions: ["Engineering"], blurb: `${name} builds software.`, domains: [`${slug}.example`], openToReferrals: false });
const companies = [company("quillmint", "Quillmint"), company("northbeam", "Northbeam")];

function stubDirectory(mode: "ok" | "empty" | "error" | "pending") {
  const fetchDirectory = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    if (mode === "pending") return new Promise<never>(() => {});
    if (mode === "error") throw new TypeError("Failed to fetch");
    const payload = { companies: mode === "ok" ? companies : [], openCount: 0 };
    return { ok: true, status: 200, url: "", json: async () => payload };
  });
  vi.stubGlobal("fetch", fetchDirectory);
  return fetchDirectory;
}

const renderPage = (page = <GoalForCompanies />) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{page}</QueryClientProvider>);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("goal /for-companies (D-048-p3-for-companies)", () => {
  it("renders the released goal page at the public entrypoint without a surface override", async () => {
    stubDirectory("ok");
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    const { container } = renderPage(<ForCompanies />);
    await screen.findByText("Quillmint");
    assertGoalPage(container, GOAL_PAGE);
    expect(container.querySelector("[data-goal-page='for-companies']")).toBeTruthy();
    expect(container.querySelector("[data-skipwait-screen='for-companies']")).toBeNull();
    expect(screen.queryByText(/EXAMPLE PRICING|DESIGN PREVIEW|workspace preview/i)).toBeNull();
    const nextStep = screen.getByRole("region", { name: "Your next step" });
    expect(within(nextStep).getByRole("button", { name: /Request a demo/ })).toBeTruthy();
  });

  it("lists the companies with no availability claim", async () => {
    const fetchDirectory = stubDirectory("ok");
    renderPage();
    expect(await screen.findByText("Quillmint")).toBeTruthy();
    const list = screen.getByRole("region", { name: "Companies on skipwait.me" });
    expect(within(list).getAllByRole("listitem").map(item => item.textContent)).toEqual(companies.map(item => item.name));
    expect(fetchDirectory.mock.calls.map(([input]) => input)).toEqual(["/api/companies"]);
    expect(document.body.textContent ?? "").not.toMatch(/open to referrals|available|answers in|usually/i);
  });

  it("shows a loading state while the company list loads", () => {
    stubDirectory("pending");
    renderPage();
    expect(screen.getByTestId("goal-skeleton-rows")).toBeTruthy();
  });

  it("shows an honest empty state when no company is listed yet", async () => {
    stubDirectory("empty");
    renderPage();
    expect(await screen.findByTestId("goal-empty-state")).toBeTruthy();
    expect(screen.getByText("No companies are listed yet")).toBeTruthy();
  });

  it("shows an error state with a retry when the list fails, and retries", async () => {
    const fetchDirectory = stubDirectory("error");
    renderPage();
    const error = await screen.findByTestId("goal-error-state");
    expect(within(error).getByText("We couldn't load the companies")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Employer plans" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request a demo" })).toBeTruthy();
    const failedAttempts = fetchDirectory.mock.calls.length;
    fetchDirectory.mockResolvedValueOnce({ ok: true, status: 200, url: "", json: async () => ({ companies, openCount: 0 }) });
    fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Quillmint")).toBeTruthy();
    expect(fetchDirectory.mock.calls.slice(failedAttempts).map(([input]) => input)).toEqual(["/api/companies"]);
    expect(screen.queryByTestId("goal-error-state")).toBeNull();
  });

  it("shows exactly the sourced employer plans and their price labels, and no removed programme", async () => {
    stubDirectory("ok");
    renderPage();
    const pricing = await screen.findByRole("region", { name: "Employer plans" });
    for (const plan of EMPLOYER_PLANS) {
      expect(within(pricing).getByRole("heading", { name: plan.name })).toBeTruthy();
      expect(within(pricing).getByText(employerPlanPriceLabel(plan.price))).toBeTruthy();
      expect(within(pricing).getByText(plan.detail)).toBeTruthy();
    }
    expect(within(pricing).getAllByRole("heading", { level: 3 })).toHaveLength(EMPLOYER_PLANS.length);
    expect(within(pricing).getByText(/there is no self-serve checkout yet/i)).toBeTruthy();
    expect(within(pricing).queryByRole("button")).toBeNull();
    expect(within(pricing).queryByRole("link")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\$199|Referral programme|Team plan|Growth|Scale/);
  });

  it("keeps employer wording: no credits, no noun ask, no outcome promise, referrals never for sale", async () => {
    stubDirectory("ok");
    renderPage();
    await screen.findByText("Quillmint");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bcredits?\b/i);
    expect(text).not.toMatch(/\basks?\b/i);
    expect(text).not.toMatch(/guarantee|get hired|hire faster|\d+% /i);
    expect(text).toMatch(/Referrers are never paid\./);
    expect(text).toMatch(/Employers never buy referrals/);
    expect(text).toMatch(/Featured listing/);
    const benefits = screen.getByRole("region", { name: "What you get" });
    expect(within(benefits).getByText("Candidate names and resumes stay hidden until a verified employee accepts.")).toBeTruthy();
  });

  it("opens the prefilled demo with the selected team size and sends nothing", async () => {
    const input = { email: " hr@acme.example ", company: " Acme ", teamSize: "201–2,000" };
    const expected = new URL("mailto:hello@skipwait.me");
    expected.searchParams.set("subject", "Demo request — Acme");
    expected.searchParams.set("body", "Hi skipwait.me team,\n\nWe'd like a 20-minute demo for Acme (team size 201–2,000).\n\nContact: hr@acme.example\n\nThanks!");
    const assertMailto = (href: string) => {
      const actual = new URL(href);
      expect(`${actual.protocol}${actual.pathname}`).toBe("mailto:hello@skipwait.me");
      expect(actual.searchParams.toString()).toBe(expected.searchParams.toString());
    };
    assertMailto(goalDemoMailto(input));
    const fetchDirectory = stubDirectory("ok");
    const open = vi.fn<Window["open"]>();
    vi.stubGlobal("open", open);
    renderPage(<ForCompanies />);
    await screen.findByText("Quillmint");
    expect(screen.getByText(/nothing is sent until you send it/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: input.email.trim() } });
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: input.company } });
    fireEvent.change(screen.getByLabelText("Team size"), { target: { value: input.teamSize } });
    const initialRequests = [...fetchDirectory.mock.calls];
    fireEvent.click(screen.getByRole("button", { name: /Request a demo/ }));
    expect(open).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^mailto:/), "_self");
    const href = open.mock.calls[0]?.[0];
    if (typeof href !== "string") throw new Error("Missing demo email URL");
    assertMailto(href);
    expect(fetchDirectory.mock.calls).toEqual(initialRequests);
  });

  it("offers claim-your-company only when the claim flag is on, as a plain link", async () => {
    stubDirectory("ok");
    vi.stubEnv("VITE_COMPANY_CLAIM", "true");
    renderPage();
    await screen.findByText("Quillmint");
    const link = screen.getByRole("link", { name: "Claim your company page" });
    expect(link.getAttribute("href")).toBe("/company/claim");
    expect(link.hasAttribute("data-g-primary")).toBe(false);
    cleanup(); vi.unstubAllEnvs(); stubDirectory("ok");
    renderPage();
    await screen.findByText("Quillmint");
    expect(screen.queryByRole("link", { name: "Claim your company page" })).toBeNull();
  });
});
