// @vitest-environment jsdom
// D-048-p3-for-companies: the goal /for-companies page (packet
// docs/plans/D-048-employer.md). Pins the goal contract, the honest loading,
// empty and error states of the company list, sourced employer price claims
// (components/employer/employerPlans.ts, read-only), the §4 rule 1a wording
// (no "credit"/"credits", no noun "ask"/"asks" on this employer page), D-040
// fairness (no outcome promise, no unbuilt programme) and the demo request
// that opens an email and submits nothing silently.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { EMPLOYER_PLANS, employerPlanPriceLabel } from "@/components/employer/employerPlans";
import { demoRequestMailto } from "../../ForCompanies";
import GoalForCompanies, { GOAL_PAGE, goalDemoMailto } from "./GoalForCompanies";

const company = (slug: string, name: string) => ({ slug, name, initials: name.slice(0, 2).toUpperCase(), industry: "Software", location: "Remote", functions: ["Engineering"], blurb: `${name} builds software.`, domains: [`${slug}.example`], openToReferrals: false });
const companies = [company("quillmint", "Quillmint"), company("northbeam", "Northbeam")];

function stubDirectory(mode: "ok" | "empty" | "error" | "pending") {
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (mode === "pending") return new Promise(() => {});
    if (mode === "error") throw new TypeError("Failed to fetch");
    const payload = { companies: mode === "ok" ? companies : [], openCount: 0 };
    return { ok: true, status: 200, url: "", json: async () => payload };
  }));
}

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GoalForCompanies /></QueryClientProvider>);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("goal /for-companies (D-048-p3-for-companies)", () => {
  it("meets the goal page contract: one h1 goal line, one next step, one black commit", async () => {
    stubDirectory("ok");
    const { container } = renderPage();
    await screen.findByText("Quillmint");
    assertGoalPage(container, GOAL_PAGE);
    expect(container.querySelector("[data-goal-page='for-companies']")).toBeTruthy();
    const nextStep = screen.getByRole("region", { name: "Your next step" });
    expect(within(nextStep).getByRole("button", { name: /Request a demo/ })).toBeTruthy();
  });

  it("lists the companies with no availability claim", async () => {
    stubDirectory("ok");
    renderPage();
    expect(await screen.findByText("Quillmint")).toBeTruthy();
    expect(screen.getByText("Northbeam")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Companies on skipwait.me" })).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/available|answers in|usually/i);
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
    stubDirectory("error");
    renderPage();
    const error = await screen.findByTestId("goal-error-state");
    expect(within(error).getByText("We couldn't load the companies")).toBeTruthy();
    const calls = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(calls));
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
  });

  it("builds the same demo email as the kit page and opens it without submitting anything", async () => {
    const input = { email: " hr@acme.example ", company: " Acme ", teamSize: "201–2,000" };
    expect(goalDemoMailto(input)).toBe(demoRequestMailto(input));
    stubDirectory("ok");
    const open = vi.fn();
    vi.stubGlobal("open", open);
    renderPage();
    await screen.findByText("Quillmint");
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "hr@acme.example" } });
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: /Request a demo/ }));
    expect(open).toHaveBeenCalledWith(goalDemoMailto({ email: "hr@acme.example", company: "Acme", teamSize: "1–200" }), "_self");
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.every(call => String(call[0]) === "/api/companies")).toBe(true);
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
