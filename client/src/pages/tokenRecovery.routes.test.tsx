// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReferralRequest from "./ReferralRequest";
import Referrer from "./Referrer";
import Premium from "./Premium";

vi.mock("@/lib/trpc", () => ({
  trpc: { ai: { draftHiringManagerEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } },
}));

const attachment = [{ id: "resume-1", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 1200, key: "test-key", url: "https://example.com/resume.pdf" }];

function visit(path: string) {
  window.history.pushState({}, "", path);
}

function prepareStorage() {
  localStorage.clear();
  localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
  localStorage.setItem("bridge-seeker-attachments", JSON.stringify(attachment));
}

describe("token recovery routes", () => {
  beforeEach(() => prepareStorage());
  afterEach(() => cleanup());

  it("takes a Job Seeker from a zero-balance block through purchase and back to a usable request", () => {
    localStorage.setItem("bridge-tokens", "0");
    visit("/request");
    render(<ReferralRequest />);
    expect(screen.getByText("You’re out of application tokens.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /add 1 token/i }).getAttribute("href")).toBe("/premium");

    cleanup();
    visit("/premium");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: /simulate \$1 checkout/i }));
    expect(localStorage.getItem("bridge-tokens")).toBe("1");
    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/request");

    cleanup();
    visit("/request");
    render(<ReferralRequest />);
    const send = screen.getByRole("button", { name: /send referral request/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(screen.getByText("Your ask is with the Referrer.")).toBeTruthy();
  });

  it("takes a Referrer from a zero-balance block through purchase and back to a usable approval", () => {
    localStorage.setItem("bridge-referrer-free-tokens", "0");
    localStorage.setItem("bridge-referrer-paid-tokens", "0");
    visit("/referrer");
    render(<Referrer />);
    expect(screen.getByText("No tokens available.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /add 1 token/i }).getAttribute("href")).toBe("/premium?role=referrer");

    cleanup();
    visit("/premium?role=referrer");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: /simulate \$1 checkout/i }));
    expect(localStorage.getItem("bridge-referrer-paid-tokens")).toBe("1");
    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/referrer");

    cleanup();
    visit("/referrer");
    render(<Referrer />);
    const approve = screen.getByRole("button", { name: /use 1 token & approve/i }) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    expect(screen.getByText("Referral approved.")).toBeTruthy();
  });

  it("offers the intended regional and billing provider routes in the simulated checkout", () => {
    visit("/premium");
    render(<Premium />);
    expect(screen.getByRole("button", { name: /Razorpay/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /PayPal/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Chargebee/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Razorpay/i }));
    expect(screen.getByText("India · Domestic checkout simulation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Chargebee/i }));
    expect(screen.getByText("Business billing · Billing checkout simulation")).toBeTruthy();
  });
});
