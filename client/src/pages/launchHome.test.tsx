// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LaunchHome from "./LaunchHome";
import { LANDING_FAQ, LANDING_H1, LANDING_SUMMARY } from "@shared/landingContent";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

describe("LaunchHome — kit v4 launch homepage", () => {
  it("renders the kit's hero and the shared landing copy", () => {
    render(<LaunchHome />);
    // The h1 is split by a <br>, so textContent has no space between the
    // sentences and will never equal LANDING_H1 as one string.
    const heading = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    for (const part of LANDING_H1.split(" ")) {
      expect(heading).toContain(part);
    }
    expect(screen.getByText(LANDING_SUMMARY)).toBeTruthy();
    expect(screen.getByText("Introducing SkipWait")).toBeTruthy();
  });

  it("carries the three commitments from the shared source", () => {
    render(<LaunchHome />);
    expect(screen.getByText("No referral fees.")).toBeTruthy();
    expect(screen.getByText("Private by default.")).toBeTruthy();
    expect(screen.getByText("No job guarantees.")).toBeTruthy();
  });

  it("links every launch company to its v4 company page", () => {
    render(<LaunchHome />);
    // A link's accessible name is its text, not its href, so this has to read
    // the hrefs rather than match a pattern against the name.
    const hrefs = screen.getAllByRole("link").map(link => link.getAttribute("href"));
    for (const slug of ["skipwait", "wipro", "go-neutrinos", "tcs", "merkle"]) {
      expect(hrefs).toContain(`/explore/${slug}`);
    }
  });

  it("answers the shared FAQ and opens the first one", () => {
    render(<LaunchHome />);
    for (const entry of LANDING_FAQ) {
      expect(screen.getByRole("button", { name: entry.question })).toBeTruthy();
    }
    expect(screen.getByText(LANDING_FAQ[0]!.answer)).toBeTruthy();
  });

  it("never names a plan or a price", () => {
    // The pre-v4 landing copy quoted "$1 each (₹99 in India)" and named Pro and
    // Max. The plan set is undecided, so no v4 landing string may commit to one.
    render(<LaunchHome />);
    expect(screen.queryByText(/Momentum/)).toBeNull();
    expect(screen.queryByText(/Pro and Max/)).toBeNull();
    expect(screen.queryByText(/\$1 each/)).toBeNull();
    expect(screen.queryByText(/₹99/)).toBeNull();
  });

  it("links only v4 destinations, and never a retired route", () => {
    render(<LaunchHome />);
    const hrefs = screen.getAllByRole("link").map(link => link.getAttribute("href") ?? "");
    for (const retired of ["/jobs", "/wall", "/premium", "/pricing", "/about", "/contact", "/support", "/employer"]) {
      expect(hrefs).not.toContain(retired);
    }
    expect(hrefs).toContain("/explore");
    expect(hrefs).toContain("/safety");
    expect(hrefs).toContain("/for-companies");
  });

  it("opens and closes the mobile navigation", () => {
    render(<LaunchHome />);
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close navigation" }).getAttribute("aria-expanded")).toBe("true");
  });
});
