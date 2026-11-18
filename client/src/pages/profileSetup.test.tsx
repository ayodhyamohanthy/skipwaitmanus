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

async function goToRoles() {
  render(<ProfileSetup />);
  await screen.findByTestId("goal-onboarding");
  if (mockAuth.signedIn) await screen.findByText(/Saved to your account\./);
  fireEvent.click(screen.getByRole("button", { name: /^(Add|Edit) Target roles$/ }));
}

async function goToResume() {
  await goToRoles();
  fireEvent.click(screen.getByRole("button", { name: "Product Designer" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Resume" }));
}

describe("ProfileSetup onboarding", () => {
  it("opens on the released goal and lets the seeker edit their private search goal", async () => {
    await goToRoles();
    expect(screen.getByRole("heading", { name: "Get ready to ask for a referral." })).toBeTruthy();
    expect(screen.getByText(/% complete/).textContent).toContain("Setup 20% complete.");
    fireEvent.click(screen.getByRole("button", { name: "Edit Search goal" }));
    expect(screen.getByRole("heading", { name: "Where are you in your search?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actively looking" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Just graduated" }));
    expect(screen.getByRole("button", { name: "Just graduated" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the 3-role limit and lets the seeker skip to the checklist", async () => {
    await goToRoles();
    expect(screen.getByRole("heading", { name: "Which roles are you targeting?" })).toBeTruthy();
    for (const role of ["Product Designer", "Data Analyst", "Marketing", "Sales"]) {
      fireEvent.click(screen.getByRole("button", { name: role }));
    }
    expect(screen.getByText(/selected/).textContent).toBe("3/3 selected");
    expect(screen.getByRole("button", { name: "Sales" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.getByRole("region", { name: "Setup checklist" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
  });

  it("saves answers to the account and reports honest completion", async () => {
    const { server } = stubApi();
    await goToRoles();
    fireEvent.click(screen.getByRole("button", { name: "Product Designer" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    // Goal + roles only: resume, work links and location were skipped.
    expect(screen.getByText(/% complete/).textContent).toContain("Setup 40% complete.");
    await waitFor(() => expect(lastPatch(server).roles).toEqual(["Product Designer"]));
    expect(screen.getByText(/Saved to your account\./)).toBeTruthy();
    expect(lastPatch(server).goal).toBe("Actively looking");
    expect(screen.queryByText(/on this device/)).toBeNull();
  });

  it("restores saved answers, counts location only when given, and opens checklist editors", async () => {
    const { server } = stubApi({ goal: "Actively looking", roles: ["Product Designer"], city: "Bengaluru, India" });
    await goToRoles();
    expect(screen.getByText(/% complete/).textContent).toContain("Setup 60% complete.");
    expect(screen.queryByRole("button", { name: "Add Location & authorization" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Location & authorization" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Resume" }));
    expect(screen.getByRole("heading", { name: "Add your resume" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Work links" }));
    expect(screen.getByRole("heading", { name: "Show your work" })).toBeTruthy();
    // This editor records link kinds; My work still owns the actual URLs.
    expect(screen.getByRole("link", { name: "My work" }).getAttribute("href")).toBe("/work");
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
    expect(screen.getByRole("button", { name: "GitHub" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(lastPatch(server).links).toEqual(["GitHub"]));
  });

  it("saves location answers to the account and never pre-fills sample values", async () => {
    const { server } = stubApi();
    await goToRoles();
    fireEvent.click(screen.getByRole("button", { name: "Add Location & authorization" }));
    expect(screen.getByRole("heading", { name: "Where can you work?" })).toBeTruthy();
    expect(screen.getByText("Current city")).toBeTruthy();
    const city = screen.getByPlaceholderText("Bengaluru, India") as HTMLInputElement;
    expect(city.value).toBe("");
    fireEvent.change(city, { target: { value: "Pune, India" } });
    fireEvent.click(screen.getByRole("button", { name: /Open to remote roles/ }));
    expect(screen.getByText("Work authorization")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "No sponsorship needed" } });
    await waitFor(() => expect(lastPatch(server)).toMatchObject({ city: "Pune, India", remote: false, visa: "No sponsorship needed" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("button", { name: "Add Location & authorization" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Location & authorization" })).toBeTruthy();
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
    await goToRoles();
    fireEvent.click(screen.getByRole("button", { name: "Sales" }));
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
    await goToResume();
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["bytes"], "me.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("me.pdf")).toBeTruthy();
    expect(screen.getByText("Uploaded. Tap to replace.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/uploads", expect.objectContaining({ method: "POST" }));
    await waitFor(() => expect(lastPatch(server).resumeAttachmentId).toBe(5));
    fireEvent.click(screen.getByRole("button", { name: "Remove me.pdf" }));
    expect(screen.getByText("Drop PDF or tap to choose")).toBeTruthy();
    await waitFor(() => expect(lastPatch(server).resumeAttachmentId).toBeNull());
  });

  it("shows a rejected file inside the drop zone without calling the server", async () => {
    const { fetchMock } = stubApi();
    await goToResume();
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["bytes"], "notes.txt", { type: "text/plain" })] } });
    expect(screen.getByText("Use a PDF, Word document, PNG, or JPEG resume.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/documents/uploads", expect.anything());
  });

  it("shows a network failure in the drop zone and lets the seeker retry", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer), importKey: vi.fn(async () => ({})), encrypt: vi.fn(async () => new Uint8Array(16).buffer) } });
    stubApi({}, () => { throw new TypeError("Failed to fetch"); });
    await goToResume();
    const picker = () => document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker(), { target: { files: [new File(["bytes"], "me.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("Failed to fetch")).toBeTruthy();
    expect(picker().disabled).toBe(false);
  });

  it("asks a signed-out seeker to sign in before uploading", async () => {
    mockAuth.signedIn = false;
    await goToResume();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText("Sign in to upload")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to upload" }));
    expect(mockAuth.openSignIn).toHaveBeenCalledTimes(1);
  });
});
