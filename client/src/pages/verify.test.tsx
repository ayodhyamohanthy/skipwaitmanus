// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Verify from "./Verify";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/verify", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

describe("Verify work email", () => {
  it("keeps verification behind sign-in and never shows a demo code", () => {
    authState.isSignedIn = false;
    render(<Verify />);
    expect(screen.getByText(/Prove you're inside/)).toBeTruthy();
    expect(screen.queryByText("123456")).toBeNull();
  });

  it("walks company to email with domain validation, no fake states", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ sent: true })));
    render(<Verify />);
    expect(screen.getByText("Where do you work?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Your Wipro email")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/Personal inboxes can't prove where you work/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@other.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/doesn't match Wipro/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText("Enter the code")).toBeTruthy();
    expect(screen.getByText(/Resend in/)).toBeTruthy();
  });

  it("verifies the code and shows the badge preview with next step", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/verify") ? ok({ verified: true, expiresAt: "2027-01-05T00:00:00.000Z" }) : ok({ sent: true })));
    render(<Verify />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    await screen.findByText("Enter the code");
    for (let i = 0; i < 6; i++) fireEvent.change(screen.getByLabelText(`Digit ${i + 1}`), { target: { value: String(i + 1) } });
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    expect(await screen.findByText("You're verified at Wipro.")).toBeTruthy();
    expect(screen.getByText("Someone at Wipro")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue as a referrer/ })).toBeTruthy();
  });

  it("counts wrong attempts and locks out after five without inventing server state", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/verify") ? { ok: false, status: 400, json: async () => ({ error: "That code could not be verified." }) } : ok({ sent: true })));
    render(<Verify />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    await screen.findByText("Enter the code");
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 6; i++) fireEvent.change(screen.getByLabelText(`Digit ${i + 1}`), { target: { value: "0" } });
      fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
      await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
      if (round < 4) expect(screen.getByRole("alert").textContent).toMatch(/tries left|try left/);
    }
    expect(screen.getByRole("alert").textContent).toContain("Too many tries");
  });

  it("surfaces server rate limits honestly on send", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "Too many code requests. Wait before trying again.", retryAfterSeconds: 600 }) })));
    render(<Verify />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "name@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText(/Too many code requests/)).toBeTruthy();
  });
});
