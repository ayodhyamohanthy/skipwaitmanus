// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountMenu } from "./AccountMenu";

const signOut = vi.fn().mockResolvedValue(undefined);
const openUserProfile = vi.fn();
const clerkUser = vi.hoisted(() => ({ imageUrl: "https://images.example.test/avery.png" as string | null }));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, signOut }), useClerk: () => ({ openUserProfile }), useUser: () => ({ user: clerkUser.imageUrl ? { imageUrl: clerkUser.imageUrl } : null }) }));

describe("AccountMenu", () => {
  afterEach(() => { cleanup(); signOut.mockClear(); openUserProfile.mockClear(); clerkUser.imageUrl = "https://images.example.test/avery.png"; });

  it("uses the signed-in profile image as the compact menu trigger", () => {
    render(<AccountMenu />);
    const image = screen.getByRole("button", { name: "Account menu" }).querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://images.example.test/avery.png");
  });

  it("falls back to the compact user icon when the signed-in profile has no image", () => {
    clerkUser.imageUrl = null;
    render(<AccountMenu />);
    expect(screen.getByRole("button", { name: "Account menu" }).querySelector("img")).toBeNull();
  });

  it("keeps account identity hidden and exposes Settings above Sign out from the user-icon dropdown", async () => {
    render(<AccountMenu />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(openUserProfile).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
