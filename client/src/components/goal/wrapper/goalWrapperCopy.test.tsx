// @vitest-environment jsdom
// D-048-F-app-wrapper copy repair (PR #877, Instinct review comments 6529007802
// and 6531091228). The goal wrapper states may only say what they can prove:
// - the error fallback knows only that rendering failed, so it names no cause
//   and promises nothing about the person's data ("Something went wrong." /
//   "Try again, or come back in a moment.");
// - the offline notice knows only navigator's offline flag, which does not
//   prove any saved data exists ("You're offline.").
// The legacy variants (SystemStates ErrorScreen, StatusBanner) are read-only
// in this row and keep their words; behaviour, roles and aria-live stay.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary, { ErrorFallbackSwitch } from "@/components/ErrorBoundary";
import { OfflineNotice, SlowConnectionNotice } from "@/components/PwaStatus";
import { GoalErrorFallback } from "./GoalErrorFallback";

const { captureClientError } = vi.hoisted(() => ({ captureClientError: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureClientError }));

/** Claims the goal states cannot support: blame/cause, data safety, saved data, retired "asks". */
const UNSUPPORTED = /on our side|Nothing you did|\basks?\b|are safe|saved info|Showing saved/i;

beforeEach(() => { vi.stubEnv("VITE_GOAL_SURFACES", "home"); window.history.replaceState(null, "", "/"); });
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  captureClientError.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("goal error fallback copy", () => {
  it("heading is exactly 'Something went wrong.' and names no cause", () => {
    render(<GoalErrorFallback screen="app-error" onRetry={() => undefined} />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Something went wrong.");
  });

  it("body is exactly 'Try again, or come back in a moment.'", () => {
    const { container } = render(<GoalErrorFallback screen="app-error" onRetry={() => undefined} />);
    const body = container.querySelector("h1 + p");
    expect(body?.textContent).toBe("Try again, or come back in a moment.");
  });

  it("makes no blame, data-safety or retired-wording claim anywhere on the screen", () => {
    const { container } = render(<GoalErrorFallback screen="route-error" onRetry={() => undefined} />);
    expect(container.textContent ?? "").not.toMatch(UNSUPPORTED);
  });

  it("the app-wide boundary renders the new copy and keeps reporting, hiding the raw error, Try again and Go home", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldThrow = true;
    function Flaky() { if (shouldThrow) throw new Error("internal stack detail"); return <p>Back</p>; }
    const { container } = render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong." })).toBeTruthy();
    expect(screen.getByText("Try again, or come back in a moment.")).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(UNSUPPORTED);
    expect(screen.queryByText(/internal stack detail/)).toBeNull();
    expect(captureClientError).toHaveBeenCalledWith(expect.objectContaining({ message: "internal stack detail" }), expect.objectContaining({ boundary: "ErrorBoundary" }));
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/");
    shouldThrow = false;
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(screen.getByText("Back")).toBeTruthy();
  });

  it("the route boundary's switch renders the same goal copy with the route-error screen id", () => {
    const { container } = render(<ErrorFallbackSwitch screen="route-error" onRetry={() => undefined} legacy={<p>legacy</p>} />);
    expect(container.querySelector("[data-skipwait-screen='route-error'][data-goal-wrapper='error']")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong." })).toBeTruthy();
    expect(screen.getByText("Try again, or come back in a moment.")).toBeTruthy();
    expect(screen.queryByText("legacy")).toBeNull();
  });
});

describe("goal offline notice copy", () => {
  it("says exactly \"You're offline.\" and claims no saved data, still a polite status", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineNotice />);
    act(() => { window.dispatchEvent(new Event("offline")); });
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("You're offline.");
    expect(region.textContent ?? "").not.toMatch(UNSUPPORTED);
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("data-goal-wrapper")).toBe("notice");
  });
});

describe("preserved: words this repair does not touch", () => {
  it("the goal slow-connection notice keeps its sentence", () => {
    vi.stubGlobal("navigator", { onLine: true, connection: { effectiveType: "2g" } });
    render(<SlowConnectionNotice />);
    expect(screen.getByRole("status").textContent).toBe("Slow connection. Pages may take a moment to load.");
  });

  it("with the surface off, the legacy offline banner (read-only here) keeps its words", () => {
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineNotice />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("data-goal-wrapper")).toBeNull();
    expect(region.textContent).toBe("You're offline. Showing saved info.");
  });

  it("with the surface off, the legacy error screen (read-only here) keeps its words", () => {
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Boom(): never { throw new Error("x"); }
    const { container } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(container.querySelector("[data-goal-wrapper='error']")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong on our side." })).toBeTruthy();
  });

  it("on a route whose goal surface is off (/queue), the switch keeps the legacy screen", () => {
    window.history.replaceState(null, "", "/queue");
    const { container } = render(<ErrorFallbackSwitch screen="route-error" onRetry={() => undefined} legacy={<p>legacy</p>} />);
    expect(container.querySelector("[data-goal-wrapper='error']")).toBeNull();
    expect(screen.getByText("legacy")).toBeTruthy();
  });
});
