// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Safety from "./Safety";
import Help from "./Help";
import Landed from "./Landed";
import SignIn from "./SignIn";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/"],
  useSearch: () => "",
}));
// Only Landed reads the session here (Safety, Help and SignIn do not). Signed out is
// the state this file cares about: the journey must not name anyone before it knows.
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: undefined, getToken: async () => null }),
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../const", () => ({ startLogin: vi.fn() }));
import { startLogin } from "../const";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Trust cluster", () => {
  it("renders live safety answers with no preview disclaimers", () => {
    render(<Safety />);
    expect(screen.getByText(/Help & safety/)).toBeTruthy();
    expect(screen.getByText("Resumes stay private until a referrer accepts a request.")).toBeTruthy();
    expect(screen.getByText(/ownership of an email address on an approved company domain/)).toBeTruthy();
    // The pay answer points at the live Report flow instead of a preview-only promise.
    expect(screen.getByRole("link", { name: "Report" }).getAttribute("href")).toBe("/report");
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    expect(screen.queryByText(/before the platform launches/i)).toBeNull();
    expect(screen.queryByText(/This design preview/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Explore/ }).getAttribute("href")).toBe("/explore");
  });

  it("searches help honestly and links only live policy pages", () => {
    render(<Help />);
    expect(screen.getByText("How can we help")).toBeTruthy();
    expect(screen.queryByText(/Momentum and Land allow more/)).toBeNull();
    expect(screen.queryByText(/preparation tools and more open asks/)).toBeNull();
    // Live plan model: asks are free and capped per plan (shared/planCatalog.ts), plan credits roll over.
    fireEvent.click(screen.getByRole("button", { name: "How many asks can I have open?" }));
    expect(screen.getByText(/^Free: 3 at a time; paid plans allow more\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Do credits expire?" }));
    expect(screen.getByText("Purchased credits never expire. Plan credits roll over based on your plan.")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Search: credits/), { target: { value: "expire" } });
    expect(screen.queryByText(/No answers for/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Why did my ask expire?" }));
    // Mirrors shared/referral.ts ASK_TTL_DAYS = 7: unanswered asks close after seven days and the slot returns.
    expect(screen.getByText(/If no referrer accepts within 7 days/).textContent).toContain("your slot returns");
    expect(screen.queryByText(/usually within 2 days/)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Search: credits/), { target: { value: "zzz-no-such-topic" } });
    expect(screen.getByText(/No answers for/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Search: credits/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("tab", { name: /Safety/ }));
    expect(screen.getAllByRole("button", { expanded: false }).map(button => button.textContent)).toEqual(["Someone asked me for money.", "How do I block someone?"]);
    const policies = screen.getByText("Rules & policies").closest("section") as HTMLElement;
    expect(policies.innerHTML).toContain("/terms");
    expect(policies.innerHTML).toContain("/safety");
    expect(policies.innerHTML).toContain("/guidelines");
    expect(policies.innerHTML).toContain("/privacy");
    expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/support");
  });

  it("holds the landed journey until a signed-in seeker names the real hire", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Landed /></QueryClientProvider>);
    expect(screen.getByText("Someone helped you land it.")).toBeTruthy();
    expect(screen.queryByText(/Illustrative outcome|EXAMPLE/i)).toBeNull();
    expect(screen.queryByText(/Product Designer at Wipro/)).toBeNull();
    expect(screen.queryByText(/Rahul/)).toBeNull();
    // No hire, no celebration: the journey and its thank-you only appear on real data.
    expect(screen.queryByText("You did it.")).toBeNull();
    expect(screen.queryByRole("button", { name: /Thank your referrer/ })).toBeNull();
  });

  it("offers intent choice on the split design, never a password form", () => {
    render(<SignIn />);
    expect(screen.getByText(/Welcome to skipwait.me/)).toBeTruthy();
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    expect(screen.queryByText(/Forgot password/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.getByText(/Choose who you help/)).toBeTruthy();
  });
});
