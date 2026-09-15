// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareCard from "./ShareCard";

vi.mock("wouter", () => ({
  useRoute: () => [true, { token: "c".repeat(32) }],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ShareCard flywheel CTA", () => {
  it("routes joins through the sharer invite code when present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ card: { companyDomain: "acme.com", status: "accepted", inviteCode: "r1-deadbeef" } }) })));
    render(<ShareCard />);
    const cta = await screen.findByRole("link", { name: "Get your own referral" });
    expect(cta.getAttribute("href")).toBe("/start?invite=r1-deadbeef");
  });

  it("falls back to a plain start link when no invite code is attached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ card: { companyDomain: "acme.com", status: "accepted" } }) })));
    render(<ShareCard />);
    const cta = await screen.findByRole("link", { name: "Get your own referral" });
    expect(cta.getAttribute("href")).toBe("/start");
    await waitFor(() => expect(screen.getByText("Accepted at acme.com")).toBeTruthy());
  });
});
