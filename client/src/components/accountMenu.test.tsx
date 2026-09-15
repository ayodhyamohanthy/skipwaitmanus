// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountMenu } from "./AccountMenu";

const signOut = vi.fn().mockResolvedValue(undefined);
const authUser = vi.hoisted(() => ({ imageUrl: "https://images.example.test/avery.png" as string | null, workEmailVerified: false }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, signOut }),
  useUser: () => ({ user: authUser.imageUrl ? { imageUrl: authUser.imageUrl, emailAddresses: authUser.workEmailVerified ? [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] : [{ emailAddress: "avery@gmail.com", verification: { status: "verified" } }] } : null }),
}));

describe("AccountMenu", () => {
  afterEach(() => { cleanup(); signOut.mockReset(); signOut.mockResolvedValue(undefined); localStorage.clear(); sessionStorage.clear(); authUser.imageUrl = "https://images.example.test/avery.png"; authUser.workEmailVerified = false; window.history.replaceState({}, "", "/"); });

  it("uses the signed-in profile image as the compact menu trigger", () => {
    render(<AccountMenu />);
    const image = screen.getByRole("button", { name: "Account menu" }).querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://images.example.test/avery.png");
  });

  it("falls back to the compact user icon when the signed-in profile has no image", () => {
    authUser.imageUrl = null;
    render(<AccountMenu />);
    expect(screen.getByRole("button", { name: "Account menu" }).querySelector("img")).toBeNull();
  });

  it("opens Settings and keeps My Company Inbox and My impact hidden without a verified company email", async () => {
    render(<AccountMenu />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole("menuitem", { name: "My Company Inbox" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "My impact" })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(window.location.pathname).toBe("/settings");
  });

  it("shows My Company Inbox and the My impact dashboard link only after a verified company email is present", async () => {
    authUser.workEmailVerified = true;
    render(<AccountMenu />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "My Company Inbox" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("menuitem", { name: "My impact" }));
    await waitFor(() => expect(window.location.pathname).toBe("/referrer/impact"));
  });

  it("signs out from the menu after a verified company email is present", async () => {
    authUser.workEmailVerified = true;
    render(<AccountMenu />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(()=>expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("clears private browser data before sign-out and keeps it cleared on rejection", async () => {
    localStorage.setItem("bridge-company-confirmation","private"); localStorage.setItem("bridge-target-compensation","private"); localStorage.setItem("theme","dark"); sessionStorage.setItem("skipwait.pending-chargebee-checkout","private");
    signOut.mockRejectedValueOnce(new Error("network")); render(<AccountMenu/>); fireEvent.pointerDown(screen.getByRole("button",{name:"Account menu"}),{button:0,ctrlKey:false}); fireEvent.click(await screen.findByRole("menuitem",{name:"Sign out"}));
    await waitFor(()=>expect(signOut).toHaveBeenCalledTimes(1)); expect(localStorage.getItem("bridge-company-confirmation")).toBeNull(); expect(localStorage.getItem("bridge-target-compensation")).toBeNull(); expect(sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull(); expect(localStorage.getItem("theme")).toBe("dark"); expect((await screen.findByRole("alert")).textContent).toContain("Sign out failed. Try again.");
  });
});
