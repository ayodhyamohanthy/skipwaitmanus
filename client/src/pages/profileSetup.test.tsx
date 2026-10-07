// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileSetup from "./ProfileSetup";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/onboarding"],
}));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function goToRoles() {
  render(<ProfileSetup />);
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
}

describe("ProfileSetup onboarding", () => {
  it("walks goal to roles with a 3-pick limit and skips anytime", () => {
    goToRoles();
    expect(screen.getByText("Which roles are you targeting?")).toBeTruthy();
    for (const role of ["Product Designer", "Data Analyst", "Marketing", "Sales"]) {
      fireEvent.click(screen.getByRole("button", { name: role }));
    }
    expect(screen.getByText("3/3 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sales" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.getByText("You're ready to ask.")).toBeTruthy();
  });

  it("persists answers on the device and reports honest completion", () => {
    goToRoles();
    fireEvent.click(screen.getByRole("button", { name: "Product Designer" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(screen.getByText("You're ready to ask.")).toBeTruthy();
    expect(screen.getByText(/Setup \d+% complete/)).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem("skipwait-onboarding-v1") || "{}");
    expect(stored.roles).toEqual(["Product Designer"]);
    expect(stored.goal).toBe("Actively looking");
    expect(screen.getByText(/Saved on this device/)).toBeTruthy();
  });

  it("uploads a real resume through the shared chunk protocol", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer), importKey: vi.fn(async () => ({})), encrypt: vi.fn(async () => new Uint8Array(16).buffer) } });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/uploads")) return { ok: true, json: async () => ({ sessionId: "s", chunkBytes: 1024 * 1024 }) };
      if (String(url).includes("/chunks")) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: 5, fileName: "me.pdf" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    goToRoles();
    fireEvent.click(screen.getByRole("button", { name: "Product Designer" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["bytes"], "me.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("me.pdf")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/uploads", expect.objectContaining({ method: "POST" }));
  });
});
