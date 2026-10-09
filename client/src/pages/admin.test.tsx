// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Admin from "./Admin";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

const report = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1, reference: "R-2048", reason: "money_request", urgent: false, status: "received",
  dueAt: new Date().toISOString(), overdue: false, ...over,
});

describe("Admin — kit v4 /admin console", () => {
  it("opens on the operations overview with the kit's framing", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ reports: [] })));
    render(<Admin />);
    expect(screen.getByText("Operate for trust, not vanity.")).toBeTruthy();
    expect(screen.getByText("Marketplace control room")).toBeTruthy();
    expect(screen.getByText("Monetization guardrails")).toBeTruthy();
    expect(screen.getByText("Priority queues")).toBeTruthy();
    // "SkipWait" is also the shell wordmark, so only the non-brand companies
    // can prove the directory view has not rendered.
    for (const company of ["Wipro", "Go Neutrinos", "TCS", "Merkle"]) {
      expect(screen.queryByText(company)).toBeNull();
    }
  });

  it("never ships the preview scaffolding", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ reports: [] })));
    render(<Admin />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    expect(screen.queryByText(/Live data not connected/i)).toBeNull();
    expect(screen.queryByText(/No fabricated count/i)).toBeNull();
    expect(screen.queryByText(/ILLUSTRATIVE/i)).toBeNull();
    expect(screen.queryByText(/SAMPLE REPORTING STRUCTURE/i)).toBeNull();
  });

  it("shows the real open-report count and flags anything past its SLA", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ reports: [report(), report({ id: 2, reference: "R-2049", urgent: true, overdue: true })] })));
    render(<Admin />);
    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
    expect(screen.getByText(/1 past SLA/)).toBeTruthy();
  });

  it("renders the safety queue from the live endpoint with human reason labels", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ reports: [report({ urgent: true })] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: /Safety reports/ }));
    await waitFor(() => expect(screen.getByText("R-2048")).toBeTruthy());
    expect(screen.getByText("Asked for or offered money")).toBeTruthy();
    expect(screen.getByText("Unsafe")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/safety-reports");
  });

  it("keeps the queue honest on failure and offers a retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Administrator access is required" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: /Safety reports/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Administrator access is required/);
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("routes each view to the console that already owns it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ reports: [] })));
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: /Verifications/ }));
    expect(screen.getByRole("link", { name: /Open approvals/ }).getAttribute("href")).toBe("/admin/approvals");
    fireEvent.click(screen.getByRole("button", { name: /Users/ }));
    expect(screen.getByRole("link", { name: /Open users/ }).getAttribute("href")).toBe("/admin/users");
    fireEvent.click(screen.getByRole("button", { name: /Companies/ }));
    expect(screen.getByText("Go Neutrinos")).toBeTruthy();
  });

  it("lets an operator leave the console", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ reports: [] })));
    render(<Admin />);
    expect(screen.getByRole("link", { name: /Exit admin/ }).getAttribute("href")).toBe("/jobs");
  });
});
