// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminSchema from "./AdminSchema";

// Stable getToken identity: the real useAuth memoizes it with useCallback, and
// an unstable identity would re-trigger the page's [getToken, isSignedIn] effect.
const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn().mockResolvedValue("admin-token") }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: getTokenMock }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

const snapshot = {
  reconciled: false,
  results: [
    { statement: "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL", ok: false, error: "Lock wait timeout exceeded; try restarting transaction" },
    { statement: "ALTER TABLE `referralRequests` ADD COLUMN `savedAt` TIMESTAMP NULL", ok: true },
    { statement: "CREATE TABLE IF NOT EXISTS `partnerModules` (…)", ok: true },
  ],
  firstError: "[ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL] Lock wait timeout exceeded; try restarting transaction",
};
const reconciledSnapshot = { reconciled: true, results: [{ statement: "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL", ok: true }], firstError: null };

describe("administrator schema reconcile screen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({ ok: true, json: async () => snapshot })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders the reconciled flag, first error, and per-statement outcomes", async () => {
    render(<AdminSchema />);
    await waitFor(() => expect(screen.getByText("Not fully reconciled")).toBeTruthy());
    // The failure text shows twice by design: first-error panel + statement row.
    expect(screen.getAllByText(/Lock wait timeout exceeded; try restarting transaction/).length).toBe(2);
    expect(screen.getByText("ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL")).toBeTruthy();
    expect(screen.getByText("ALTER TABLE `referralRequests` ADD COLUMN `savedAt` TIMESTAMP NULL")).toBeTruthy();
  });

  it("posts to run the reconcile and renders the fresh snapshot", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? { ok: true, json: async () => reconciledSnapshot } : { ok: true, json: async () => snapshot });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminSchema />);
    await waitFor(() => expect(screen.getByText("Not fully reconciled")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Run reconcile/ }));

    await waitFor(() => expect(screen.getByText("Reconciled")).toBeTruthy());
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).includes("/api/admin/schema/reconcile") && init?.method === "POST")).toBe(true);
    expect(screen.queryByText("Not fully reconciled")).toBeNull();
  });

  it("shows the empty state when no run has happened yet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ reconciled: false, results: [], firstError: null }) })));
    render(<AdminSchema />);
    await waitFor(() => expect(screen.getByText(/No run has happened yet/)).toBeTruthy());
  });
});
