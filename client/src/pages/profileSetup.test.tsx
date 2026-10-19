// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileSetup from "./ProfileSetup";
import { emptyOnboarding, toSetupPatch } from "@/components/onboarding/onboardingState";

const mockAuth = vi.hoisted(() => ({ signedIn: true, openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: mockAuth.signedIn, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: mockAuth.openSignIn }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/onboarding"],
}));

// In-memory stand-in for GET/PATCH /api/profile/setup. Anything else goes to `other`.
function stubApi(initial: Record<string, unknown> = {}, other?: (url: string) => unknown, patchStatus = 200) {
  const server = { saved: { ...emptyOnboarding(), ...initial } as Record<string, unknown>, patches: [] as Array<Record<string, unknown>> };
  const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (String(url) === "/api/profile/setup") {
      if (init?.method === "PATCH") {
        if (patchStatus !== 200) return { ok: false, status: patchStatus, json: async () => ({ error: "x" }) };
        const body = JSON.parse(init.body ?? "{}");
        server.patches.push(body);
        const { resumeAttachmentId, ...rest } = body;
        server.saved = { ...server.saved, ...rest };
        return { ok: true, json: async () => server.saved };
      }
      return { ok: true, json: async () => server.saved };
    }
    if (other) return other(String(url));
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { server, fetchMock };
}
const lastPatch = (server: { patches: Array<Record<string, unknown>> }) => server.patches[server.patches.length - 1] ?? {};

beforeEach(() => { mockAuth.signedIn = true; mockAuth.openSignIn.mockReset(); stubApi(); });
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

  it("saves answers to the account and reports honest completion", async () => {
    const { server } = stubApi();
    goToRoles();
    fireEvent.click(screen.getByRole("button", { name: "Product Designer" }));
    next(); next(); next();
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(screen.getByText("You're ready to ask.")).toBeTruthy();
    // Goal + roles only: resume, work links and location were skipped.
    expect(screen.getByText(/Setup 40% complete/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Saved to your account\./)).toBeTruthy());
    expect(lastPatch(server).roles).toEqual(["Product Designer"]);
    expect(lastPatch(server).goal).toBe("Actively looking");
    expect(screen.queryByText(/on this device/)).toBeNull();
    expect(screen.getByRole("link", { name: "Set alerts" }).getAttribute("href")).toBe("/alerts");
    expect(screen.getByRole("link", { name: /Find a referrer/ }).getAttribute("href")).toBe("/explore");
  });

  it("restores saved answers, counts location only when given, and jumps back from Add", async () => {
    const { server } = stubApi({ goal: "Actively looking", roles: ["Product Designer"], city: "Bengaluru, India" });
    render(<ProfileSetup />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /Actively looking/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(screen.getByText(/Setup 60% complete/)).toBeTruthy());
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
    await waitFor(() => expect(lastPatch(server).links).toEqual(["GitHub"]));
  });

  it("saves location answers to the account and never pre-fills sample values", async () => {
    const { server } = stubApi();
    render(<ProfileSetup />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Location & authorization" }));
    expect(screen.getByText("Where can you work?")).toBeTruthy();
    const city = screen.getByRole("textbox", { name: "Current city" }) as HTMLInputElement;
    expect(city.value).toBe("");
    fireEvent.change(city, { target: { value: "Pune, India" } });
    fireEvent.click(screen.getByRole("button", { name: /Open to remote roles/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Work authorization" }), { target: { value: "No sponsorship needed" } });
    await waitFor(() => expect(lastPatch(server)).toMatchObject({ city: "Pune, India", remote: false, visa: "No sponsorship needed" }));
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(screen.queryByRole("button", { name: "Add Location & authorization" })).toBeNull();
  });

  it("never writes before the saved answers have loaded", async () => {
    const { server, fetchMock } = stubApi({ roles: ["Sales"] });
    render(<ProfileSetup />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/profile/setup", expect.objectContaining({ credentials: "include" })));
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(server.patches).toEqual([]);
  });

  it("shows an honest failure with a retry when saving fails", async () => {
    stubApi({}, undefined, 500);
    goToRoles();
    fireEvent.click(screen.getByRole("button", { name: "Sales" }));
    next(); next(); next();
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(await screen.findByText(/We could not save your answers/, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("builds a bounded PATCH body from the answers", () => {
    const body = toSetupPatch({ ...emptyOnboarding(), roles: ["Sales", "Marketing"], city: "  Pune  ", resume: { id: 7, fileName: "me.pdf" } });
    expect(body).toMatchObject({ roles: ["Sales", "Marketing"], city: "Pune", resumeAttachmentId: 7 });
    expect(toSetupPatch(emptyOnboarding()).resumeAttachmentId).toBeNull();
  });

  it("uploads a real resume through the shared chunk protocol", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer), importKey: vi.fn(async () => ({})), encrypt: vi.fn(async () => new Uint8Array(16).buffer) } });
    const { server, fetchMock } = stubApi({}, url => {
      if (url.endsWith("/uploads")) return { ok: true, json: async () => ({ sessionId: "s", chunkBytes: 1024 * 1024 }) };
      if (url.includes("/chunks")) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: 5, fileName: "me.pdf" }) };
    });
    goToResume();
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["bytes"], "me.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("me.pdf")).toBeTruthy();
    expect(screen.getByText("Uploaded · tap to replace")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/uploads", expect.objectContaining({ method: "POST" }));
    await waitFor(() => expect(lastPatch(server).resumeAttachmentId).toBe(5));
    fireEvent.click(screen.getByRole("button", { name: "Remove me.pdf" }));
    expect(screen.getByText("Drop PDF or tap to choose")).toBeTruthy();
    await waitFor(() => expect(lastPatch(server).resumeAttachmentId).toBeNull());
  });

  it("shows a rejected file inside the drop zone without calling the server", async () => {
    const { fetchMock } = stubApi();
    goToResume();
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["bytes"], "notes.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toBe("Use a PDF, Word document, PNG, or JPEG resume.");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/documents/uploads", expect.anything());
  });

  it("shows a network failure in the drop zone and lets the seeker retry", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer), importKey: vi.fn(async () => ({})), encrypt: vi.fn(async () => new Uint8Array(16).buffer) } });
    stubApi({}, () => { throw new TypeError("Failed to fetch"); });
    goToResume();
    const picker = () => document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker(), { target: { files: [new File(["bytes"], "me.pdf", { type: "application/pdf" })] } });
    expect((await screen.findByRole("alert")).textContent).toBe("Failed to fetch");
    expect(picker().disabled).toBe(false);
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
