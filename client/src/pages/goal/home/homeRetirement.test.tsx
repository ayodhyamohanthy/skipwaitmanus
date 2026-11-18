// @vitest-environment jsdom
import React from "react";
import { useAuth } from "@/_core/auth";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../../Home";
import GoalLandingV9 from "../../GoalLandingV9";
import HomeSignedIn from "./HomeSignedIn";

vi.mock("@/_core/auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: vi.fn() }));
vi.mock("../../GoalLandingV9", () => ({ default: vi.fn(() => <div>goal landing marker</div>) }));
vi.mock("./HomeSignedIn", () => ({ default: vi.fn(() => <div>signed-in home marker</div>) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
  vi.mocked(goalSurfaceOn).mockClear();
  vi.mocked(GoalLandingV9).mockClear();
  vi.mocked(HomeSignedIn).mockClear();
});
afterEach(cleanup);

describe("D-048-K-home retirement", () => {
  it("no longer consults goal-surface switches", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false } as ReturnType<typeof useAuth>);
    render(<Home />);
    expect(goalSurfaceOn).not.toHaveBeenCalled();
  });

  it("renders the released goal landing with no preview flag", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false } as ReturnType<typeof useAuth>);
    const { container } = render(<Home />);
    expect(screen.getByText("goal landing marker")).toBeTruthy();
    expect(vi.mocked(GoalLandingV9)).toHaveBeenCalled();
    expect(screen.queryByText("signed-in home marker")).toBeNull();
    expect(container.querySelector('[class*="launch-"]')).toBeNull();
    expect(container.querySelector(".brand-dot")).toBeNull();
  });

  it("routes signed-in and auth-loading visits to the goal router", () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true } as ReturnType<typeof useAuth>);
    const signedIn = render(<Home />);
    expect(screen.getByText("signed-in home marker")).toBeTruthy();
    expect(vi.mocked(HomeSignedIn)).toHaveBeenCalledOnce();
    signedIn.unmount();

    vi.mocked(useAuth).mockReturnValue({ isLoaded: false, isSignedIn: false } as ReturnType<typeof useAuth>);
    render(<Home />);
    expect(screen.getAllByText("signed-in home marker")).toHaveLength(1);
    expect(goalSurfaceOn).not.toHaveBeenCalled();
  });
});
