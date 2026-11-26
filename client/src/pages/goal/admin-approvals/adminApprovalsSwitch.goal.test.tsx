// @vitest-environment jsdom
// D-048-K-admin-approvals: stable lazy route exports render the released goal
// pages without a legacy body or a surface switch.
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminApprovalQueue from "../../AdminApprovalQueue";
import AdminApprovalRecord from "../../AdminApprovalRecord";
// Preload real chunks; the cases mount the real lazy entrypoints.
import "./GoalAdminApprovalQueue";
import "./GoalAdminApprovalRecord";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null, openSignIn: vi.fn() }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/admin/approvals", vi.fn()],
  useRoute: () => [true, { kind: "referral_request", id: "501" }],
  useSearch: () => "",
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

beforeEach(() => { vi.stubEnv("VITE_GOAL_SURFACES", ""); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("admin-approvals retirement (D-048-K-admin-approvals)", () => {
  it.each([
    ["/admin/approvals", AdminApprovalQueue] as const,
    ["/admin/approvals/:kind/:id", AdminApprovalRecord] as const,
  ])("%s renders the goal page without a surface override", async (_route, Page) => {
    const { container } = render(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: "Decide this approval." })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["AdminApprovalQueue.tsx", "GoalAdminApprovalQueue"] as const,
    ["AdminApprovalRecord.tsx", "GoalAdminApprovalRecord"] as const,
  ])("%s contains only the lazy goal route adapter", (file, goal) => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages", file), "utf8");
    expect(source).toContain(`export default function ${file.replace(".tsx", "")}()`);
    expect(source).toContain(`lazy(() => import("./goal/admin-approvals/${goal}"))`);
    expect(source).toContain("<Suspense fallback={null}>");
    expect(source).not.toContain("goalSurfaceOn");
    expect(source).not.toContain("@/_core/auth");
    // The reverse boundary scans test text too; this is an assertion, not an import.
    expect(source).not.toContain(["@", "components", "kit"].join("/"));
    expect(source).not.toContain("useState");
  });
});
