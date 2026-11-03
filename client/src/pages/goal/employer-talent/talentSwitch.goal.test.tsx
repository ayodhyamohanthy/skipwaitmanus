// @vitest-environment jsdom
// D-048-p3-employer-talent switch: /employer/talent renders the goal page only
// when goalSurfaceOn("employer-talent") is true; with the flag off the kit
// page stays. One switch line in TalentDiscovery.tsx (owns: switch only).
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TalentDiscovery from "../../TalentDiscovery";

const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/employer/talent", vi.fn()] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const stub = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ talent: [], account: null }) })));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; });

describe("employer talent switch (D-048-p3-employer-talent)", () => {
  it("renders the goal page when the goal flag is on (lazy chunk; first transform is slow)", async () => {
    stub(); flag.on = true;
    const { container } = render(<TalentDiscovery />);
    expect(await screen.findByRole("heading", { level: 1, name: "Meet opt-in talent." }, { timeout: 15000 })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='employer-talent']")).toBeTruthy();
    expect(flag.asked).toContain("employer-talent");
  }, 20000);

  it("keeps the kit page when the goal flag is off", async () => {
    stub();
    const { container } = render(<TalentDiscovery />);
    await waitFor(() => expect(container.querySelector("[data-skipwait-screen='talent-discovery']")).toBeTruthy());
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(flag.asked).toContain("employer-talent");
  });
});
