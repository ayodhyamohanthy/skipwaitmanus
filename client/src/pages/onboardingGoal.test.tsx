// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyOnboarding } from "@/components/onboarding/onboardingState";

const authState = { isSignedIn: true };
const openSignIn = vi.fn();
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken: async () => "tok", openSignIn }),
}));
const flagState = { on: true };
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "onboarding" };
});
vi.mock("@/lib/resumeUpload", () => ({
  uploadResume: vi.fn(async () => ({ id: "att-1", fileName: "cv.pdf", mimeType: "application/pdf", byteSize: 10, storageKey: "k" })),
  validateResumeFile: () => null,
}));

import ProfileSetup from "@/pages/ProfileSetup";

function stubFetch(saved: unknown) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/profile/setup" && (!init?.method || init.method === "GET")) return { ok: true, status: 200, json: async () => saved } as Response;
    if (url === "/api/profile/setup" && init?.method === "PATCH") return { ok: true, status: 200, json: async () => ({}) } as Response;
    throw new Error("unexpected fetch " + url);
  });
}

describe("goal onboarding", () => {
  beforeEach(() => { authState.isSignedIn = true; flagState.on = true; openSignIn.mockReset(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("opens on the goal with the next step focused", async () => {
    vi.stubGlobal("fetch", stubFetch({ ...emptyOnboarding(), roles: [] }));
    render(<ProfileSetup />);
    expect(await screen.findByTestId("goal-onboarding")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Get ready to ask for a referral." })).toBeTruthy();
    expect(screen.getByText(/Which roles are you targeting/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("advances to the next unfinished item and saves edits", async () => {
    const fetchMock = stubFetch({ ...emptyOnboarding(), roles: [] });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProfileSetup />);
    const chip = await screen.findByRole("button", { name: /^Software Engineer/ });
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText(/Add your resume/)).toBeTruthy();
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(JSON.parse(String((patch![1] as RequestInit).body)).roles).toContain("Software Engineer");
    });
  });

  it("checklist rows focus their editor", async () => {
    vi.stubGlobal("fetch", stubFetch({ ...emptyOnboarding(), roles: ["Software Engineer"] }));
    render(<ProfileSetup />);
    const row = await screen.findByRole("button", { name: /Add Work links/ });
    fireEvent.click(row);
    expect(await screen.findByText(/Show your work/)).toBeTruthy();
  });

  it("ready state commits to finding a referrer", async () => {
    vi.stubGlobal("fetch", stubFetch({ ...emptyOnboarding(), roles: ["Software Engineer"], links: ["LinkedIn"], city: "Bengaluru", resume: { id: "a", fileName: "cv.pdf", mimeType: "application/pdf", byteSize: 1, storageKey: "k" } }));
    render(<ProfileSetup />);
    expect(await screen.findByText(/% complete/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Find a referrer/ }).getAttribute("href")).toBe("/explore");
    expect(screen.getByRole("link", { name: /Set alerts/ }).getAttribute("href")).toBe("/alerts");
  });

  it("tells the seeker when saving failed and offers a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH") return { ok: false, status: 500, json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => ({ ...emptyOnboarding(), roles: ["Software Engineer"] }) } as Response;
    }));
    render(<ProfileSetup />);
    const row = await screen.findByRole("button", { name: /Add Work links/ });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /^LinkedIn$/ }));
    expect(await screen.findByText(/could not save/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("asks signed-out visitors to sign in for uploads and warns answers are not saved", async () => {
    authState.isSignedIn = false;
    render(<ProfileSetup />);
    expect(await screen.findByTestId("goal-onboarding")).toBeTruthy();
    expect(screen.getByText(/Not saved yet/)).toBeTruthy();
    const row = screen.getByRole("button", { name: /Add Resume/ });
    fireEvent.click(row);
    const cta = await screen.findByRole("button", { name: /Sign in to upload/ });
    fireEvent.click(cta);
    expect(openSignIn).toHaveBeenCalled();
  });

  it("flags off keeps the kit wizard", async () => {
    flagState.on = false;
    vi.stubGlobal("fetch", stubFetch(emptyOnboarding()));
    render(<ProfileSetup />);
    expect(await screen.findByText(/STEP 1 OF 6/)).toBeTruthy();
    expect(screen.queryByTestId("goal-onboarding")).toBeNull();
  });
});
