// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LoadingScreen, needsReload } from "./SystemStates";

const { captureClientError } = vi.hoisted(() => ({ captureClientError: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureClientError }));

afterEach(() => { cleanup(); captureClientError.mockReset(); vi.restoreAllMocks(); });

describe("kit Loading skeleton", () => {
  it("is one labelled status with the kit bars and four motion-safe blocks", () => {
    render(<LoadingScreen />);
    const status = screen.getByRole("status", { name: "Loading" });
    expect(status.closest("main")?.className).toBe("page-content");
    expect(status.className).toBe("space-y-4");
    const bars = Array.from(status.children);
    expect(bars).toHaveLength(6);
    expect(bars[0].className).toContain("h-8 w-40");
    expect(bars[1].className).toContain("h-4 w-56");
    for (const block of bars.slice(2)) expect(block.className).toContain("h-20 rounded-2xl bg-muted");
    // Pulsing is a motion effect: never unconditional.
    for (const bar of bars) {
      expect(bar.className).toContain("motion-safe:animate-pulse");
      expect(bar.className.split(" ")).not.toContain("animate-pulse");
    }
  });
});

describe("kit error screen behind the app-wide boundary", () => {
  let shouldThrow = true;
  function Flaky() {
    if (shouldThrow) throw new Error("secret internal detail");
    return <p>Recovered content</p>;
  }

  it("reports to Sentry, hides the raw message, and Try again resets the boundary", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    shouldThrow = true;
    render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    expect(screen.getByRole("heading", { name: "Something went wrong on our side." })).toBeTruthy();
    expect(screen.getByText("Nothing you did. Your asks and messages are safe.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "skipwait.me" }).className).toContain("wordmark-logo");
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
    expect(captureClientError).toHaveBeenCalledWith(expect.objectContaining({ message: "secret internal detail" }), expect.objectContaining({ boundary: "ErrorBoundary" }));
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/");
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry.className).toContain("rounded-full");
    shouldThrow = false;
    act(() => { fireEvent.click(retry); });
    expect(screen.getByText("Recovered content")).toBeTruthy();
  });

  it("only reloads for a lazy module that failed to download, since a reset cannot recover it", () => {
    expect(needsReload(new TypeError("Failed to fetch dynamically imported module: /src/pages/Plans.tsx"))).toBe(true);
    expect(needsReload(new TypeError("Importing a module script failed."))).toBe(true);
    expect(needsReload(Object.assign(new Error("x"), { name: "ChunkLoadError" }))).toBe(true);
    expect(needsReload(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(needsReload("not an error")).toBe(false);
  });
});
