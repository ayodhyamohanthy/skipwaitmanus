// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForCompanies from "./ForCompanies";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/for-companies"],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ForCompanies sales page", () => {
  it("states live truths with no sample pricing or silent submits", () => {
    render(<ForCompanies />);
    expect(screen.getByText(/Your best hires already/)).toBeTruthy();
    expect(screen.getByText("Wipro")).toBeTruthy();
    expect(screen.queryByText(/EXAMPLE PRICING/i)).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("you@company.com"), { target: { value: "hr@acme.example" } });
    fireEvent.change(screen.getByPlaceholderText("Company name"), { target: { value: "Acme" } });
    const demo = screen.getByRole("link", { name: /Request demo/ });
    expect(demo.getAttribute("href")).toMatch(/^mailto:hello@skipwait\.me\?/);
    expect(demo.getAttribute("href")).toContain(encodeURIComponent("Acme"));
    fireEvent.change(screen.getByLabelText("Team size"), { target: { value: "51–200" } });
    expect(screen.getByRole("link", { name: /Request demo/ }).getAttribute("href")).toContain(encodeURIComponent("51–200"));
    expect(screen.getAllByRole("link", { name: "Employer workspace" }).every(link => link.getAttribute("href") === "/employer")).toBe(true);
  });
});
