// @vitest-environment jsdom
// D-048-F-app-wrapper layout contract for the goal network notice (offline,
// slow connection). Defect on 29ed507d: the notice rendered as an in-flow
// line before the shell, so the page moved down 37-57px when it appeared.
// The notice must overlay the page (out of flow), never take layout space,
// never catch clicks, and stay a polite status with the same words.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineNotice, SlowConnectionNotice } from "@/components/PwaStatus";
import { GoalNotice } from "./GoalNotice";

const classes = (el: Element) => new Set((el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean));
/** Every class on the status region and its descendants. */
const allClasses = (root: Element) => [root, ...Array.from(root.querySelectorAll("*"))].flatMap(el => Array.from(classes(el)));

beforeEach(() => { vi.stubEnv("VITE_GOAL_SURFACES", "home"); window.history.replaceState(null, "", "/"); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

describe("goal notice layout contract (no layout shift)", () => {
  it("is taken out of flow: the status region is position:fixed, not an in-flow block", () => {
    render(<GoalNotice icon={null}>You&apos;re offline.</GoalNotice>);
    const region = screen.getByRole("status");
    expect(classes(region).has("fixed")).toBe(true);
    // No class anywhere in the notice may give the in-flow box a height or a
    // bottom border that would push the page (the 29ed507d shape).
    expect(classes(region).has("border-b")).toBe(false);
    expect(classes(region).has("min-h-9")).toBe(false);
  });

  it("does not catch pointer input meant for the page beneath it", () => {
    render(<GoalNotice icon={null}>x</GoalNotice>);
    expect(classes(screen.getByRole("status")).has("pointer-events-none")).toBe(true);
  });

  it("sits above the phone bottom bar, in the desktop bottom-right corner, below sheets and the cookie banner", () => {
    render(<GoalNotice icon={null}>x</GoalNotice>);
    const region = classes(screen.getByRole("status"));
    expect(region.has("bottom-[calc(var(--g-bottombar-h)+12px+env(safe-area-inset-bottom,0px))]")).toBe(true);
    expect(region.has("gdesk:bottom-[max(24px,env(safe-area-inset-bottom,0px))]")).toBe(true);
    expect(region.has("z-30")).toBe(true);
    // Desktop: bottom-right corner, clear of centred footers and primary actions.
    expect(region.has("gdesk:justify-end")).toBe(true);
  });

  it("uses goal tokens only for the floating surface", () => {
    render(<GoalNotice icon={null}>x</GoalNotice>);
    const all = allClasses(screen.getByRole("status"));
    expect(all).toEqual(expect.arrayContaining(["bg-g-surface", "shadow-g-popover", "rounded-g-popover", "text-g-ink-2", "text-g-meta"]));
    expect(all.filter(c => /^(bg|text|border|shadow)-(?!g-)/.test(c) && !/^text-(left|center|right)$/.test(c))).toEqual([]);
  });

  it("offline notice keeps role, aria-live and the goal marker while overlaying", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineNotice />);
    act(() => { window.dispatchEvent(new Event("offline")); });
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("data-goal-wrapper")).toBe("notice");
    expect(classes(region).has("fixed")).toBe(true);
  });

  it("slow-connection notice overlays the same way", () => {
    vi.stubGlobal("navigator", { onLine: true, connection: { effectiveType: "2g" } });
    render(<SlowConnectionNotice />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(classes(region).has("fixed")).toBe(true);
  });
});
