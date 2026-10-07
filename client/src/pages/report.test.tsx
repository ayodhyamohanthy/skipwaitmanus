// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Report from "./Report";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, status: 201, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });

const filed = { reference: "R-2048", urgent: false, blocked: true, status: "received", dueAt: new Date().toISOString() };

describe("Report — kit v4 /report", () => {
  it("opens on the reason step with the designed copy and all six reasons", () => {
    render(<Report />);
    expect(screen.getByText("What's going on?")).toBeTruthy();
    expect(screen.getByText(/Reporting is confidential/)).toBeTruthy();
    for (const label of ["Asked for or offered money", "Harassment or inappropriate messages", "Fake job or scam", "Pretending to work at a company", "Spam or repeated asks", "Something else"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("never ships the design-preview banner", () => {
    render(<Report />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });

  it("moves to details and back", () => {
    render(<Report />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("Add details")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("What's going on?")).toBeTruthy();
  });

  it("defaults the block toggle on and lets both toggles flip", () => {
    render(<Report />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    const blockToggle = screen.getByRole("button", { name: /Also block this person/ });
    const unsafeToggle = screen.getByRole("button", { name: /I feel unsafe/ });
    expect(blockToggle.getAttribute("aria-pressed")).toBe("true");
    expect(unsafeToggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(blockToggle);
    fireEvent.click(unsafeToggle);
    expect(blockToggle.getAttribute("aria-pressed")).toBe("false");
    expect(unsafeToggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("files the report with the chosen reason, details and flags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(filed));
    vi.stubGlobal("fetch", fetchMock);
    render(<Report />);
    fireEvent.click(screen.getByText("Fake job or scam"));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "They asked for a fee." } });
    fireEvent.click(screen.getByRole("button", { name: /Submit report/ }));
    await waitFor(() => expect(screen.getByText("Thanks. We're on it.")).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/reports");
    expect(JSON.parse(String(init.body))).toMatchObject({ reason: "fake_job", details: "They asked for a fee.", block: true, urgent: false });
  });

  it("shows the 48-hour window normally and 4 hours when the reporter feels unsafe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(filed)));
    render(<Report />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Submit report/ }));
    await waitFor(() => expect(screen.getByText("Within 48 hours")).toBeTruthy());
    expect(screen.queryByText("Within 4 hours")).toBeNull();
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ ...filed, urgent: true })));
    render(<Report />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /I feel unsafe/ }));
    fireEvent.click(screen.getByRole("button", { name: /Submit report/ }));
    await waitFor(() => expect(screen.getByText("Within 4 hours")).toBeTruthy());
    expect(screen.getByText(/immediate danger/)).toBeTruthy();
  });

  it("reports the reference and the block only when the server confirms it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ ...filed, blocked: false })));
    render(<Report />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Submit report/ }));
    await waitFor(() => expect(screen.getByText(/R-2048/)).toBeTruthy());
    expect(screen.queryByText(/This person is blocked/)).toBeNull();
  });

  it("keeps the report unsent and offers a retry when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(500, { error: "We could not submit this report" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Report />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Submit report/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not been sent/);
    expect(screen.queryByText("Thanks. We're on it.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
