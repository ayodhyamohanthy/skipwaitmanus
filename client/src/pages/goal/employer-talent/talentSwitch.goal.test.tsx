// @vitest-environment jsdom
// D-048-K-employer-talent: route exports render the released goal page without a switch.
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TalentDiscovery from "../../TalentDiscovery";
// Preload the real chunk; the test mounts the actual lazy route.
import "./GoalEmployerTalent";

vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/employer/talent", vi.fn()],
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("VITE_GOAL_SURFACES", "");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/employer/account"
    ? { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ account: null }) }
    : { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ talent: [] }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("employer-talent retirement (D-048-K-employer-talent)", () => {
  it("renders the released goal page without a surface override", async () => {
    const { container } = render(<TalentDiscovery />);
    expect(await screen.findByRole("heading", { level: 1, name: "Meet opt-in talent." })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='employer-talent']")).toBeTruthy();
  });

  it("keeps the stable route export as a lazy goal-only adapter", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/TalentDiscovery.tsx"), "utf8");
    expect(source).toContain("export default function TalentDiscovery()");
    expect(source).toContain('lazy(() => import("./goal/employer-talent/GoalEmployerTalent"))');
    expect(source).toContain("<Suspense fallback={null}>");
    expect(source).not.toMatch(/if\s*\(goalSurfaceOn/);
    expect(source).not.toContain("useState");
  });
});
