// @vitest-environment jsdom
// D-048-p3-discovery switch: /wall and /jobs render the goal page only when
// goalSurfaceOn("discovery") is true; with the flag off the kit page stays
// (its own tests, opportunityWall.test.tsx and jobExplorer.test.tsx, pin it).
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OpportunityWall from "../../OpportunityWall";
import JobExplorer from "../../JobExplorer";

const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/", vi.fn()] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const stub = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ opportunities: [], jobs: [], companies: [], modules: [] }) })));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; });

describe("discovery switch", () => {
  it.each([["/wall", OpportunityWall, "See openings shared by verified employees."], ["/jobs", JobExplorer, "Browse roles worth a referral."]] as const)("%s renders the goal page when the flag is on", async (_route, Page, goalLine) => {
    stub(); flag.on = true;
    const { container } = render(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goalLine })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    expect(flag.asked).toContain("discovery");
  });

  it.each([["/wall", OpportunityWall], ["/jobs", JobExplorer]] as const)("%s keeps the kit page when the flag is off", async (_route, Page) => {
    stub();
    const { container } = render(<Page />);
    await waitFor(() => expect(container.querySelector("[data-skipwait-screen]")).toBeTruthy());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(flag.asked).toContain("discovery");
  });
});
