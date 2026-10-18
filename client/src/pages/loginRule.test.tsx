// @vitest-environment jsdom
// FOUNDER-LOCKED login rule (owner, Oct 16 2026; AGENTS.md "Login rule", docs/DECISIONS.md D-030):
//   job seeker login = personal emails + social logins; referrer login = work email OTP verification ONLY.
// If this file fails, the rule drifted. Do not edit these expectations without the owner's explicit say-so.
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignIn from "./SignIn";
import { SEEKER_SOCIAL, seekerSocialUrl } from "@/components/SeekerSignIn";
import { referrerSignInHref, safeReturnTo } from "@/lib/referrerSignIn";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/sign-in"],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("login rule: job seeker", () => {
  it("offers personal email and all five social logins, on skipwait.me (never a hosted authkit.app page)", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "" });
    render(<SignIn />);
    expect(screen.getByRole("button", { name: /Find a referral/ }).getAttribute("aria-pressed")).toBe("true");
    for (const provider of ["Google", "Microsoft", "LinkedIn", "Slack", "GitHub"]) expect(screen.getByRole("button", { name: new RegExp(`Continue with ${provider}`) })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue with email/ })).toBeTruthy();
    expect(screen.queryByLabelText("Company email")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(assign).toHaveBeenCalledWith("/api/auth/workos/sign-in?returnTo=%2Fexplore&provider=google");
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining("authkit.app"));
  });

  it("no seeker entry point links to a provider-less WorkOS sign-in, and the client never names the hosted AuthKit page", () => {
    // Added Oct 18 2026 (Drift-D030-seeker-signin): openSignIn, SignInButton, startLogin and the ask hand-off
    // linked to /api/auth/workos/sign-in with no provider, which opened the hosted authkit.app page.
    const sources = (readdirSync("client/src", { recursive: true }) as string[])
      .filter(file => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
      .map(file => ({ file: file.split("\\").join("/"), source: readFileSync(`client/src/${file}`, "utf8") }));
    expect(sources.length).toBeGreaterThan(100);
    for (const { file, source } of sources) {
      expect(source, `${file} must not name the hosted AuthKit page`).not.toMatch(/provider=authkit|provider:\s*["']authkit["']|authkit\.app/i);
      const workosStarts = source.match(/\/api\/auth\/workos\/sign-(?:in|up)/g) ?? [];
      if (file !== "components/SeekerSignIn.tsx") {
        expect(workosStarts, `${file} must send people to /sign-in, never to the WorkOS start route`).toEqual([]);
        continue;
      }
      // The only builder of a WorkOS start URL is seekerSocialUrl, and it always names the provider.
      expect(workosStarts).toHaveLength(1);
      const builder = source.slice(source.indexOf("export function seekerSocialUrl"), source.indexOf("export function seekerSocialUrl") + 220);
      expect(builder).toContain("/api/auth/workos/sign-in?");
      expect(builder).toContain("provider");
    }
    for (const item of SEEKER_SOCIAL) expect(seekerSocialUrl(item.id, "/explore")).toContain(`provider=${item.id}`);
  });

  it("email sign-in sends a code and verifies it against the email-code routes", async () => {
    const calls: Array<[string, unknown]> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => { calls.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => (url.endsWith("/send") ? { sent: true } : { signedIn: true }) }; }));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "" });
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " Asha@Gmail.com " } });
    fireEvent.click(screen.getByRole("button", { name: /Send sign-in code/ }));
    const codeInput = await screen.findByLabelText("Six-digit code");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(calls).toEqual([["/api/auth/workos/email-code/send", { email: "asha@gmail.com" }], ["/api/auth/workos/email-code/verify", { email: "asha@gmail.com", code: "123456" }]]);
  });
});

describe("login rule: referrer", () => {
  it("/sign-in?intent=referrer opens on Give a referral with the work-email OTP only", () => {
    window.history.replaceState({}, "", "/sign-in?intent=referrer&returnTo=%2Freferrer-home");
    render(<SignIn />);
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with (Google|Microsoft|GitHub)/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue with email/ })).toBeNull();
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
