// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShareCard from "./ShareCard";

vi.mock("wouter", () => ({
  useRoute: () => [true, { token: "c".repeat(32) }],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });


function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ShareCard /></QueryClientProvider>);
}

describe("ShareCard flywheel CTA", () => {
  it("routes joins through the sharer invite code when present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ card: { companyDomain: "acme.com", status: "accepted", inviteCode: "r1-deadbeef" } }) })));
    renderCard();
    const cta = await screen.findByRole("link", { name: "Get your own referral" });
    expect(cta.getAttribute("href")).toBe("/start?invite=r1-deadbeef");
  });

  it("falls back to a plain start link when no invite code is attached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ card: { companyDomain: "acme.com", status: "accepted" } }) })));
    renderCard();
    const cta = await screen.findByRole("link", { name: "Get your own referral" });
    expect(cta.getAttribute("href")).toBe("/start");
    await waitFor(() => expect(screen.getByText("Accepted at acme.com")).toBeTruthy());
  });

  it("announces an unavailable card and recovers through Try again", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, json: async () => ({ card: { companyDomain: "acme.com", status: "accepted", inviteCode: "r1-deadbeef" } }) };
    }));
    renderCard();
    expect((await screen.findByRole("alert")).textContent).toContain("Share card unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Accepted at acme.com")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });
});
