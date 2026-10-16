// @vitest-environment jsdom
// FOUNDER-LOCKED login rule (owner, Oct 16 2026; AGENTS.md "Login rule", docs/DECISIONS.md D-030):
//   job seeker login = personal emails + social logins; referrer login = work email OTP verification ONLY.
// If this file fails, the rule drifted. Do not edit these expectations without the owner's explicit say-so.
import React from "react";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignIn from "./SignIn";
import { referrerSignInHref, safeReturnTo } from "@/lib/referrerSignIn";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/sign-in"],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("login rule: job seeker", () => {
  it("hands off to the hosted AuthKit screen, which offers personal email and every social login", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "" });
    render(<SignIn />);
    expect(screen.getByRole("button", { name: /Find a referral/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Continue to sign in/ }));
    expect(assign).toHaveBeenCalledWith("/api/auth/workos/sign-in?returnTo=%2Fexplore");
    expect(screen.getByRole("button", { name: /Create a free account/ })).toBeTruthy();
    expect(screen.queryByLabelText("Company email")).toBeNull();
  });
});

describe("login rule: referrer", () => {
  it("/sign-in?intent=referrer opens on Give a referral with the work-email OTP only", () => {
    window.history.replaceState({}, "", "/sign-in?intent=referrer&returnTo=%2Freferrer-home");
    render(<SignIn />);
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with (Google|Microsoft|GitHub)/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue to sign in/ })).toBeNull();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByRole("button", { name: /Create a free account/ })).toBeNull();
  });

  it("switching to Give a referral on the shared screen removes every personal and social option", () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
  });

  it("the OTP send call goes to the work-domain OTP route, never to WorkOS", () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => ({ sent: false }) }));
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "?intent=referrer" });
    render(<SignIn />);
    fireEvent.change(screen.getByLabelText("Company email"), { target: { value: "asha@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/otp/send");
    expect(assign).not.toHaveBeenCalled();
  });

  it("referrer sign-in links carry the referrer intent and only same-origin return paths", () => {
    expect(referrerSignInHref("/referrer-home")).toBe("/sign-in?intent=referrer&returnTo=%2Freferrer-home");
    expect(safeReturnTo("//evil.example")).toBe("/referrer-setup");
    expect(safeReturnTo("https://evil.example")).toBe("/referrer-setup");
    expect(safeReturnTo("/verify?company=wipro")).toBe("/verify?company=wipro");
  });

  it("no referrer-facing page opens the full AuthKit sign-in (SignInButton / openSignIn)", () => {
    for (const file of ["ReferrerSetup", "ReferrerHome", "ReferrerImpact", "Verify", "Referrer", "MyCompanyInbox"]) {
      const source = readFileSync(`client/src/pages/${file}.tsx`, "utf8");
      expect(source, `${file}.tsx must use referrerSignInHref / the OTP dialog`).not.toMatch(/SignInButton|openSignIn|auth\/workos/);
    }
    for (const file of ["components/referrer/ReferrerSignInDialog.tsx", "components/referrer/ReferrerWorkspace.tsx", "components/referrer/CapacitySettingsPanel.tsx", "components/ReferrerOtpSignIn.tsx"]) {
      expect(readFileSync(`client/src/${file}`, "utf8"), file).not.toMatch(/SignInButton|openSignIn|auth\/workos/);
    }
  });
});
