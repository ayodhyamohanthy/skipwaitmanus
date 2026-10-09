// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Report from "./Report";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/report", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

function at(url: string) {
  const actual = window.location;
  Object.defineProperty(window, "location", { configurable: true, value: new URL(url) });
  return () => Object.defineProperty(window, "location", { configurable: true, value: actual });
}

describe("Report block toggle", () => {
  it("blocks the other participant after filing from a conversation", async () => {
    const restore = at("https://skipwait.me/report?request=42");
    try {
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/blocks")) return ok({ blocked: true, created: true, id: 9 });
        return ok({ report: { id: 48, reference: "R-1048" } });
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Report />);
      fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
      fireEvent.click(screen.getByRole("button", { name: /Also block this person/ }));
      fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
      expect(await screen.findByText(/now blocked/)).toBeTruthy();
      const blockCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/blocks")) as unknown as [string, { body?: string }] | undefined;
      expect(JSON.parse(String(blockCall?.[1]?.body))).toEqual({ referralRequestId: 42 });
    } finally {
      restore();
    }
  });

  it("keeps the report when the block fails", async () => {
    const restore = at("https://skipwait.me/report?request=42");
    try {
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/blocks")) return { ok: false, status: 500, json: async () => ({ error: "boom" }) };
        return ok({ report: { id: 48, reference: "R-1048" } });
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Report />);
      fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
      fireEvent.click(screen.getByRole("button", { name: /Also block this person/ }));
      fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
      expect(await screen.findByText(/Thanks. We're on it./)).toBeTruthy();
      expect(screen.getByText(/block did not go through/)).toBeTruthy();
    } finally {
      restore();
    }
  });

  it("shows no toggle without a conversation context", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({})));
    render(<Report />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.queryByRole("button", { name: /Also block this person/ })).toBeNull();
    expect(screen.getByText(/handled by our team/)).toBeTruthy();
  });
});
