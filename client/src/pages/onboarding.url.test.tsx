// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Onboarding from "./Onboarding";

vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }), useUser: () => ({ isLoaded: true, user: null }), SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

describe("Onboarding Target Role URL", () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ canonicalUrl: "https://careers.example.com/jobs/product-designer", status: "fresh", employerConfidence: "direct-domain", companyDomain: "example.com", reason: "Company identified", recoveryAction: "Continue" }) }))); });
  afterEach(() => cleanup());

  it("blocks arbitrary text and enables continue as soon as the link is valid", async () => {
    render(<Onboarding />);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(document.querySelector("[data-skipwait-logo-mark='true']")).toBeNull();
    expect(screen.queryByText("skipwait.me")).toBeNull();
    const input = screen.getByLabelText("Target Role URL");
    const continueButton = screen.getByRole("button", { name: "Continue" });

    fireEvent.change(input, { target: { value: "product designer at Example" } });
    expect(screen.getByRole("alert").textContent).toMatch(/complete job link/i);
    expect(continueButton).toHaveProperty("disabled", true);
    expect(screen.getByText("Fix the link above to continue")).toBeTruthy();
    expect(continueButton.getAttribute("aria-describedby")).toBe("continue-hint");

    fireEvent.change(input, { target: { value: "https://careers.example.com/jobs/product-designer" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(continueButton).toHaveProperty("disabled", false);
    expect(screen.queryByText("Fix the link above to continue")).toBeNull();
  });

  it("blocks a hostname-derived employer when the page is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ canonicalUrl: "https://careers.example.com/jobs/product-designer", status: "unreachable", employerConfidence: "unreachable", reason: "We could not reach this job link.", recoveryAction: "Check the link and try again." }) })));
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://careers.example.com/jobs/product-designer" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("We could not reach this job link."));
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Company domain"), { target: { value: "example.com" } });
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false);
  });

  it("blocks an unreachable link without a safely identified employer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ canonicalUrl: "https://jobs.lever.co/unknown/1", status: "unreachable", employerConfidence: "unreachable", reason: "We could not reach this job link.", recoveryAction: "Check the link and try again." }) })));
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://jobs.lever.co/unknown/1" } });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
  });

  it("keeps Continue available with a retryable error when the preview service fails", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("network down"); });
    vi.stubGlobal("fetch", fetchMock);
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://jobs.lever.co/unknown/1" } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't verify this job link");
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false);
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("falls back to the reviewed employer when the preview service fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://www.wellfound.com/jobs/3971835-account-executive/?source=mobile" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false));
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't verify this job link");
  });

  it("restores the included balance when a legacy reset marker exists without a stored token balance", async () => {
    localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://careers.example.com/jobs/product-designer" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false));
  });

  it("allows URL progression even when the current local credit balance is explicitly zero", async () => {
    localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
    localStorage.setItem("bridge-tokens", "0");
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://careers.example.com/jobs/product-designer" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false));
  });

  it("confirms the reviewed employer for the reported Wellfound listing before the user continues", () => {
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://www.wellfound.com/jobs/3971835-account-executive/?source=mobile" } });
    expect(screen.getByRole("status").textContent).toContain("Company identified: ChatFin");
    expect(document.querySelector("[data-reviewed-employer='true']")).toBeTruthy();
  });
});



describe("Onboarding preview race safety", () => {
  afterEach(() => cleanup());
  it("does not wait for company identification before Continue", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<Onboarding />);
    fireEvent.change(screen.getByLabelText("Target Role URL"), { target: { value: "https://jobs.lever.co/unknown/1" } });
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false);
  });

  it("clears confirmation and requires the current canonical preview", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, init:any) => { const value=JSON.parse(init.body).url; return {ok:true,json:async()=>({canonicalUrl:value,status:"fresh",employerConfidence:value.includes("lever")?"ambiguous":"direct-domain",companyDomain:value.includes("lever")?undefined:"beta.com",reason:"ok",recoveryAction:"continue"})}; }));
    render(<Onboarding/>); const input=screen.getByLabelText("Target Role URL"); const button=screen.getByRole("button",{name:"Continue"});
    fireEvent.change(input,{target:{value:"https://jobs.lever.co/meta/1"}}); await waitFor(()=>expect(screen.getByLabelText("Company domain")).toBeTruthy(),{timeout:1200});
    fireEvent.change(screen.getByLabelText("Company domain"),{target:{value:"meta.com"}}); fireEvent.change(input,{target:{value:"https://careers.beta.com/jobs/2"}});
    expect(screen.queryByLabelText("Company domain")).toBeNull(); expect(button).toHaveProperty("disabled",false);
    await waitFor(()=>expect(button).toHaveProperty("disabled",false),{timeout:1200});
  });
});
