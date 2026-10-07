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

  it("renders kit navigation mapped to live routes", () => {
    render(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    const sidebar = screen.getByRole("complementary", { name: "App sidebar" });
    for (const [name, href] of [
      ["Requests", "/requests"],
      ["Inbox", "/inbox"],
      ["Refer", "/referrer-home"],
      ["Profile", "/profile"],
      ["My work", "/work"],
      ["Plans & credits", "/plans"],
      ["Settings", "/settings"],
    ]) {
      const link = within(sidebar).getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
    }
    expect(within(sidebar).getByText("Referrals are free. Always.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alerts" }).getAttribute("href")).toBe("/alerts");
  });

  it("marks the current route without inventing destinations", () => {
    render(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    expect(within(screen.getByRole("complementary", { name: "App sidebar" })).getByRole("link", { name: "Requests" }).getAttribute("aria-current")).toBe("page");
    // Kit-only routes have no shell entry yet — nothing points at them.
    expect(document.querySelector('a[href="/help"]')).toBeNull();
    expect(document.querySelector('a[href="/report"]')).toBeNull();
  });

  it("opens the More drawer with help, companies, and sign-in on mobile", () => {
    render(
      <AppShell>
        <p>page</p>
      </AppShell>
    );
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(within(dialog).getByRole("link", { name: "Help & safety" }).getAttribute("href")).toBe("/support");
    expect(within(dialog).getByRole("link", { name: "For companies" }).getAttribute("href")).toBe("/employer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });
});
