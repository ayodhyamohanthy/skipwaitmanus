// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompanyDetail from "./CompanyDetail";

const { params } = vi.hoisted(() => ({ params: { slug: "skipwait" } as { slug?: string } }));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useParams: () => params,
}));

beforeEach(() => { params.slug = "skipwait"; });
afterEach(cleanup);

describe("CompanyDetail — kit v4 /explore/:slug", () => {
  it("renders the hero from the company record", () => {
    render(<CompanyDetail />);
    expect(screen.getByRole("heading", { name: /SkipWait/ })).toBeTruthy();
    expect(screen.getByText("SW")).toBeTruthy();
    expect(screen.getByText(/Build the platform making warm introductions/)).toBeTruthy();
    expect(screen.getByText("Technology")).toBeTruthy();
    expect(screen.getByText("Global · Remote")).toBeTruthy();
    expect(screen.getByText(/People open to referral requests/)).toBeTruthy();
  });

  it("sends the primary action to the real composer, not a preview dialog", () => {
    render(<CompanyDetail />);
    // The kit's own four-step dialog ends in "NOTHING WILL BE SENT" copy. The
    // live composer at /request actually submits, so the CTA hands off to it
    // with the company attached rather than duplicating the flow.
    expect(screen.getByRole("link", { name: /Ask for a referral/ }).getAttribute("href")).toBe("/request?company=skipwait");
    expect(screen.queryByText(/Nothing was sent/i)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });

  it("renders the before-you-ask guidance in order", () => {
    render(<CompanyDetail />);
    expect(screen.getByText("Before you ask")).toBeTruthy();
    expect(screen.getByText(/Bring the role/)).toBeTruthy();
    for (const title of ["Use the exact job link", "Make your fit easy to see", "Respect the decision"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it("states what is shared and links the safety guide", () => {
    render(<CompanyDetail />);
    expect(screen.getByText("What is shared, and when?")).toBeTruthy();
    expect(screen.getByText(/remain private until a request is accepted/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Read safety guide/ }).getAttribute("href")).toBe("/safety");
  });

  it("resolves every declared launch company", () => {
    for (const [slug, name] of [["wipro", "Wipro"], ["go-neutrinos", "Go Neutrinos"], ["tcs", "TCS"], ["merkle", "Merkle"]] as const) {
      params.slug = slug;
      render(<CompanyDetail />);
      expect(screen.getByRole("heading", { name: new RegExp(name) })).toBeTruthy();
      cleanup();
    }
  });

  it("shows an honest not-found state for an unknown company", () => {
    params.slug = "not-a-company";
    render(<CompanyDetail />);
    expect(screen.getByText(/not on SkipWait/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Browse companies/ }).getAttribute("href")).toBe("/explore");
    expect(screen.getByRole("link", { name: /Request a company/ }).getAttribute("href")).toBe("/invite");
  });
});
