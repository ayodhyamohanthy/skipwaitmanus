// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotFound, { NotFoundContent } from "./NotFound";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

afterEach(cleanup);

describe("Not Found recovery", () => {
  it("uses skipwait.me branding and a clear return-home action", () => {
    render(<NotFoundContent />);
    expect(screen.getByRole("heading", { name: "This door doesn't lead anywhere." })).toBeTruthy();
    expect(screen.getByText("The page may have moved, or the link was mistyped.")).toBeTruthy();
    expect(screen.queryByText(/Bridge/)).toBeNull();
    expect(screen.getByRole("link", { name: "Explore companies" }).getAttribute("href")).toBe("/explore");
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/support");
  });

  it("keeps the app shell's navigation around an unmatched path, as the kit does", () => {
    render(<NotFound />);
    expect(screen.getByTestId("app-shell").querySelector('[data-skipwait-screen="not-found"]')).toBeTruthy();
  });
});
