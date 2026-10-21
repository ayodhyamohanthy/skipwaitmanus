// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestDialog } from "./RequestDialog";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: false }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken: async () => "tok" }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/explore/acme", go], Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const company = { slug: "acme", name: "Acme", initials: "A", domains: ["acme.com"] };

beforeEach(() => {
  authState.isSignedIn = false;
  go.mockReset();
  sessionStorage.clear();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("RequestDialog login handoff", () => {
  function Harness() {
    const [step, setStep] = useState(0);
    return <RequestDialog company={company} open step={step} onStepChange={setStep} onOpenChange={() => undefined} />;
  }

  it("sends signed-out seekers through the skipwait.me sign-in with a return to the ask composer", () => {
    const assign = vi.fn();
    const actual = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...actual, assign } });
    try {
      const { unmount } = render(<Harness />);
      try {
        fireEvent.change(screen.getByLabelText("Job posting link"), { target: { value: "https://careers.acme.com/jobs/design-lead" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.change(screen.getByLabelText("Why are you a strong fit?"), { target: { value: "Ran design ops for two product lines." } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.click(screen.getByRole("button", { name: "Sign in to continue" }));
        // D-030 / D-049: the on-site sign-in, never the provider-less WorkOS route (hosted AuthKit page).
        expect(assign).toHaveBeenCalledTimes(1);
        expect(assign).toHaveBeenCalledWith("/sign-in?returnTo=%2Fask");
        const saved = JSON.parse(sessionStorage.getItem("skipwait-ask-prefill") ?? "null") as unknown as { companySlug?: string; targetRoleUrl?: string } | null;
        expect(saved?.companySlug).toBe("acme");
        expect(saved?.targetRoleUrl).toBe("https://careers.acme.com/jobs/design-lead");
      } finally {
        unmount();
      }
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: actual });
    }
  });

  function fillToReview() {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Job posting link"), { target: { value: "https://careers.acme.com/jobs/design-lead" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Why are you a strong fit?"), { target: { value: "Ran design ops for two product lines." } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("saves a server draft for signed-in seekers and shows the truthful completion panel", async () => {
    authState.isSignedIn = true;
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ draft: { companySlug: "acme", targetRoleUrl: "https://careers.acme.com/jobs/design-lead", note: "Ran design ops for two product lines.", updatedAt: "x" } }) }));
    vi.stubGlobal("fetch", fetchMock);
    fillToReview();
    fireEvent.click(screen.getByRole("button", { name: "Preview request" }));
    expect(await screen.findByRole("heading", { name: "Your request is ready." })).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: string }];
    expect(url).toBe("/api/ask-drafts");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ companySlug: "acme", targetRoleUrl: "https://careers.acme.com/jobs/design-lead", note: "Ran design ops for two product lines." });
    expect(screen.getByText(/Nothing has been sent and no credit has been used/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See request tracking" }).getAttribute("href")).toBe("/requests");
    expect(screen.getByRole("link", { name: /Write a full ask/ }).getAttribute("href")).toBe("/ask");
    expect(document.body.textContent).not.toMatch(/DESIGN PREVIEW/);
  });

  it("says so and stays on the review step when the draft cannot be saved", async () => {
    authState.isSignedIn = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    fillToReview();
    fireEvent.click(screen.getByRole("button", { name: "Preview request" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not save your draft");
    expect(screen.queryByRole("heading", { name: "Your request is ready." })).toBeNull();
    await waitFor(() => expect((screen.getByRole("button", { name: "Preview request" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
