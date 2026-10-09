// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestDialog } from "./RequestDialog";
import type { LaunchCompany } from "@/lib/companies";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: false }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/explore/acme", go] }));

const company = { slug: "acme", name: "Acme", initials: "A" } as LaunchCompany;

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

  it("sends signed-out seekers to job-seeker login with a return to the ask composer", () => {
    const assign = vi.fn();
    const actual = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...actual, assign } });
    try {
      const { unmount } = render(<Harness />);
      try {
        fireEvent.change(screen.getByLabelText("Job posting link"), { target: { value: "https://careers.acme.com/jobs/design-lead" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        fireEvent.click(screen.getByRole("button", { name: "Sign in to continue" }));
        expect(assign).toHaveBeenCalledTimes(1);
        const target = String(assign.mock.calls[0]?.[0]);
        expect(target.startsWith("/api/auth/workos/sign-in?")).toBe(true);
        expect(target).toContain(`returnTo=${encodeURIComponent("/ask")}`);
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

  it("keeps signed-in seekers on the /ask composer path", () => {
    authState.isSignedIn = true;
    const { unmount } = render(<RequestDialog company={company} open step={3} onStepChange={() => undefined} onOpenChange={() => undefined} />);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Preview request" }));
      expect(go).toHaveBeenCalledWith("/ask");
    } finally {
      unmount();
    }
  });
});
