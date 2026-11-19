// One signed-in render path for goal surfaces (D-048 phase 3, F-harness row).
// renderGoalSurface() wraps a surface in the live GoalAppShell with auth, the
// server's verified-referrer verdict, the credit balance and wouter mocked
// from a synthetic persona - never from a real session or a real backend.
//
// The network is impossible by default, not merely unlikely: globalThis.fetch
// is a recording stub that throws on any call, so a surface that reaches for
// data fails loudly instead of silently passing. A surface that legitimately
// loads data registers handlers with goalHarnessNetwork() and the stub then
// answers only those; goalHarnessFetch still records every call for the test
// to assert on.
//
// Import this module BEFORE the surface under test so the mocks register
// before the surface's module graph evaluates. GoalAppShell itself is pulled
// in by dynamic import inside renderGoalSurface for the same reason.

import React, { type ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import type { GoalNavId } from "@/components/goal/nav";
import type { CreditBalanceState } from "@/hooks/useCreditBalance";

export type GoalHarnessPersona = {
  /** Default true: the harness exists to render the signed-in shell. */
  signedIn?: boolean;
  /** Default "none": a plain seeker. The verdict a verified server returned. */
  referrer?: "verified" | "unverified" | "none";
  /** The one seeker credit balance: a count, "loading", "error", or null (pill hidden). */
  credits?: number | "loading" | "error" | null;
  /** Shell chrome. Defaults render the find tab titled "Test". */
  active?: GoalNavId;
  pageTitle?: string;
  /** Where wouter reports the app is. */
  path?: string;
};

type Persona = Required<GoalHarnessPersona>;

const DEFAULTS: Persona = { signedIn: true, referrer: "none", credits: 5, active: "find", pageTitle: "Test", path: "/explore" };
let persona: Persona = { ...DEFAULTS };

export const goalHarnessNavigation = { go: vi.fn() };

type FetchHandler = (url: string, init?: RequestInit) => unknown;
let fetchHandler: FetchHandler | null = null;

export const goalHarnessFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!fetchHandler) {
    throw new Error(`goalShellHarness: unexpected network call ${url} - register a handler with goalHarnessNetwork() or mock the data source`);
  }
  const body = fetchHandler(url, init) as { __status?: number } | undefined;
  if (body && typeof body === "object" && "__status" in body) {
    return { ok: false, status: body.__status, json: async () => ({ error: (body as { error?: string }).error }) } as Response;
  }
  return { ok: true, status: 200, json: async () => body ?? {} } as Response;
});

vi.stubGlobal("fetch", goalHarnessFetch);

/** Opt a surface into the data it loads. Pass null to make every call fail again. */
export function goalHarnessNetwork(handler: FetchHandler | null): void {
  fetchHandler = handler;
}

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: persona.signedIn,
    userId: persona.signedIn ? "fixture-user" : null,
    getToken: async () => "fixture-token",
    signOut: async () => undefined,
  }),
  useUser: () => ({
    user: persona.signedIn
      ? {
          fullName: "Asha Rao",
          primaryEmailAddress: { emailAddress: "asha@example.com" },
          emailAddresses: [{ emailAddress: "asha@example.com" }],
        }
      : null,
  }),
}));

vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => {
    if (!persona.signedIn) return { status: "signed-out" };
    if (persona.referrer === "verified") {
      return { status: "verified", access: { verified: true, domain: "example.com", companyName: "Example Co", companyInitials: "EX" } };
    }
    return { status: "unverified", access: { verified: false, domain: "", companyName: null, companyInitials: null } };
  },
}));

vi.mock("@/hooks/useCreditBalance", () => ({
  useCreditBalance: (enabled: boolean): CreditBalanceState => {
    if (!enabled || !persona.signedIn || persona.credits === null) return null;
    if (persona.credits === "loading") return { state: "loading" };
    if (persona.credits === "error") return { state: "error", onRetry: () => undefined };
    return { state: "ready", count: persona.credits };
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  useLocation: () => [persona.path, goalHarnessNavigation.go],
  useSearch: () => "",
}));

/** Reset the persona, navigation and network between tests. */
export function resetGoalHarness(): void {
  persona = { ...DEFAULTS };
  fetchHandler = null;
  goalHarnessFetch.mockClear();
  goalHarnessNavigation.go.mockClear();
}

/**
 * Render a surface inside the real GoalAppShell as the persona. Async because
 * GoalAppShell is imported only after the mocks above have registered.
 */
export async function renderGoalSurface(ui: ReactNode, options: GoalHarnessPersona = {}) {
  persona = { ...DEFAULTS, ...options };
  const { GoalAppShell } = await import("@/components/goal/GoalAppShell");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GoalAppShell active={persona.active} pageTitle={persona.pageTitle}>
        {ui}
      </GoalAppShell>
    </QueryClientProvider>,
  );
}
