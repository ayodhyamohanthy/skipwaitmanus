// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Offline from "./Offline";

beforeAll(async () => { await import("./goal/system/GoalOffline"); });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Offline recovery", () => {
  it("shows the offline status, draft reassurance, and an enabled retry action", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Offline />);

    expect((await screen.findByRole("status")).textContent).toBe("You're offline. Showing saved info.");
    expect(await screen.findByRole("heading", { name: "You're offline." })).toBeTruthy();
    expect(screen.getByText("Your drafts are saved on this device. Send them when you're back online.")).toBeTruthy();
    expect((await screen.findByRole("button", { name: "Try again" })).getAttribute("disabled")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
