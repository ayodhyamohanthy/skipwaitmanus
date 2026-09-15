// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FastTrackLink from "./FastTrackLink";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: false, getToken: vi.fn() }) }));
vi.mock("wouter", () => ({
  useRoute: (pattern: string) => pattern === "/fast/:linkCode" ? [true, { linkCode: "abc123" }] : [false, undefined],
  useLocation: () => ["/", vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Fast-track link landing", () => {
  it("leads with the free referral request and never pitches Pro to signed-out visitors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ link: { companyDomain: "acme.com", isActive: true, referrerUserId: 22 } }) })));
    render(<FastTrackLink />);
    expect(await screen.findByText(/Request a referral at acme\.com/)).toBeTruthy();
    expect(screen.queryByText(/Direct messaging is for members/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.getByRole("button", { name: /Start private request/ })).toBeTruthy();
  });
});
