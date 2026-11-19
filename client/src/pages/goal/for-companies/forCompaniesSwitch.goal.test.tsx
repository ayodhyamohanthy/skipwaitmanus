// @vitest-environment jsdom
// D-048-p3-for-companies switch: /for-companies renders the goal page only
// when goalSurfaceOn("for-companies") is true; with the flag off the kit page
// stays (forCompanies.test.tsx pins the kit surface). One switch in the page
// file, goal implementation under pages/goal/for-companies (D-048 split method).
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForCompanies from "../../ForCompanies";
import { GOAL_PAGE } from "./GoalForCompanies";

const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/for-companies", vi.fn()] }));

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ForCompanies /></QueryClientProvider>);
const stub = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, url: "", json: async () => ({ companies: [], openCount: 0 }) })));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; });

describe("for-companies switch (D-048-p3-for-companies)", () => {
  it("renders the goal page when the goal flag is on", async () => {
    stub(); flag.on = true;
    const { container } = renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='for-companies']")).toBeTruthy();
    expect(container.querySelector("[data-skipwait-screen='for-companies']")).toBeNull();
    expect(flag.asked).toContain("for-companies");
  });

  it("keeps the kit page when the goal flag is off", async () => {
    stub();
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector("[data-skipwait-screen='for-companies']")).toBeTruthy());
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(flag.asked).toContain("for-companies");
  });
});
