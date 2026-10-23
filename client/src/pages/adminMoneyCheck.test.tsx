// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminMoneyCheck from "./AdminMoneyCheck";

vi.mock("@/components/AdminNav", () => ({ AdminNav: () => <nav /> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const stub = (status: number, body: unknown) => { const f = vi.fn(async () => ({ ok: status < 400, status, json: async () => body })); vi.stubGlobal("fetch", f); return f; };

describe("AdminMoneyCheck", () => {
  it("POSTs the route with the session cookie and shows the findings", async () => {
    const f = stub(200, { ranAt: "2026-10-22T10:00:00.000Z", findingsFound: true, emailSent: false, subject: "daily money check · 1 finding", findings: "payment credit mismatch: payment #2" });
    render(<AdminMoneyCheck />);
    fireEvent.click(screen.getByRole("button", { name: "Run money check now" }));
    expect(await screen.findByText("payment credit mismatch: payment #2")).toBeTruthy();
    expect(f).toHaveBeenCalledWith("/api/admin/money-check/run", { method: "POST", credentials: "include" });
    expect(screen.getByText(/Owner email was NOT sent/)).toBeTruthy();
  });
  it("shows all clear when nothing is found", async () => {
    stub(200, { ranAt: "2026-10-22T10:00:00.000Z", findingsFound: false, emailSent: false, subject: null, findings: null });
    render(<AdminMoneyCheck />);
    fireEvent.click(screen.getByRole("button", { name: "Run money check now" }));
    expect(await screen.findByText("All clear. Nothing to flag.")).toBeTruthy();
  });
  it("explains 403 and 429 in plain words", async () => {
    stub(403, { error: "Administrator access is required" });
    render(<AdminMoneyCheck />);
    fireEvent.click(screen.getByRole("button", { name: "Run money check now" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/administrator/i));
    cleanup(); stub(429, {});
    render(<AdminMoneyCheck />);
    fireEvent.click(screen.getByRole("button", { name: "Run money check now" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/5 minutes/));
  });
  it("shows a loud banner when the owner alert email failed", async () => {
    stub(200, { latestOutcome: "failure", latestAt: "2026-10-22T09:00:00.000Z", lastSuccessAt: "2026-10-22T11:32:53.000Z", failuresLast7Days: 15, ownerNotReached: true });
    render(<AdminMoneyCheck />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/owner alert email FAILED.*15 failed in the last 7 days/);
  });
});
