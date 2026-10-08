// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileSetup from "./ProfileSetup";
import { ONBOARDING_STORAGE_KEY, loadOnboarding } from "@/components/onboarding/onboardingState";

const mockAuth = vi.hoisted(() => ({ signedIn: true, openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: mockAuth.signedIn, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: mockAuth.openSignIn }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/onboarding"],
}));

beforeEach(() => { localStorage.clear(); mockAuth.signedIn = true; mockAuth.openSignIn.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const next = () => fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

function goToRoles() {
  render(<ProfileSetup />);
  next();
}

function goToResume() {
  goToRoles();
  fireEvent.click(screen.getByRole("button", { name: "Product Designer" }));
  next();
}

describe("ProfileSetup onboarding", () => {
  it("opens on the goal step with the kit eyebrow and progress", () => {
    render(<ProfileSetup />);
    expect(screen.getByText("STEP 1 OF 6 · ABOUT 2 MINUTES")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Where are you in your search?" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Actively looking/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /Just graduated/ }));
    expect(screen.getByRole("radio", { name: /Just graduated/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("list", { name: "Setup progress" }).querySelector('[aria-current="step"]')?.textContent).toBe("Goal");
  });

  it("walks goal to roles with a 3-pick limit and skips anytime", () => {
    goToRoles();
    expect(screen.getByText("Which roles are you targeting?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ }).hasAttribute("disabled")).toBe(true);
    for (const role of ["Product Designer", "Data Analyst", "Marketing", "Sales"]) {
      fireEvent.click(screen.getByRole("button", { name: role }));
    }
    expect(screen.getByText("3/3 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sales" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.getByText("You're ready to ask.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
  });

  it("persists answers on the device and reports honest completion", () => {
    goToRoles();
    fireEvent.click(screen.getByRole("button", { name: "Product Designer" }));
    next(); next(); next();
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(screen.getByText("You're ready to ask.")).toBeTruthy();
    // Goal + roles only: resume, work links and location were skipped.
    expect(screen.getByText(/Setup 40% complete/)).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}");
    expect(stored.roles).toEqual(["Product Designer"]);
    expect(stored.goal).toBe("Actively looking");
    expect(screen.getByText(/Saved on this device/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set alerts" }).getAttribute("href")).toBe("/alerts");
    expect(screen.getByRole("link", { name: /Find a referrer/ }).getAttribute("href")).toBe("/explore");
  });

  it("restores saved answers, counts location only when given, and jumps back from Add", () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ goal: "Actively looking", roles: ["Product Designer"], city: "Bengaluru, India" }));
    render(<ProfileSetup />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.getByText(/Setup 60% complete/)).toBeTruthy();
    expect(screen.getByText("STEP 6 OF 6 · ABOUT 2 MINUTES")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Location & authorization" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Resume" }));
    expect(screen.getByText("Add your resume")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Work links" }));
    expect(screen.getByText("Show your work")).toBeTruthy();
    // Work links are real URLs managed in My work; this step only records which kinds the seeker has.
    expect(screen.getByRole("link", { name: "My work" }).getAttribute("href")).toBe("/work");
    fireEvent.click(screen.getByRole("button", { name: /GitHub/ }));
    expect(screen.getByRole("button", { name: /GitHub/ }).getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}").links).toEqual(["GitHub"]);
  });

  it("keeps location answers on the device and never pre-fills sample values", () => {
    render(<ProfileSetup />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Location & authorization" }));
    expect(screen.getByText("Where can you work?")).toBeTruthy();
    const city = screen.getByRole("textbox", { name: "Current city" }) as HTMLInputElement;
    expect(city.value).toBe("");
    fireEvent.change(city, { target: { value: "Pune, India" } });
    fireEvent.click(screen.getByRole("button", { name: /Open to remote roles/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Work authorization" }), { target: { value: "No sponsorship needed" } });
    const stored = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}");
    expect(stored).toMatchObject({ city: "Pune, India", remote: false, visa: "No sponsorship needed" });
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(screen.queryByRole("button", { name: "Add Location & authorization" })).toBeNull();
  });

  it("drops malformed or unknown stored values instead of trusting them", () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ goal: "Hacker", roles: ["Product Designer", "Astronaut", "Sales", "Marketing", "Operations"], links: "LinkedIn", remote: "yes", resume: { id: "x" }, extra: true }));
    const loaded = loadOnboarding();
    expect(loaded.goal).toBe("Actively looking");
    expect(loaded.roles).toEqual([]);
    expect(loaded.links).toEqual([]);
    expect(loaded.remote).toBe(true);
    expect(loaded.resume).toBeNull();
    expect("extra" in loaded).toBe(false);
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ roles: ["Sales", "Sales", "Marketing", "Operations", "Consulting"] }));
    expect(loadOnboarding().roles).toEqual(["Sales", "Marketing", "Operations"]);
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "{not json");
    expect(loadOnboarding().roles).toEqual([]);
  });

  it("uploads a real resume through the shared chunk protocol", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer), importKey: vi.fn(async () => ({})), encrypt: vi.fn(async () => new Uint8Array(16).buffer) } });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/uploads")) return { ok: true, json: async () => ({ sessionId: "s", chunkBytes: 1024 * 1024 }) };
      if (String(url).includes("/chunks")) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: 5, fileName: "me.pdf" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    goToResume();
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["bytes"], "me.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("me.pdf")).toBeTruthy();
    expect(screen.getByText("Uploaded · tap to replace")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/uploads", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}").resume).toEqual({ id: 5, fileName: "me.pdf" });
    fireEvent.click(screen.getByRole("button", { name: "Remove me.pdf" }));
    expect(screen.getByText("Drop PDF or tap to choose")).toBeTruthy();
  });

  it("shows a rejected file inside the drop zone without calling the server", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    goToResume();
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["bytes"], "notes.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toBe("Use a PDF, Word document, PNG, or JPEG resume.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a network failure in the drop zone and lets the seeker retry", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer), importKey: vi.fn(async () => ({})), encrypt: vi.fn(async () => new Uint8Array(16).buffer) } });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    goToResume();
    const picker = () => document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker(), { target: { files: [new File(["bytes"], "me.pdf", { type: "application/pdf" })] } });
    expect((await screen.findByRole("alert")).textContent).toBe("Failed to fetch");
    expect(picker().disabled).toBe(false);
    expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}").resume).toBeNull();
  });

  it("asks a signed-out seeker to sign in before uploading", () => {
    mockAuth.signedIn = false;
    goToResume();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText("Sign in to upload")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Drop PDF or tap to choose/ }));
    expect(mockAuth.openSignIn).toHaveBeenCalledTimes(1);
  });
});
