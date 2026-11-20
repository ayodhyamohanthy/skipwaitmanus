// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ShareCard from "./ShareCard";

vi.mock("wouter", () => ({
  useRoute: () => [true, { token: "c".repeat(32) }],
  Link: ({ href, children, ...rest }: React.ComponentPropsWithoutRef<"a">) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(async () => { await import("./goal/links/GoalShareCard"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const acceptedAt = "A private referral request was accepted at acme.com.";

describe("ShareCard flywheel CTA", () => {
  it("routes joins through the sharer invite code when present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ card: { companyDomain: "acme.com", status: "accepted", inviteCode: "r1-deadbeef" } }) })));
    render(<ShareCard />);
    const cta = await screen.findByRole("link", { name: "Start your referral request" });
    expect(cta.getAttribute("href")).toBe("/start?invite=r1-deadbeef");
  });

  it("falls back to a plain start link when no invite code is attached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ card: { companyDomain: "acme.com", status: "accepted" } }) })));
    render(<ShareCard />);
    const cta = await screen.findByRole("link", { name: "Start your referral request" });
    expect(cta.getAttribute("href")).toBe("/start");
    expect(await screen.findByText((_, element) =>
      element?.tagName === "P" && element.textContent === acceptedAt,
    )).toBeTruthy();
  });

  it("announces an unavailable card and recovers through Try again", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, json: async () => ({ card: { companyDomain: "acme.com", status: "accepted", inviteCode: "r1-deadbeef" } }) };
    }));
    render(<ShareCard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "This share card isn’t available." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Get your own referral." })).toBeTruthy());
    expect(screen.getByText((_, element) =>
      element?.tagName === "P" && element.textContent === acceptedAt,
    )).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });
});
