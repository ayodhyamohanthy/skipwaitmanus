// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowButton } from "./FollowButton";

const { getToken, authState } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token"), authState: { isSignedIn: true } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.isSignedIn = true; });

describe("FollowButton", () => {
  it("shows follower count and joined date, then toggles to Following", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, status: 201, json: async () => ({ following: true, followers: 8, isMutual: false }) };
      return { ok: true, json: async () => ({ followers: 7, followingCount: 3, isFollowingViewer: false, isMutual: false, joinedMonthYear: "September 2026", viewerSignedIn: true }) };
    }));
    render(<FollowButton targetUserId={22} />);
    const row = await screen.findByRole("status") .catch(() => null) ?? document.querySelector('[data-skipwait-follow="row"]');
    await waitFor(() => expect(document.querySelector('[data-skipwait-follow="row"]')?.textContent).toContain("7 followers"));
    expect(document.querySelector('[data-skipwait-follow="row"]')?.textContent).toContain("Joined September 2026");
    const button = screen.getByRole("button", { name: "Follow" });
    button.click();
    await waitFor(() => expect(screen.getByRole("button", { name: "Following" })).toBeTruthy());
    await waitFor(() => expect(document.querySelector('[data-skipwait-follow="row"]')?.textContent).toContain("8 followers"));
    expect(document.querySelector('[data-skipwait-follow-state="following"]')).toBeTruthy();
  });

  it("hides the toggle for signed-out visitors but still shows counts", async () => {
    authState.isSignedIn = false;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ followers: 5, followingCount: 1, isFollowingViewer: false, isMutual: false, joinedMonthYear: "June 2009", viewerSignedIn: false }) })));
    render(<FollowButton targetUserId={22} />);
    await waitFor(() => expect(document.querySelector('[data-skipwait-follow="row"]')?.textContent).toContain("5 followers"));
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });
});
