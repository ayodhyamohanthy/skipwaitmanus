// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Safety from "./Safety";
import Help from "./Help";
import Landed from "./Landed";
import SignIn from "./SignIn";
import "./goal/seeker-small/GoalLanded";

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
  it("renders the released safety page without preview disclaimers", async () => {
    const { container } = render(<Safety />);
    expect(await screen.findByRole("heading", { name: "Stay safe on SkipWait." })).toBeTruthy();
    expect(screen.getByText("Resumes stay private until a referrer accepts a request.")).toBeTruthy();
    expect(screen.getByText(/ownership of an email address on an approved company domain/)).toBeTruthy();
    // The pay answer points at the live Report flow instead of a preview-only promise.
    fireEvent.click(screen.getByRole("button", { name: "What if someone asks me to pay?" }));
    expect(screen.getByRole("link", { name: "Report" }).getAttribute("href")).toBe("/report");
    expect(container.textContent).not.toMatch(/DESIGN PREVIEW|before the platform launches|This design preview/i);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    expect(screen.queryByText(/before the platform launches/i)).toBeNull();
    expect(screen.queryByText(/This design preview/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Explore companies" }).getAttribute("href")).toBe("/explore");
  });

  it("searches the released help page honestly and links only live policy pages", async () => {
    render(<Help />);
    expect(await screen.findByRole("heading", { name: "Get help." })).toBeTruthy();
    expect(screen.queryByText(/Momentum and Land allow more/)).toBeNull();
    expect(screen.queryByText(/preparation tools and more open asks/)).toBeNull();
    // Live plan model: asks are free and capped per plan (shared/planCatalog.ts), plan credits roll over.
    fireEvent.click(screen.getByRole("button", { name: "How many referral requests can I have open?" }));
    // D-219: the Free limit is the whole answer; no unsold paid plan is named.
    expect(screen.getByText(/^Free: 3 at a time\./)).toBeTruthy();
    expect(screen.queryByText(/paid plans/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Do credits expire?" }));
    expect(screen.getByText("Purchased credits never expire. Plan credits roll over based on your plan.")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), { target: { value: "expire" } });
    expect(screen.queryByText(/No answers for/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Why did my referral request expire?" }));
    // Mirrors shared/referral.ts ASK_TTL_DAYS = 7: unanswered asks close after seven days and the slot returns.
    expect(screen.getByText(/If no referrer accepts within 7 days/).textContent).toContain("your slot returns");
    expect(screen.queryByText(/usually within 2 days/)).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), { target: { value: "zzz-no-such-topic" } });
    expect(screen.getByText(/No answers for/)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Safety", pressed: false }));
    const answers = within(screen.getByRole("list", { name: "Answers" }));
    expect(answers.getAllByRole("button").map(button => button.textContent)).toEqual(["Someone asked me for money.", "How do I block someone?"]);
    const policies = screen.getByRole("navigation", { name: "Rules & policies" });
    expect(within(policies).getByRole("link", { name: "Terms of service" }).getAttribute("href")).toBe("/terms");
    expect(within(policies).getByRole("link", { name: "Safety" }).getAttribute("href")).toBe("/safety");
    expect(within(policies).getByRole("link", { name: "Community guidelines" }).getAttribute("href")).toBe("/guidelines");
    expect(within(policies).getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/support");
  });

  it("holds the landed journey until a signed-in seeker names the real hire", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Landed /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Secure sign in" });
    expect(screen.queryByText(/Illustrative outcome|EXAMPLE/i)).toBeNull();
    expect(screen.queryByText(/Product Designer at Wipro/)).toBeNull();
    expect(screen.queryByText(/Rahul/)).toBeNull();
    // No hire, no celebration: the journey and its thank-you only appear on real data.
    expect(screen.queryByText("You did it.")).toBeNull();
    expect(screen.queryByRole("button", { name: /Thank your referrer/ })).toBeNull();
  });

  it("offers intent choice on the goal design, never a password form for referrers", () => {
    render(<SignIn />);
    expect(screen.getByRole("heading", { name: "Sign in to find or give a referral." })).toBeTruthy();
    expect(screen.getByLabelText(/Password/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
    expect(screen.getByText("Sign in with your company email. A one-time code proves where you work.")).toBeTruthy();
  });
});

// DECISION-COPY-oct26: the guides state the spend rule the ledger keeps.
// The referrer no-credit pin remains on the live route in referrerHomeGoal.test.tsx.
describe("Decision copy pins (DECISION-COPY-oct26)", () => {
  it("the guides spend rule matches the ledger (D-034)", async () => {
    const guides = await import("@/content/guides");
    const blob = JSON.stringify(Object.values(guides));
    expect(blob).not.toMatch(/credit leaves your balance when you send/i);
    expect(blob).toMatch(/A referral request is used only when a verified employee can see it/);
  });
});
