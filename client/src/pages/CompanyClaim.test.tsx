// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ signed: true, dashboard: false, go: vi.fn() }));
vi.mock("@/components/SeekerSignIn", () => ({ SeekerSignIn: () => <div>Company account sign-in</div> }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: state.signed }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>, useLocation: () => ["/company/claim", state.go], useRoute: () => [state.dashboard, state.dashboard ? { slug: "quillmint" } : undefined] }));
import CompanyClaim from "./CompanyClaim";
beforeEach(() => { vi.stubEnv("VITE_COMPANY_CLAIM", "true"); state.signed = true; state.dashboard = false; state.go.mockClear(); window.history.replaceState(null, "", "/company/claim"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("company access UI", () => {
  it("company sign-in never uses the referrer enrollment funnel", () => {
    state.signed = false;
    render(<CompanyClaim />);
    expect(screen.getByText("Company account sign-in")).toBeTruthy();
    expect(document.querySelector('a[href*="intent=referrer"]')).toBeNull();
  });
  it("flag off never reads or exposes company stats", () => {
    vi.stubEnv("VITE_COMPANY_CLAIM", "false");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    state.dashboard = true;
    render(<CompanyClaim />);
    expect(screen.getByText("Page not available")).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("shows the min-three privacy boundary and sends only a work email", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ sent: true }) })); vi.stubGlobal("fetch", fetcher);
    render(<CompanyClaim />);
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "person@quillmint.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a verification link" }));
    await screen.findByRole("status");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ email: "person@quillmint.com" });
    expect(screen.getByText(/No seeker names/)).toBeTruthy();
  });
  it("shows plain words when the API answers with a non-JSON error body", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token '<'"); } })); vi.stubGlobal("fetch", fetcher);
    render(<CompanyClaim />);
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "person@quillmint.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a verification link" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("We could not complete company verification. Try again.");
    expect(alert.textContent).not.toContain("Unexpected token");
  });
  it("shows plain words when the network drops", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<CompanyClaim />);
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "person@quillmint.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a verification link" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We could not complete company verification. Try again.");
  });
  it("never consumes a link on mount; explicit confirmation only", async () => {
    window.history.replaceState(null, "", "/company/claim#token=" + "a".repeat(64));
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ slug: "quillmint" }) })); vi.stubGlobal("fetch", fetcher);
    render(<CompanyClaim />); expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm company access" }));
    await waitFor(() => expect(state.go).toHaveBeenCalledWith("/company/dashboard/quillmint"));
    expect(window.location.search).toBe("");
  });
  it("under three hides all numeric stats", async () => {
    state.dashboard = true;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ company: { name: "Quillmint", slug: "quillmint", domain: "quillmint.com" }, signal: { state: "insufficient" } }) })));
    render(<CompanyClaim />); await screen.findAllByText("Not enough data yet");
    expect(screen.queryByText("Asks answered")).toBeNull(); expect(screen.queryByText("Employees verified")).toBeNull();
  });
});
