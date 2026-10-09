// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStatesGallery } from "./AppStates";
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
    render(<AppStatesGallery />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Every edge, designed.");
    fireEvent.click(screen.getByRole("button", { name: "Payment failed" }));
    expect(screen.getByText("Payment didn't go through.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try another card" }).getAttribute("href")).toBe("/plans");
    expect(screen.queryByText(/UPI/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Push permission" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn on notifications" }));
    expect((await screen.findByRole("status")).textContent).toBe("This browser doesn't support notifications.");
    expect(screen.queryByText(/Design Preview/i)).toBeNull();
  });

  it("documents the real transactional templates, never sample mail", () => {
    render(<Emails />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("EMAIL & IN-APP TEMPLATES");
    expect(screen.getByText(/Twelve templates, each fired by exactly one real event/)).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Templates" });
    expect(nav.querySelectorAll("button")).toHaveLength(12);
    // The first template is selected and previewed as an email, with the code masked.
    expect(screen.getByRole("button", { name: "Work-email code" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("article", { name: "Work-email code" }).textContent).toContain("SkipWait <noreply@skipwait.me>");
    expect(screen.getByText(/6 digits, 10-minute expiry, 5 attempts/)).toBeTruthy();
    // Selecting another template swaps the preview; in-app templates are not shown as mail.
    fireEvent.click(screen.getByRole("button", { name: "Ask passed" }));
    expect(screen.getByRole("button", { name: "Ask passed" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/The ask stays active for other employees/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New message" }));
    expect(screen.getByRole("article", { name: "New message" }).textContent).not.toContain("noreply@skipwait.me");
    expect(screen.getByRole("link", { name: /See in-app updates/ }).getAttribute("href")).toBe("/alerts");
    // No sample codes, people, companies or preview scaffolding.
    expect(document.body.textContent).not.toMatch(/123456|482 913|Wipro|Design Preview|EXAMPLE/i);
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
