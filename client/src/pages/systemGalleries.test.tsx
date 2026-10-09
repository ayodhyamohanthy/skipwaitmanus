// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppStates from "./AppStates";
import Emails from "./Emails";
import Developers from "./Developers";
import { DOCUMENTED_MCP_TOOLS } from "@/components/developers/mcpTools";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/app-states"],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("System galleries", () => {
  it("walks every app state with real install and push behavior", async () => {
    render(<AppStates />);
    expect(screen.getByText("Every edge, designed")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Payment failed" }));
    expect(screen.getByText("Payment didn't go through")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Try again/ }).getAttribute("href")).toBe("/premium");
    fireEvent.click(screen.getByRole("tab", { name: "Push permission" }));
    fireEvent.click(screen.getByRole("button", { name: "Allow push" }));
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("documents the real transactional templates, never sample mail", () => {
    render(<Emails />);
    expect(screen.getByText(/Every email we send/)).toBeTruthy();
    expect(screen.getByText("Work-email code")).toBeTruthy();
    expect(screen.getByText("Ask passed")).toBeTruthy();
    expect(screen.queryByText(/123456/)).toBeNull();
    expect(screen.queryByText(/Design Preview/i)).toBeNull();
  });

  it("documents only the live assistant surface, never preview APIs", () => {
    render(<Developers />);
    expect(screen.getByText(/Use SkipWait from ChatGPT, Claude, or your own code/)).toBeTruthy();
    expect(screen.getAllByText("https://skipwait.me/api/mcp").length).toBeGreaterThan(0);
    for (const [tool] of DOCUMENTED_MCP_TOOLS) expect(screen.getByText(tool)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect an assistant" }).getAttribute("href")).toBe("/connect-assistant");
    expect(screen.getByRole("link", { name: "Build an app" }).getAttribute("href")).toBe("/developer-console");
    expect(screen.getByRole("link", { name: "Connected assistants" }).getAttribute("href")).toBe("/assistants");
    // No preview scaffolding, no endpoints or deliveries that do not exist, live plan names only.
    expect(screen.queryByText(/Design Preview/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/api\/v1|sw_live_|REST API|Webhooks|Land|Concierge|Sent with/);
  });
});
