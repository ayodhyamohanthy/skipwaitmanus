// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Developers from "./Developers";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

describe("Developers — kit v4 /developers", () => {
  it("renders the designed heading and the three integration surfaces", () => {
    render(<Developers />);
    expect(screen.getByText(/Use SkipWait from ChatGPT, Claude/)).toBeTruthy();
    expect(screen.getByText("MCP connector")).toBeTruthy();
    expect(screen.getByText("REST API")).toBeTruthy();
    expect(screen.getByText("Webhooks")).toBeTruthy();
  });

  it("lists every tool the kit specifies, including the approval-gated ones", () => {
    render(<Developers />);
    for (const tool of ["search_companies", "get_company", "list_my_requests", "get_request_thread", "draft_ask", "send_ask", "withdraw_ask", "run_tool", "list_alerts / save_alert", "add_work_item"]) {
      expect(screen.getByText(tool)).toBeTruthy();
    }
    expect(screen.getByText(/needs your approval on phone or web/)).toBeTruthy();
  });

  it("keeps an accurate not-live marker instead of a preview label", () => {
    // The capture heads this page "DESIGN PREVIEW · API NOT LIVE". The label is
    // preview scaffolding; the statement is true -- there is no MCP server yet.
    // Deleting the whole banner would tell people to connect an endpoint that
    // returns nothing, so the label goes and the fact stays.
    render(<Developers />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    expect(screen.getByText(/Not live yet/)).toBeTruthy();
  });

  it("states both sides of the rule: what matches people, and what is never possible", () => {
    render(<Developers />);
    expect(screen.getByText("Same rules as people")).toBeTruthy();
    expect(screen.getByText("Never possible")).toBeTruthy();
    expect(screen.getByText(/Automating a referrer's decision/)).toBeTruthy();
    expect(screen.getByText(/Buying queue position/)).toBeTruthy();
  });

  it("routes to the assistant and developer consoles", () => {
    render(<Developers />);
    expect(screen.getByRole("link", { name: /Connect an assistant/ }).getAttribute("href")).toBe("/connect-assistant");
    expect(screen.getByRole("link", { name: /Build an app/ }).getAttribute("href")).toBe("/developer-console");
    expect(screen.getByRole("link", { name: /Connected assistants/ }).getAttribute("href")).toBe("/assistants");
  });
});
