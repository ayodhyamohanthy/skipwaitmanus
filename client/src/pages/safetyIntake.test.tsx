// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Report from "./Report";
import SuggestCompany from "./SuggestCompany";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/report", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

describe("Report flow", () => {
  it("files with reason, details, and urgency, returning the real reference", async () => {
    const fetchMock = vi.fn(async () => ok({ report: { id: 48, reference: "R-1048", urgent: true } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Report />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Fake job or scam/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByPlaceholderText(/What happened/), { target: { value: "Suspicious fee request" } });
    fireEvent.click(screen.getByRole("button", { name: /I feel unsafe/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText(/Thanks. We're on it./)).toBeTruthy();
    expect(screen.getByText(/reference R-1048/)).toBeTruthy();
    expect(screen.getByText(/Within 4 hours/)).toBeTruthy();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body?: string }];
    expect(JSON.parse(String(init.body))).toMatchObject({ reason: "Fake job or scam", details: "Suspicious fee request", urgent: true });
  });

  it("is honest that immediate blocking goes through support for now", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({})));
    render(<Report />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText(/blocking both directions is handled by our team/)).toBeTruthy();
  });
});

describe("SuggestCompany flow", () => {
  it("flags listed companies and submits new ones with role and limit errors", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.companyName === "Delta") return { ok: false, status: 400, json: async () => ({ error: "You can suggest up to 3 companies a day" }) };
        return ok({ suggestion: { id: 5, companyName: body.companyName } });
      }
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SuggestCompany />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Freshworks"), { target: { value: "Wipro" } });
    expect(screen.getByText(/already listed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit for review" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("e.g. Freshworks"), { target: { value: "Acme Corp" } });
    fireEvent.click(screen.getByRole("button", { name: /Working there now/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText("Suggestion received.")).toBeTruthy();
  });
});
