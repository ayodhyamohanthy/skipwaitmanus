// AppShell (D-048 phase 3, W0): the app frame moves onto the goal system.
// Every shell-wrapped route renders inside GoalShell (rail + top bar on
// desktop, top bar + bottom bar on phones) with the one navigation from
// goalNavFor (D-070/D-077): Find, My asks, Inbox, plus Referral queue when
// the server's verdict says verified referrer. The account menu is carried
// over unchanged (its restyle is a later wave); the credits pill shows the
// live seeker summary and hides on referrer surfaces (D-055).
import { useAuth, useUser } from "@/_core/auth";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { AccountMenu } from "./AccountMenu";
import { GoalShell } from "@/components/goal/GoalShell";
import { useGoalShellMeta } from "@/components/goal/useGoalShellMeta";
import { GoalButton } from "@/components/goal/GoalButton";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { useMemo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

// Referrer surfaces never show a credits pill (D-055): referrers are never charged or paid.
// F-credits: the pattern now also covers /referrer-home, /referrer-setup, /verify
// and /post-opportunity - the four routes the old pattern missed.
const REFERRER_SURFACE = /^\/(queue|referrer(\/|-|$)|verify|post-opportunity)/;
// DESIGN.md:72 + BRIEF.md §149: no bottom bar on an opened request (conversation, and its
// /thread alias) or under sheets; sheets arrive with the W1 drawer and wire in there.
const HIDE_BOTTOM_BAR = /^\/(conversation|messages|thread)\b/;

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
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const access = useReferrerAccess();
  const verifiedReferrer = access.status === "verified";
  const onReferrerSurface = REFERRER_SURFACE.test(path);

  // One balance query for the whole app (F-credits): the hook owns the fetch,
  // the error state and the retry; it returns null while disabled, so the pill
  // never flashes on a referrer surface. A failed load says so, never 0.
  const credits = useCreditBalance(Boolean(isSignedIn) && !onReferrerSurface);
  const { active, pageTitle } = useGoalShellMeta(path);

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
      active={active}
      verifiedReferrer={verifiedReferrer}
      pageTitle={pageTitle}
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
