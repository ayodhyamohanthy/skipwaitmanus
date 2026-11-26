// @vitest-environment jsdom
// FIX-admin-catalog-signin (owner report, Nov 26 2026: "/admin/catalog-sync page is not asking for sign in"):
// a browser signed in to a non-administrator account got 401/403 from the dry run and saw only the error and a
// reload button. The page now offers "Sign in as administrator", returning here, like /admin/money-check.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminCatalogSync, { GOAL_PAGE } from "./GoalAdminCatalogSync";

const { auth } = vi.hoisted(() => ({ auth: { signedIn: true } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: auth.signedIn, getToken: async () => "test-token", openSignIn: () => {} }),
}));

const reply = (payload: unknown, status: number) => ({ ok: status < 400, status, url: "", json: async () => payload });
const ADMIN_LINK = "/sign-in?returnTo=%2Fadmin%2Fcatalog-sync";

beforeEach(() => { auth.signedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("FIX-admin-catalog-signin", () => {
  it.each([401, 403])("a non-administrator session (%i) is offered Sign in as administrator, not a reload loop", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "Administrator access is required" }, status)));
    const { container } = render(<GoalAdminCatalogSync />);
    const link = await screen.findByRole("link", { name: "Sign in as administrator" });
    expect(link.getAttribute("href")).toBe(ADMIN_LINK);
    expect(screen.getByText(/not as an administrator/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reload the dry run/ })).toBeNull();
    assertGoalPage(container, GOAL_PAGE);
  });

  it("signed out, it links to the administrator sign-in that returns to this page", () => {
    auth.signedIn = false;
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(<GoalAdminCatalogSync />);
    expect(screen.getByRole("link", { name: "Sign in as administrator" }).getAttribute("href")).toBe(ADMIN_LINK);
    assertGoalPage(container, GOAL_PAGE);
  });

  it("any other failure keeps the error and the reload button", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "Catalog unavailable" }, 503)));
    render(<GoalAdminCatalogSync />);
    expect(await screen.findByText("Catalog unavailable")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in as administrator" })).toBeNull();
  });
});
