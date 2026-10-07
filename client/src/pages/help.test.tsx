// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Help from "./Help";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

describe("Help — kit v4 /help", () => {
  it("renders the heading, all five categories and every answer", () => {
    render(<Help />);
    expect(screen.getByText("How can we help")).toBeTruthy();
    for (const category of ["Asking", "Referring", "Plans & credits", "Account & privacy", "Safety"]) {
      expect(screen.getByRole("button", { name: new RegExp(category) })).toBeTruthy();
    }
    expect(screen.getByText("Is asking for a referral really free?")).toBeTruthy();
    expect(screen.getByText("How do I block someone?")).toBeTruthy();
  });

  it("never names a plan the product does not sell", () => {
    // The kit's copy says "Momentum and Land allow more". Live sells Pro and
    // Max, so naming those plans would promise a tier that cannot be bought.
    render(<Help />);
    fireEvent.click(screen.getByRole("button", { name: /How many asks can I have open\?/ }));
    expect(screen.getByText(/paid plans allow more/i)).toBeTruthy();
    expect(screen.queryByText(/Momentum/)).toBeNull();
    expect(screen.queryByText(/Land/)).toBeNull();
  });

  it("filters by category and by search text", () => {
    render(<Help />);
    fireEvent.click(screen.getByRole("button", { name: /^Safety$/ }));
    expect(screen.getByText("How do I block someone?")).toBeTruthy();
    expect(screen.queryByText("Do credits expire?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^All$/ }));
    fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "resume" } });
    expect(screen.getByText("Who can see my resume?")).toBeTruthy();
    expect(screen.queryByText("Do credits expire?")).toBeNull();
  });

  it("shows the empty state and keeps support reachable", () => {
    render(<Help />);
    fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "zzzz" } });
    expect(screen.getByText(/No answers for/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Contact support/ }).getAttribute("href")).toBe("/support");
  });

  it("links the policy pages and never ships a preview marker", () => {
    render(<Help />);
    for (const href of ["/guidelines", "/terms", "/privacy", "/safety"]) {
      expect(screen.getByRole("link", { name: new RegExp(href.slice(1), "i") })).toBeTruthy();
    }
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });
});
