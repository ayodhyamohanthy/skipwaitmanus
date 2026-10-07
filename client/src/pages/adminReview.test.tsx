// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminReview from "./AdminReview";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin-review", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const REPORTS = [{ id: 48, reason: "Spam or repeated asks", details: "Same note 14 times", referralRequestId: 12, reportedUserId: null, urgent: true, status: "open", createdAt: "2026-09-02T08:00:00Z" }];
const COMPANIES = [{ id: 5, companyName: "Acme Corp", website: "https://acme.example", role: "seeker", status: "open", createdAt: "2026-09-01T08:00:00Z" }];

function stubQueue() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("safety-reports") && !String(url).includes("decision")) return { ok: true, json: async () => ({ reports: REPORTS }) };
    if (String(url).includes("company-suggestions") && !String(url).includes("decision")) return { ok: true, json: async () => ({ suggestions: COMPANIES }) };
    return { ok: true, json: async () => ({ id: 48, status: "resolved" }) };
  }));
}

describe("AdminReview console", () => {
  it("lists real reports and companies with no fabricated cases", async () => {
    stubQueue();
    render(<AdminReview />);
    expect(await screen.findByText("Spam or repeated asks")).toBeTruthy();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.queryByText("R-2048")).toBeNull();
    expect(screen.queryByText("Freshworks")).toBeNull();
  });

  it("requires a reviewer note before deciding and records it", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("decision")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ status: "resolved" });
        return { ok: true, json: async () => ({ id: 48, status: "resolved" }) };
      }
      if (String(url).includes("safety-reports")) return { ok: true, json: async () => ({ reports: REPORTS }) };
      return { ok: true, json: async () => ({ suggestions: COMPANIES }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminReview />);
    await screen.findByText("Spam or repeated asks");
    fireEvent.click(screen.getByRole("button", { name: /Spam or repeated asks/ }));
    expect(screen.getByRole("button", { name: "Resolve with action" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Why this decision/), { target: { value: "Confirmed spam pattern." } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve with action" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/safety-reports/48/decision", expect.objectContaining({ method: "POST" })));
  });

  it("shows the admin gate without leaking queue contents", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Administrator access is required" }) })));
    render(<AdminReview />);
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
  });
});
