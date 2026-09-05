// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import EmployerDashboard from "./EmployerDashboard";

const { isSignedIn } = vi.hoisted(() => ({ isSignedIn: { value: true } }));
const go = vi.fn();

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: isSignedIn.value }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/employer", go] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

const account = { id: 1, companyName: "Acme Robotics", billingEmail: "hiring@acme.com", credits: 25, budgetMonthlyUsdCents: 50000 };

function stubFetch(overrides: { account?: typeof account | null; accountError?: boolean } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/employer/account") {
      if (overrides.accountError) return { ok: false, status: 500, json: async () => ({ error: "boom" }) };
      return { ok: true, json: async () => ({ account: "account" in overrides ? overrides.account : account }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
}

beforeEach(() => { isSignedIn.value = true; stubFetch(); });
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("EmployerDashboard", () => {
  it("shows the sign-in gate for signed-out visitors", () => {
    isSignedIn.value = false;
    render(<EmployerDashboard />);
    expect(screen.getByText("Hire without the noise.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeTruthy();
  });

  it("renders the account stats and the three tool cards for an employer", async () => {
    render(<EmployerDashboard />);
    await waitFor(() => expect(screen.getByText("Acme Robotics")).toBeTruthy());
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByText("Unlock credits")).toBeTruthy();
    expect(screen.getByText("Talent discovery")).toBeTruthy();
    expect(screen.getByText("Sponsor a role")).toBeTruthy();
    expect(screen.getByText("Buy credits")).toBeTruthy();
  });

  it("shows the become-an-employer upsell with a Get started button when no account exists", async () => {
    stubFetch({ account: null });
    render(<EmployerDashboard />);
    await waitFor(() => expect(screen.getByText("Become an employer on skipwait.me")).toBeTruthy());
    expect(screen.getByText("Talent discovery — only seekers who opted in")).toBeTruthy();
    const input = screen.getByPlaceholderText("Acme Robotics");
    expect((screen.getByRole("button", { name: "Get started" }) as HTMLButtonElement).disabled).toBe(true);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "Globex" } });
    expect((screen.getByRole("button", { name: "Get started" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders an error state when the account lookup fails", async () => {
    stubFetch({ accountError: true });
    render(<EmployerDashboard />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});

describe("EmployerDashboard loading", () => {
  it("renders the loading skeleton before fetch resolves", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const { container } = render(<EmployerDashboard />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    await waitFor(() => expect(container.querySelector(".animate-pulse")).toBeTruthy());
    const { unmount } = { unmount: () => undefined };
    unmount();
  });
});
