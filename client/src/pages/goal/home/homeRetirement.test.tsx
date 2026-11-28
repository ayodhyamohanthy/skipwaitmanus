// @vitest-environment jsdom
// D-048-K-home (D-332): the Kit landing is deleted, not switched off.
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: false }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("../../GoalLandingV9", () => ({ default: () => <p>Goal landing</p> }));
vi.mock("./HomeSignedIn", () => ({ default: () => <p>Goal account router</p> }));
import Home from "../../Home";

beforeEach(() => Object.assign(auth, { isLoaded: true, isSignedIn: false }));
afterEach(cleanup);

describe("Home retirement", () => {
  it("has no retired Kit body or design switch", () => {
    const source = readFileSync(path.resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).not.toMatch(/components\/kit|goalSurfaceOn|launch-page|QUESTIONS/);
  });

  it("renders the goal landing without a surface flag for a signed-out visitor", () => {
    render(<Home />);
    expect(screen.getByText("Goal landing")).toBeTruthy();
    expect(screen.queryByText("Goal account router")).toBeNull();
  });

  it("renders the goal account router without a surface flag for a signed-in visitor", () => {
    auth.isSignedIn = true;
    render(<Home />);
    expect(screen.getByText("Goal account router")).toBeTruthy();
    expect(screen.queryByText("Goal landing")).toBeNull();
  });

  it("never flashes the public landing while authentication loads", () => {
    auth.isLoaded = false;
    render(<Home />);
    expect(screen.getByText("Goal account router")).toBeTruthy();
    expect(screen.queryByText("Goal landing")).toBeNull();
  });

  it("returns to the goal landing when loading resolves signed out", () => {
    auth.isLoaded = false;
    const view = render(<Home />);
    auth.isLoaded = true;
    view.rerender(<Home />);
    expect(screen.getByText("Goal landing")).toBeTruthy();
    expect(screen.queryByText("Goal account router")).toBeNull();
  });
});
