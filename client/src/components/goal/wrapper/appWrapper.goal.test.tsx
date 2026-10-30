// @vitest-environment jsdom
// D-048-F-app-wrapper red-first behaviour tests. The goal variant of every
// app-wide wrapper state renders only where the current route's goal surface
// is on (goalSurfaces.ts read-only); elsewhere the legacy variant renders and
// its own tests (pwaStatus.test.tsx, systemStates.test.tsx) stay as they are.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppToaster, OfflineNotice, PwaUpdatePrompt, SW_UPDATE_EVENT, SlowConnectionNotice } from "@/components/PwaStatus";
import { goalSurfaceForPath, goalWrapperOnPath } from "./routeSurface";

const { captureClientError } = vi.hoisted(() => ({ captureClientError: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureClientError }));

const SHADCN = /\b(bg-muted|bg-primary|border-border|text-foreground|text-muted-foreground)\b/;

beforeEach(() => { vi.stubEnv("VITE_GOAL_SURFACES", "home,discovery"); window.history.replaceState(null, "", "/"); });
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  captureClientError.mockReset();
  toast.dismiss();
  window.history.replaceState(null, "", "/");
});

describe("route to goal surface lookup", () => {
  it("maps a path to the surface that declares it, params included, exact paths only", () => {
    expect(goalSurfaceForPath("/")).toBe("home");
    expect(goalSurfaceForPath("/explore")).toBe("discovery");
    expect(goalSurfaceForPath("/explore/quillmint")).toBe("company");
    expect(goalSurfaceForPath("/thread")).toBe("inbox");
    expect(goalSurfaceForPath("/thread/42")).toBe("conversation");
    expect(goalSurfaceForPath("/not-a-route")).toBeNull();
  });
  it("is on only where that surface is on", () => {
    expect(goalWrapperOnPath("/")).toBe(true);
    expect(goalWrapperOnPath("/wall")).toBe(true);
    expect(goalWrapperOnPath("/queue")).toBe(false);
    expect(goalWrapperOnPath("/not-a-route")).toBe(false);
  });
});

describe("goal network notices (surface on)", () => {
  it("offline shows and hides on the events, as a polite status in goal tokens, and stays hidden on /offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineNotice />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => { window.dispatchEvent(new Event("offline")); });
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.textContent).toBe("You're offline. Showing saved info.");
    expect(banner.getAttribute("data-goal-wrapper")).toBe("notice");
    expect(banner.className).not.toMatch(SHADCN);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    vi.stubEnv("VITE_GOAL_SURFACES", "all");
    window.history.replaceState(null, "", "/offline");
    render(<OfflineNotice />);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("slow shows only for a 2G-class link while online", () => {
    vi.stubGlobal("navigator", { onLine: true, connection: { effectiveType: "2g" } });
    render(<SlowConnectionNotice />);
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.textContent).toBe("Slow connection. Pages may take a moment to load.");
    expect(banner.getAttribute("data-goal-wrapper")).toBe("notice");
    expect(banner.className).not.toMatch(SHADCN);
    cleanup();
    vi.stubGlobal("navigator", { onLine: true, connection: { effectiveType: "4g" } });
    render(<SlowConnectionNotice />);
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    vi.stubGlobal("navigator", { onLine: false, connection: { effectiveType: "2g" } });
    render(<SlowConnectionNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("the update stays silent: SKIP_WAITING is posted and nothing renders", () => {
    const postMessage = vi.fn();
    const { container } = render(<PwaUpdatePrompt />);
    act(() => { window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: { postMessage } })); });
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(container.innerHTML).toBe("");
  });

  it("with the surface off the legacy banner renders", () => {
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineNotice />);
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-goal-wrapper")).toBeNull();
    expect(banner.className).toContain("bg-muted");
  });
});

describe("goal error fallback (surface on)", () => {
  let shouldThrow = true;
  function Flaky() {
    if (shouldThrow) throw new Error("secret internal detail");
    return <p>Recovered content</p>;
  }

  it("reports, hides the raw error, one h1, Try again resets and Go home links to /", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    shouldThrow = true;
    const { container } = render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    const fallback = container.querySelector("[data-goal-wrapper='error']");
    expect(fallback).not.toBeNull();
    expect(fallback?.getAttribute("data-skipwait-screen")).toBe("app-error");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong on our side." })).toBeTruthy();
    expect(screen.getByText("Nothing you did. Your asks and messages are safe.")).toBeTruthy();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
    expect(captureClientError).toHaveBeenCalledWith(expect.objectContaining({ message: "secret internal detail" }), expect.objectContaining({ boundary: "ErrorBoundary" }));
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/");
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry.hasAttribute("data-g-primary")).toBe(true);
    expect(container.innerHTML).not.toMatch(SHADCN);
    expect(container.innerHTML).not.toMatch(/wordmark/);
    shouldThrow = false;
    act(() => { fireEvent.click(retry); });
    expect(screen.getByText("Recovered content")).toBeTruthy();
  });

  it("reloads instead of resetting when a lazy module failed to download", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, pathname: "/", reload });
    function ChunkFail(): never { throw new TypeError("Failed to fetch dynamically imported module: /src/pages/Wall.tsx"); }
    render(<ErrorBoundary><ChunkFail /></ErrorBoundary>);
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("with the surface off the legacy error screen renders", () => {
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    shouldThrow = true;
    const { container } = render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    expect(container.querySelector("[data-goal-wrapper='error']")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" }).className).toContain("bg-primary");
  });
});

describe("goal toaster (surface on)", () => {
  it("one toaster is mounted, a toast() call renders in it, styled with goal tokens", async () => {
    const { container } = render(<AppToaster />);
    expect(container.querySelectorAll("section[aria-label^='Notifications']")).toHaveLength(1);
    act(() => { toast("Saved."); });
    await screen.findByText("Saved.");
    const toasters = document.querySelectorAll("[data-sonner-toaster]");
    expect(toasters).toHaveLength(1);
    const style = (toasters[0] as HTMLElement).getAttribute("style") ?? "";
    expect(style).toContain("--normal-bg: var(--g-surface)");
    expect(style).toContain("--normal-text: var(--g-ink)");
    expect(style).not.toContain("--popover");
    expect(toasters[0].getAttribute("data-y-position")).toBe("top");
    expect(toasters[0].getAttribute("data-x-position")).toBe("center");
    expect(style).toContain("--offset-top: 72px");
    expect(style).toContain("--mobile-offset-top: 72px");
  });

  it("with the surface off the legacy toaster keeps its shadcn colours", async () => {
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    render(<AppToaster />);
    act(() => { toast("Saved."); });
    await screen.findByText("Saved.");
    const style = document.querySelector("[data-sonner-toaster]")?.getAttribute("style") ?? "";
    expect(style).toContain("--normal-bg: var(--popover)");
  });
});
