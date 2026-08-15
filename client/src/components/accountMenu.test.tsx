// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountMenu } from "./AccountMenu";

const signOut = vi.fn().mockResolvedValue(undefined);
const clerkUser = vi.hoisted(() => ({ imageUrl: "https://images.example.test/avery.png" as string | null, workEmailVerified: false }));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, signOut }),
  useUser: () => ({ user: clerkUser.imageUrl ? { imageUrl: clerkUser.imageUrl, emailAddresses: clerkUser.workEmailVerified ? [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] : [{ emailAddress: "avery@gmail.com", verification: { status: "verified" } }] } : null }),
}));

describe("AccountMenu", () => {
  afterEach(() => { cleanup(); signOut.mockClear(); clerkUser.imageUrl = "https://images.example.test/avery.png"; clerkUser.workEmailVerified = false; window.history.replaceState({}, "", "/"); });

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

  it("opens Settings and keeps Job Referrer mode hidden without a verified company email", async () => {
    render(<AccountMenu />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole("menuitem", { name: "Switch to Job Referrer mode" })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(window.location.pathname).toBe("/settings");
  });

  it("shows Job Referrer mode only after a verified company email is present", async () => {
    clerkUser.workEmailVerified = true;
    render(<AccountMenu />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "Switch to Job Referrer mode" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
