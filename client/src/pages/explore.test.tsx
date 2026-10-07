// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Explore from "./Explore";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

const search = () => screen.getByPlaceholderText("Company, function, or industry");
const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;

describe("Explore — kit v4 /explore", () => {
  it("renders the designed heading and all five declared launch companies", () => {
    render(<Explore />);
    expect(screen.getByText(/Where do you/)).toBeTruthy();
    expect(screen.getByText(/Start with a company/)).toBeTruthy();
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
    for (const company of ["SkipWait", "Wipro", "Go Neutrinos", "TCS", "Merkle"]) {
      expect(screen.getByText(company)).toBeTruthy();
    }
  });

  it("counts what it actually renders, not a decorative number", () => {
    render(<Explore />);
    fireEvent.change(search(), { target: { value: "wipro" } });
    expect(screen.getByText("1 company to explore")).toBeTruthy();
    expect(screen.queryByText("Merkle")).toBeNull();
  });

  it("filters by function and by location, and clears back to the full set", () => {
    render(<Explore />);
    fireEvent.change(select("Function"), { target: { value: "Data" } });
    expect(screen.getByText("3 companies to explore")).toBeTruthy();
    expect(screen.queryByText("Go Neutrinos")).toBeNull();

    // Reset the function first: Go Neutrinos is the only India company and it
    // has no Data function, so "Data + India" is legitimately an empty set.
    fireEvent.change(select("Function"), { target: { value: "" } });
    fireEvent.change(select("Location"), { target: { value: "India" } });
    expect(screen.getByText("1 company to explore")).toBeTruthy();
    expect(screen.getByText("Go Neutrinos")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Clear$/ }));
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
  });

  it("shows the empty state and keeps both escape routes", () => {
    render(<Explore />);
    fireEvent.change(search(), { target: { value: "zzzz" } });
    expect(screen.getByText("No matching doors yet")).toBeTruthy();
    expect(screen.getByText("Try a wider search.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Request a company/ }).getAttribute("href")).toBe("/invite");
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
  });

  it("links each card to its company page and never ships a preview marker", () => {
    render(<Explore />);
    const doors = screen.getAllByRole("link", { name: /View open door/ });
    expect(doors.length).toBe(5);
    expect(doors.map(link => link.getAttribute("href"))).toEqual([
      "/explore/skipwait", "/explore/wipro", "/explore/go-neutrinos", "/explore/tcs", "/explore/merkle",
    ]);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });

  it("keeps the referral promise and the availability hedge visible", () => {
    render(<Explore />);
    expect(screen.getByText(/Availability can change/)).toBeTruthy();
    expect(screen.getByText(/Free\. Always\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: /I can refer/ }).getAttribute("href")).toBe("/referrer");
  });
});
