// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminSignInCta, adminSignInHref } from "./AdminSignInCta";

describe("admin sign-in CTA", () => {
  it("links to sign-in and returns to the admin page", () => {
    expect(adminSignInHref("/admin/money-check")).toBe("/sign-in?returnTo=%2Fadmin%2Fmoney-check");
  });
  it("never returns outside /admin", () => {
    expect(adminSignInHref("//evil.example")).toBe("/sign-in?returnTo=%2Fadmin");
    expect(adminSignInHref("/plans")).toBe("/sign-in?returnTo=%2Fadmin");
  });
  it("renders the button", () => {
    render(<AdminSignInCta path="/admin/money-check" />);
    expect(screen.getByRole("link", { name: /sign in as administrator/i }).getAttribute("href")).toBe("/sign-in?returnTo=%2Fadmin%2Fmoney-check");
  });
});
