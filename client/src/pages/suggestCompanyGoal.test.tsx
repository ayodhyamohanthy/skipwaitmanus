// @vitest-environment jsdom
// Goal /suggest-company (D-048-p3-seeker-small, dark): goal line, duplicate
// hint, validation gating, submit, sent state, flags-off kit control.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = { isSignedIn: true };
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken: async () => "tok" }), SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const flagState = { on: true };
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "suggest-company" };
});
vi.mock("@/hooks/usePersistFn", () => ({ usePersistFn: (fn: unknown) => fn }));
vi.mock("@/lib/companyDirectory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/companyDirectory")>();
  return { ...actual, useCompanyDirectory: () => ({ data: { companies: [] }, isError: false }) };
});

import SuggestCompany from "@/pages/SuggestCompany";

function fill() {
  fireEvent.change(screen.getByPlaceholderText("e.g. Freshworks"), { target: { value: "Quillmint" } });
  fireEvent.change(screen.getByPlaceholderText("freshworks.com"), { target: { value: "quillmint.ai" } });
}

describe("goal suggest company", () => {
  beforeEach(() => { authState.isSignedIn = true; flagState.on = true; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("opens on the goal with one gated commit", async () => {
    render(<SuggestCompany />);
    expect(await screen.findByTestId("goal-suggest-company")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Bring a company onto skipwait." })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Submit for review/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("submits and lands on the reviewed state with the next step", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) } as Response)));
    render(<SuggestCompany />);
    fill();
    const commit = await screen.findByRole("button", { name: /Submit for review/ });
    expect(commit.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(commit);
    expect(await screen.findByText(/Quillmint is in review/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Invite someone/ }).getAttribute("href")).toBe("/invite?mode=invite");
  });

  it("shows the duplicate hint and blocks the commit", async () => {
    const dir = await import("@/lib/companyDirectory");
    vi.spyOn(dir, "useCompanyDirectory").mockReturnValue({ data: { companies: [{ name: "Quillmint", slug: "quillmint" }] }, isError: false } as never);
    render(<SuggestCompany />);
    fill();
    expect(await screen.findByText(/already on skipwait.me/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Submit for review/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("gates the form behind sign-in", async () => {
    authState.isSignedIn = false;
    render(<SuggestCompany />);
    expect(await screen.findByTestId("goal-suggest-company")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("flags off keeps the kit form", async () => {
    flagState.on = false;
    render(<SuggestCompany />);
    expect(await screen.findByText(/GROW THE MAP/)).toBeTruthy();
    expect(screen.queryByTestId("goal-suggest-company")).toBeNull();
  });
});
