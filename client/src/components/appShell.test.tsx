// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "./AppShell";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: false }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>account menu</div> }));

const { path } = vi.hoisted(() => ({ path: "/requests" }));
vi.mock("wouter", () => ({
  useLocation: () => [path],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("AppShell", () => {
  afterEach(() => cleanup());

  it("renders the kit sidebar mapped to live routes", () => {
    render(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    const sidebar = screen.getByRole("complementary");
    for (const [name, href] of [
      ["Explore", "/explore"],
      ["Requests", "/requests"],
      ["Inbox", "/inbox"],
      ["Refer", "/referrer-home"],
      ["Profile", "/profile"],
      ["My work", "/work"],
      ["Plans & credits", "/plans"],
    ]) {
      const link = within(sidebar).getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
    }
    expect(within(sidebar).getByText(/Referrals are free/)).toBeTruthy();
    const bells = screen.getAllByRole("link", { name: "Alerts" });
    expect(bells.length).toBe(2);
    expect(bells.every(bell => bell.getAttribute("href") === "/alerts")).toBe(true);
    expect(screen.getByText("Free referrals. Real expectations.")).toBeTruthy();
  });

  it("marks the current route active without inventing destinations", () => {
    render(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    const sidebar = screen.getByRole("complementary");
    const active = within(sidebar).getByRole("link", { name: "Requests" });
    expect(active.className).toContain("active");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(document.querySelector('a[href="/help"]')).toBeNull();
    expect(document.querySelector('a[href="/report"]')).toBeNull();
  });

  it("renders all eight mobile tabs plus the More menu", () => {
    render(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    const tabs = screen.getByRole("navigation", { name: "Mobile navigation" });
    for (const name of ["Explore", "Requests", "Inbox", "Refer", "Profile", "Work", "Plans"]) {
      expect(within(tabs).getByText(name)).toBeTruthy();
    }
    expect(within(tabs).getByRole("button", { name: "More" })).toBeTruthy();
  });

  it("opens the drawer from the hamburger and closes it on the scrim", () => {
    render(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toBeTruthy();
    fireEvent.click(document.querySelector(".drawer-scrim") as HTMLElement);
    expect(screen.queryByRole("button", { name: "Close menu" })).toBeNull();
  });
});
