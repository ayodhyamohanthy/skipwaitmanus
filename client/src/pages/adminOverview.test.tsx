// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOverview from "./AdminOverview";

const { authState, getToken } = vi.hoisted(() => ({ authState: { isSignedIn: true }, getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, getToken }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/admin"] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));

beforeEach(() => { authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

describe("AdminOverview", () => {
  it("gates the console behind admin sign-in", async () => {
    authState.isSignedIn = false;
    render(<AdminOverview />);
    expect(screen.getByText("Operations console")).toBeTruthy();
    expect(screen.queryByText("Operate for trust, not vanity.")).toBeNull();
  });

  it("renders live funnel aggregates and tool links, never fabricated people", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({
      funnel: { requestsCreated: 12, requestsClaimed: 5, decisionsRecorded: 4, waitingForCoverage: 3 },
      coverageGaps: [{ companyDomain: "acme.com", waitingRequests: 3, verifiedCoverage: 0 }],
    })));
    render(<AdminOverview />);
    expect(await screen.findByText("Operate for trust, not vanity.")).toBeTruthy();
    expect(screen.getByText("Requests created")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("acme.com")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Approval queue/ }).getAttribute("href")).toBe("/admin/approvals");
    expect(screen.getByRole("link", { name: /Safety review/ }).getAttribute("href")).toBe("/admin-review");
    expect(screen.queryByText(/Avery|Rahul/)).toBeNull();
  });
});
