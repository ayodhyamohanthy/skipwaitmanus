// @vitest-environment jsdom
// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PostOpportunity from "./PostOpportunity";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true }, go: vi.fn() }));
const getToken = vi.fn().mockResolvedValue("clerk-token");
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/post-opportunity", go],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); getToken.mockClear(); go.mockClear(); authState.isSignedIn = true; });

describe("verified employee opportunity post", () => {
  it("publishes a Hiring now opportunity only with the Clerk token and confirms that the employee identity remains off-card", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => ({ ok: true, json: async () => ({ opportunity: { companyDomain: "acme.com", roleTitle: "Product Designer" } }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PostOpportunity />);
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Public job link/i), { target: { value: "https://careers.acme.com/jobs/design" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish privately" }));
    await waitFor(() => expect(screen.getByText("Your opportunity is live.")).toBeTruthy());
    expect(getToken).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/opportunities");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("Product Designer");
    expect(screen.queryByText("employee@acme.com")).toBeNull();
  });

  it("requires a start time when the employee selects a Walk-in", () => {
    render(<PostOpportunity />);
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Walk-in hiring" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Starts at")).toBeTruthy();
    const continueButton = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
  });

  it("routes signed-out employees to the company-email-only sign-in flow before publishing", () => {
    authState.isSignedIn = false;
    render(<PostOpportunity />);
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Use company email to publish" }));
    expect(go).toHaveBeenCalledWith("/referrer");
  });
});
