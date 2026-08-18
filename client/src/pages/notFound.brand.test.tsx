// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotFound from "./NotFound";

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

describe("Not Found recovery", () => {
  it("uses skipwait.me branding and a clear return-home action", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "This page isn’t on skipwait.me." })).toBeTruthy();
    expect(screen.queryByText(/Bridge/)).toBeNull();
    expect(screen.getByRole("link", { name: "Return home" }).getAttribute("href")).toBe("/");
  });
});
