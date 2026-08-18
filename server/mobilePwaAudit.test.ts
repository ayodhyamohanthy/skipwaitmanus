import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("comprehensive mobile-PWA audit safeguards", () => {
  it("ships installed-app metadata, safe-area support, display fallback, and quick actions", () => {
    const html = source("client/index.html");
    const viteConfig = source("vite.config.ts");
    const css = source("client/src/index.css");

    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(viteConfig).toContain('display_override: ["standalone", "minimal-ui", "browser"]');
    expect(viteConfig).toContain('name: "Request a referral"');
    expect(viteConfig).toContain('name: "Give referrals"');
    expect(css).toContain("overscroll-behavior-y: contain");
    expect(css).toContain("touch-action: manipulation");
    expect(css).toContain("focus-visible");
  });

  it("uses role-appropriate mobile keyboards and direct Enter actions in the Job Seeker and Referrer flows", () => {
    const onboarding = source("client/src/pages/Onboarding.tsx");
    const workEmail = source("client/src/components/WorkEmailSignIn.tsx");

    expect(onboarding).toContain('inputMode="url"');
    expect(onboarding).toContain('enterKeyHint="next"');
    expect(onboarding).toContain('autoCapitalize="none"');
    expect(onboarding).toContain('autoCorrect="off"');
    expect(onboarding).toContain("spellCheck={false}");
    expect(onboarding).toContain('event.key === "Enter"');

    expect(workEmail).toContain('enterKeyHint="send"');
    expect(workEmail).toContain('enterKeyHint="done"');
    expect(workEmail).toContain('autoCapitalize="none"');
    expect(workEmail).toContain('autoCorrect="off"');
    expect(workEmail).toContain("spellCheck={false}");
    expect(workEmail).toContain("void sendCode()");
    expect(workEmail).toContain("void confirmCode()");
  });

  it("keeps financial account state server-verified and removes task-flow branding clutter", () => {
    const premium = source("client/src/pages/Premium.tsx");
    const plans = source("client/src/pages/Plans.tsx");

    expect(premium).toContain("useState<number | null>(null)");
    expect(premium).toContain("if (!isSignedIn) { setBalance(null); return; }");
    expect(premium).toContain("isSignedIn && balance !== null");
    expect(premium).not.toContain("readLocalBalance");
    expect(premium).not.toContain('from "@/components/Brand"');
    expect(plans).not.toContain('from "@/components/Brand"');
    expect(plans).not.toContain("<Brand />");
  });

  it("clears company-email session state at the signed-out privacy boundary", () => {
    const logoutPrivacy = source("client/src/lib/logoutPrivacy.ts");

    expect(logoutPrivacy).toContain('"skipwait:employee-sign-in-email"');
    expect(logoutPrivacy).toContain('"skipwait:company-coverage-invite"');
  });
});
