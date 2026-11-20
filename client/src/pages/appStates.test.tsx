// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import AppStates from "./AppStates";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(async () => { await import("./goal/system/GoalAppStates"); });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const chip = async (name: string) => fireEvent.click(await screen.findByRole("button", { name }));

describe("App states page", () => {
  it("offers all nine screens as mutually exclusive navigation", async () => {
    render(<AppStates />);
    const group = await screen.findByRole("group", { name: "Screen" });
    const names = ["Install (Android)", "Install (iPhone)", "Push permission", "Offline", "Slow connection", "Not found", "Something went wrong", "Payment failed", "Loading"];
    expect(within(group).getAllByRole("button")).toHaveLength(names.length);
    for (const name of names) {
      await chip(name);
      for (const option of names) {
        expect(within(group).getByRole("button", { name: option }).getAttribute("aria-pressed")).toBe(option === name ? "true" : "false");
      }
    }
  });

  it("shows truthful screen actions and local support and return links without fetching", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<AppStates />);
    expect((await screen.findByRole("link", { name: "Go home" })).getAttribute("href")).toBe("/");

    await chip("Push permission");
    expect(await screen.findByText(/sends no device push today/)).toBeTruthy();
    expect(screen.getByText(/only sets the browser permission/)).toBeTruthy();

    await chip("Something went wrong");
    expect((await screen.findByRole("link", { name: "Contact support" })).getAttribute("href")).toBe("/support");

    await chip("Payment failed");
    expect((await screen.findByRole("link", { name: "Try another card" })).getAttribute("href")).toBe("/plans");
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/support");

    await chip("Not found");
    expect((await screen.findByRole("link", { name: "Explore companies" })).getAttribute("href")).toBe("/explore");
    expect(screen.getAllByRole("link", { name: "Go home" }).every(link => link.getAttribute("href") === "/")).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("moves offline and error failures to the Loading state on retry", async () => {
    render(<AppStates />);
    await chip("Offline");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect((await screen.findByRole("status", { name: "Loading" })).textContent).toContain("Loading");
    expect((await screen.findByRole("button", { name: "Loading" })).getAttribute("aria-pressed")).toBe("true");

    await chip("Something went wrong");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect((await screen.findByRole("status", { name: "Loading" })).textContent).toContain("Loading");
  });

  it("dismisses the iPhone install sheet and reopens it from its chip", async () => {
    render(<AppStates />);
    await chip("Install (iPhone)");
    expect(await screen.findByText("Add skipwait.me to your Home Screen")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Add skipwait.me to your Home Screen")).toBeNull();
    await chip("Install (iPhone)");
    expect(await screen.findByText("Add skipwait.me to your Home Screen")).toBeTruthy();
  });

  it("uses the offered Android install prompt once and reports when none is offered", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    render(<AppStates />);
    fireEvent.click(await screen.findByRole("button", { name: "Install app" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/hasn't offered install/);
    expect(prompt).not.toHaveBeenCalled();

    await chip("Install (Android)");
    await screen.findByRole("button", { name: "Install app" });
    const offered = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" as const }) });
    act(() => { window.dispatchEvent(offered); });
    expect(offered.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    expect((await screen.findByRole("status")).textContent).toBe("Installing skipwait.me on this device.");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("asks once when Allow is chosen and reports denied notification permission", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", { requestPermission });
    render(<AppStates />);
    await chip("Push permission");
    fireEvent.click(await screen.findByRole("button", { name: "Allow" }));
    expect((await screen.findByRole("status")).textContent).toBe("Notifications are blocked. Allow them in your browser settings to change that.");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("leaves notification permission untouched on Maybe later", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { requestPermission });
    render(<AppStates />);
    await chip("Push permission");
    fireEvent.click(await screen.findByRole("button", { name: "Maybe later" }));
    expect((await screen.findByRole("status")).textContent).toBe("Notifications stay off until you allow them.");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reports when notification permission is unsupported without calling the API", async () => {
    vi.stubGlobal("Notification", undefined);
    render(<AppStates />);
    await chip("Push permission");
    fireEvent.click(await screen.findByRole("button", { name: "Allow" }));
    expect((await screen.findByRole("status")).textContent).toBe("This browser doesn't support notifications.");
  });
});
