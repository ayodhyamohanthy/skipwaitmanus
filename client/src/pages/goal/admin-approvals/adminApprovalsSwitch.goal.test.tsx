// @vitest-environment jsdom
// D-048-p3-admin-approvals switches (D-048-admin.md §3): /admin/approvals and
// /admin/approvals/:kind/:id render the goal page only when
// goalSurfaceOn("admin-approvals") is true; with the flag off both kit pages
// stay untouched (adminApprovalQueue.test.tsx and adminApprovalRecord.test.tsx
// pin the kit behaviour). One switch per page file, the goal implementation
// under pages/goal/admin-approvals (D-048 split method).
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminApprovalQueue from "../../AdminApprovalQueue";
import AdminApprovalRecord from "../../AdminApprovalRecord";

const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/admin/approvals", vi.fn()],
  useRoute: () => [true, { kind: "referral_request", id: "501" }],
  useSearch: () => "",
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; });

describe("admin-approvals switches (D-048-p3-admin-approvals)", () => {
  it.each([
    ["/admin/approvals", AdminApprovalQueue] as const,
    ["/admin/approvals/:kind/:id", AdminApprovalRecord] as const,
  ])("%s renders the goal page when the goal flag is on", async (_route, Page) => {
    flag.on = true;
    const { container } = render(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: "Decide this approval." })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    expect(flag.asked).toContain("admin-approvals");
  });

  it.each([
    ["/admin/approvals", AdminApprovalQueue, "Administrator approval queue"] as const,
    ["/admin/approvals/:kind/:id", AdminApprovalRecord, "Administrator record"] as const,
  ])("%s keeps the kit page when the goal flag is off", async (_route, Page, kitHeading) => {
    const { container } = render(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: kitHeading })).toBeTruthy();
    await waitFor(() => expect(container.querySelector("[data-goal-page]")).toBeNull());
    expect(flag.asked).toContain("admin-approvals");
  });
});
