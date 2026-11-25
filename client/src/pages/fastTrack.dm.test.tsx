// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import FastTrackLink from "./FastTrackLink";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: false, getToken: vi.fn() }) }));
vi.mock("wouter", () => ({
  useRoute: (pattern: string) => pattern === "/fast/:linkCode" ? [true, { linkCode: "abc123" }] : [false, undefined],
  useLocation: () => ["/", vi.fn()],
  Link: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<"a">) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(async () => { await import("./goal/links/GoalPrivateLinkLanding"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Fast-track link landing", () => {
  it("leads with the referral request and never pitches Pro or DMs to signed-out visitors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ link: { companyDomain: "acme.com", isActive: true, referrerUserId: 22 } }) })));
    render(<FastTrackLink />);
    expect(await screen.findByRole("heading", { name: "Get referred at acme.com." })).toBeTruthy();
    expect(screen.queryByText(/Direct messaging is for members/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.getByRole("button", { name: "Start your referral request" })).toBeTruthy();
  });

  it("announces a dead link and recovers through Try again", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, status: 410, json: async () => ({ error: "This private referral link is unavailable" }) } : { ok: true, json: async () => ({ link: { companyDomain: "acme.com", isActive: true, referrerUserId: 22 } }) };
    }));
    render(<FastTrackLink />);
    expect((await screen.findByRole("alert")).textContent).toContain("This private referral link is unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Get referred at acme.com." })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });
});
