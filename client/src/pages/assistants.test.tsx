// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Assistants from "./Assistants";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

const tab = (name: string) => screen.getByRole("tab", { name });

describe("Assistants — kit v4 /assistants", () => {
  it("opens on the kit's own empty state, not seeded assistants", () => {
    // The kit ships "ChatGPT" and "Claude" as examples with "Used 2 hours ago".
    // Claiming connections the account does not have is fabricated activity.
    render(<Assistants />);
    expect(screen.getByText("No assistants connected")).toBeTruthy();
    expect(screen.queryByText("ChatGPT")).toBeNull();
    expect(screen.queryByText("Claude")).toBeNull();
  });

  it("shows an honest empty activity log rather than invented events", () => {
    render(<Assistants />);
    fireEvent.click(tab("Activity"));
    expect(screen.getByText(/No assistant activity yet/)).toBeTruthy();
    expect(screen.queryByText(/Drafted an ask to Wipro/)).toBeNull();
    expect(screen.queryByText(/9th ask/)).toBeNull();
  });

  it("never mints a token it cannot verify", () => {
    // The kit's create form hard-codes "sw_live_••••••••••••••••7Qk2". A user
    // would paste that into a script and it would never authenticate.
    render(<Assistants />);
    fireEvent.click(tab("API tokens"));
    expect(screen.queryByText(/sw_live_/)).toBeNull();
    expect(screen.queryByText(/Create token/)).toBeNull();
    expect(screen.getByText(/will not show a token it cannot verify/)).toBeTruthy();
  });

  it("never names a plan the product does not sell", () => {
    render(<Assistants />);
    expect(screen.getByText(/part of the top plan/)).toBeTruthy();
    expect(screen.queryByText(/Upgrade to Land/)).toBeNull();
    expect(screen.queryByText(/Momentum/)).toBeNull();
    expect(screen.getByRole("link", { name: /See plans/ }).getAttribute("href")).toBe("/plans");
  });

  it("states the approval rule and links the assistant surfaces", () => {
    render(<Assistants />);
    expect(screen.getByText(/every send and every credit spend needs your approval/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /See what an assistant can do/ }).getAttribute("href")).toBe("/connect-assistant");
    fireEvent.click(tab("Activity"));
    expect(screen.getByRole("link", { name: /Review waiting approval/ }).getAttribute("href")).toBe("/approve");
    fireEvent.click(tab("API tokens"));
    expect(screen.getByRole("link", { name: /Developer docs/ }).getAttribute("href")).toBe("/developers");
  });

  it("never ships a design-preview banner", () => {
    render(<Assistants />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    expect(screen.queryByText(/EXAMPLE ACTIVITY/i)).toBeNull();
  });
});
