// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineNotice, PwaUpdatePrompt, SW_UPDATE_EVENT, SlowConnectionNotice, isSlowConnection } from "./PwaStatus";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

const KIT_BANNER = "bg-muted px-6 py-2 text-sm";

describe("PWA status", () => {
  it("only calls 2G-class links slow", () => {
    expect(isSlowConnection({ effectiveType: "2g" })).toBe(true);
    expect(isSlowConnection({ effectiveType: "4g" })).toBe(false);
    expect(isSlowConnection(undefined)).toBe(false);
  });
  it("shows nothing on a normal connection", () => {
    render(<SlowConnectionNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("shows the kit slow-connection banner, left-aligned, with its honest copy", () => {
    vi.stubGlobal("navigator", { onLine: true, connection: { effectiveType: "2g" } });
    render(<SlowConnectionNotice />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe("Slow connection. Pages may take a moment to load.");
    expect(banner.className).toContain(KIT_BANNER);
    expect(banner.className).not.toContain("justify-center");
    expect(banner.querySelector("svg")?.getAttribute("class")).toContain("size-4");
  });
  it("shows the kit offline banner only while offline, and not on the offline screen", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineNotice />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => { window.dispatchEvent(new Event("offline")); });
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe("You're offline. Showing saved info.");
    expect(banner.className).toContain(KIT_BANNER);
    expect(banner.className).not.toContain("text-center");
    expect(banner.querySelector("svg")?.getAttribute("class")).toContain("size-4");
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    window.history.replaceState(null, "", "/offline");
    render(<OfflineNotice />);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("prompts for a waiting worker and tells it to take over only on Refresh", () => {
    const postMessage = vi.fn();
    render(<PwaUpdatePrompt />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: { postMessage } })); });
    expect(screen.getByText("A new version of SkipWait is ready.")).toBeTruthy();
    expect(postMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
  it("Later hides the prompt without touching the worker", () => {
    const postMessage = vi.fn();
    render(<PwaUpdatePrompt />);
    act(() => { window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: { postMessage } })); });
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
