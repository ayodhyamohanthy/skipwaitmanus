// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZeroActivityShareCard } from "./ZeroActivityShareCard";

vi.mock("sonner", () => ({ toast: vi.fn() }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ZeroActivityShareCard", () => {
  it("gives a Job Seeker direct WhatsApp, email, and social sharing links instead of a generic empty-state prompt", () => {
    render(<ZeroActivityShareCard audience="job_seeker" />);
    expect(screen.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")).toContain("wa.me/?text=");
    expect(screen.getByRole("link", { name: "Share by email" }).getAttribute("href")).toContain("mailto:");
    expect(screen.getByRole("link", { name: "Share on LinkedIn" }).getAttribute("href")).toContain("linkedin.com/sharing");
    expect(screen.getByRole("link", { name: "Share on X" }).getAttribute("href")).toContain("x.com/intent/post");
  });

  it("keeps the Referrer sharing handoff concise and channel-specific", () => {
    render(<ZeroActivityShareCard audience="referrer" />);
    expect(screen.getByText("Share this useful next step")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share by email" }).getAttribute("href")).toContain(encodeURIComponent(`${window.location.origin}/referrer`));
  });
});
