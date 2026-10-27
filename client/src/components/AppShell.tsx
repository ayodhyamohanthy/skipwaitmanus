// AppShell (D-048 phase 3, W0): the app frame moves onto the goal system.
// Every shell-wrapped route renders inside GoalShell (rail + top bar on
// desktop, top bar + bottom bar on phones) with the one navigation from
// goalNavFor (D-070/D-077): Find, My referrals, Inbox, plus Referral queue when
// the server's verdict says verified referrer. The account menu is carried
// over unchanged (its restyle is a later wave); the credits pill shows the
// live seeker summary and hides on referrer surfaces (D-055).
import { useAuth, useUser } from "@/_core/auth";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { readApiJson } from "@/lib/apiResponse";
import { failureMessage, parseSummary } from "@/components/plans/billingApi";
import { AccountMenu } from "./AccountMenu";
import { GoalShell, type GoalShellCredits } from "@/components/goal/GoalShell";
import type { GoalNavId } from "@/components/goal/nav";
import { GoalButton } from "@/components/goal/GoalButton";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

const authHeaders = (token: string | null | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

// Referrer surfaces never show a credits pill (D-055): referrers are never charged or paid.
const REFERRER_SURFACE = /^\/(queue|referrer(\/|$))/;
// DESIGN.md:72 + BRIEF.md §149: no bottom bar on an opened request (conversation, and its
// /thread alias) or under sheets; sheets arrive with the W1 drawer and wire in there.
const HIDE_BOTTOM_BAR = /^\/(conversation|messages|thread)\b/;

function activeNav(path: string): GoalNavId {
  if (path.startsWith("/queue")) return "queue";
  if (path.startsWith("/requests") || path.startsWith("/ask")) return "asks";
  if (path.startsWith("/inbox") || path.startsWith("/conversation") || path.startsWith("/messages")) return "inbox";
  return "find";
}

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/explore/, "Find a referral"],
  [/^\/requests/, "My referrals"],
  [/^\/ask/, "Ask for a referral"],
  [/^\/queue/, "Referral queue"],
  [/^\/inbox/, "Inbox"],
  [/^\/conversation/, "Conversation"],
  [/^\/alerts/, "Alerts"],
  [/^\/plans/, "Plans and credits"],
  [/^\/billing/, "Billing"],
  [/^\/profile/, "Profile"],
  [/^\/settings/, "Settings"],
  [/^\/help/, "Help and safety"],
  [/^\/referrer-home/, "Refer"],
];

function pageTitle(path: string): string {
  for (const [re, title] of PAGE_TITLES) if (re.test(path)) return title;
  return "skipwait.me";
}

function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "") || "·";
  }
  const handle = (email ?? "").split("@")[0] ?? "";
  return handle.slice(0, 2).toUpperCase() || "·";
}

export function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const access = useReferrerAccess();
  const verifiedReferrer = access.status === "verified";
  const onReferrerSurface = REFERRER_SURFACE.test(path);

  const creditsQuery = useQuery({
    queryKey: ["app-shell-credits", isSignedIn],
    enabled: Boolean(isSignedIn) && !onReferrerSurface,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers: authHeaders(await getToken()) });
      if (!response.ok) throw new Error(`Credit summary failed (${response.status})`);
      const payload = await readApiJson<Record<string, unknown>>(response, "Credit summary failed");
      const parsed = parseSummary(payload);
      if (!parsed) throw new Error("Credit summary unreadable");
      return parsed;
    },
  });

  const credits: GoalShellCredits = useMemo(() => {
    if (!isSignedIn || onReferrerSurface) return null;
    if (creditsQuery.data) return { state: "ready", count: creditsQuery.data.totalAvailable };
    if (creditsQuery.isError) return { state: "error", onRetry: () => { void creditsQuery.refetch(); } };
    return { state: "loading" };
  }, [isSignedIn, onReferrerSurface, creditsQuery.data, creditsQuery.isError, creditsQuery.refetch]);

  // The pill retries on its own after a failure without the user hunting for it.
  const _ = creditsQuery.failureCount;

  const account = useMemo(() => {
    if (!isLoaded || !isSignedIn) {
      return {
        initials: "·",
        menu: (
          <Link href="/sign-in">
            <GoalButton variant="ghost" size="sm">Sign in</GoalButton>
          </Link>
        ),
      };
    }
    return {
      initials: initialsFor(user?.fullName, user?.primaryEmailAddress?.emailAddress ?? null),
      // Carried over unchanged (phase-3 W0): the account menu restyles in a later wave.
      menu: <AccountMenu />,
    };
  }, [isLoaded, isSignedIn, user?.fullName, user?.primaryEmailAddress?.emailAddress]);

  return (
    <GoalShell
      active={activeNav(path)}
      verifiedReferrer={verifiedReferrer}
      pageTitle={pageTitle(path)}
      credits={credits}
      account={account}
      alertsHref="/alerts"
      showAlerts={isLoaded && isSignedIn === true}
      hideBottomBar={HIDE_BOTTOM_BAR.test(path)}
    >
      {children}
    </GoalShell>
  );
}

// Kept for any import sites that typed against the old export list.
export const SHELL_TABS: Array<{ to: string; label: string; shortLabel: string }> = [];
