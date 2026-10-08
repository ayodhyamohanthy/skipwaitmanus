// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaUpdatePrompt, SW_UPDATE_EVENT, SlowConnectionNotice, isSlowConnection } from "./PwaStatus";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
