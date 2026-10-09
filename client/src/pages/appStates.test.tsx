// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppStates, { AppStatesGallery } from "./AppStates";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const chip = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("App states gallery", () => {
  it("renders inside the app shell, as the kit route does", () => {
    render(<AppStates />);
    expect(screen.getByTestId("app-shell").querySelector('[data-skipwait-screen="app-states"]')).toBeTruthy();
  });

  it("offers every screen as its own navigation, with no preview scaffolding", () => {
    render(<AppStatesGallery />);
    const group = screen.getByRole("group", { name: "Screen" });
    const names = ["Install (Android)", "Install (iPhone)", "Push permission", "Offline", "Slow connection", "Not found", "Something went wrong", "Payment failed", "Loading"];
    for (const name of names) expect(within(group).getByRole("button", { name }).getAttribute("aria-pressed")).toBe(name === "Install (Android)" ? "true" : "false");
    expect(document.body.textContent).not.toMatch(/Design Preview|Preview state|Example/i);
  });

  it("only claims what the live product does on each system screen", () => {
    render(<AppStatesGallery />);
    chip("Offline");
    expect(screen.getByText("No connection.")).toBeTruthy();
    expect(screen.getByText("Your drafts are saved on this device. Send them when you're back online.")).toBeTruthy();
    chip("Slow connection");
    expect(screen.getByText("Slow connection — pages may take a moment.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/lighter version/);
    chip("Something went wrong");
    expect(screen.getByText("Something went wrong on our side.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/support");
    expect(document.body.textContent).not.toMatch(/Error ref|SW-/);
    chip("Not found");
    expect(screen.getByRole("link", { name: /Explore companies/ }).getAttribute("href")).toBe("/explore");
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/");
  });

  it("moves from a failure screen to loading on Try again", () => {
    render(<AppStatesGallery />);
    chip("Offline");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Loading" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("dismisses the iPhone install sheet and brings it back from its chip", () => {
    render(<AppStatesGallery />);
    chip("Install (iPhone)");
    expect(screen.getByText("Add SkipWait to your Home Screen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Add SkipWait to your Home Screen")).toBeNull();
    chip("Install (iPhone)");
    expect(screen.getByText("Add SkipWait to your Home Screen")).toBeTruthy();
  });

  it("opens the browser's own install prompt only when the browser offered one", async () => {
    render(<AppStatesGallery />);
    fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/hasn't offered install/);

    chip("Install (Android)");
    const prompt = vi.fn().mockResolvedValue(undefined);
    const offered = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" as const }) });
    act(() => { window.dispatchEvent(offered); });
    expect(offered.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    expect((await screen.findByRole("status")).textContent).toBe("Installing SkipWait on this device.");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("asks the browser for notification permission and reports its answer", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", { requestPermission });
    render(<AppStatesGallery />);
    chip("Push permission");
    fireEvent.click(screen.getByRole("button", { name: "Turn on notifications" }));
    expect((await screen.findByRole("status")).textContent).toBe("Notifications are blocked. Allow them in your browser settings to change that.");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("leaves the permission untouched on Maybe later", () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { requestPermission });
    render(<AppStatesGallery />);
    chip("Push permission");
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
    expect(screen.getByRole("status").textContent).toBe("Notifications stay off until you allow them.");
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
