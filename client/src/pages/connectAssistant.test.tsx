// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConnectAssistant from "./ConnectAssistant";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

const STATES = ["Consent", "Unverified app", "Signed out", "Not on Land", "Expired", "Approved", "Declined"];

describe("ConnectAssistant — kit v4 /connect-assistant", () => {
  it("renders all seven consent states", () => {
    render(<ConnectAssistant />);
    for (const name of STATES) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Consent" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("separates what the assistant can do from what it can never do", () => {
    render(<ConnectAssistant />);
    expect(screen.getByText("It can")).toBeTruthy();
    expect(screen.getByText("It can never")).toBeTruthy();
    expect(screen.getByText(/Send an ask — only after you approve each one/)).toBeTruthy();
    expect(screen.getByText(/Accept, pass or refer on anyone's behalf/)).toBeTruthy();
    expect(screen.getByText(/Buy plans or credits/)).toBeTruthy();
  });

  it("pins read access on and lets the user drop the write scopes", () => {
    render(<ConnectAssistant />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(5);
    expect(boxes[0]!.disabled).toBe(true);
    expect(boxes.every(box => box.checked)).toBe(true);
    fireEvent.click(boxes[3]!);
    expect(boxes[3]!.checked).toBe(false);
  });

  it("never prints a sample account address on the consent line", () => {
    // The kit names "asha@gmail.com". A consent screen must state the real
    // session, so the copy says "your signed-in account" until the connection
    // flow supplies the address.
    render(<ConnectAssistant />);
    expect(screen.queryByText(/asha@gmail\.com/)).toBeNull();
    expect(screen.getByText(/your signed-in account/)).toBeTruthy();
  });

  it("walks approve and decline into their outcome states", () => {
    render(<ConnectAssistant />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText("ChatGPT is connected")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Manage assistants/ }).getAttribute("href")).toBe("/assistants");
    fireEvent.click(screen.getByRole("button", { name: "Consent" }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel connection/ }));
    expect(screen.getByText("Connection cancelled")).toBeTruthy();
  });

  it("gates the plan state to /plans and the signed-out state to /sign-in", () => {
    render(<ConnectAssistant />);
    fireEvent.click(screen.getByRole("button", { name: "Not on Land" }));
    expect(screen.getByRole("link", { name: /See plans/ }).getAttribute("href")).toBe("/plans");
    fireEvent.click(screen.getByRole("button", { name: "Signed out" }));
    expect(screen.getByRole("link", { name: /Sign in to SkipWait/ }).getAttribute("href")).toBe("/sign-in");
  });
});
