// AppShell (D-048 phase 3, W0): the app frame moves onto the goal system.
// Every shell-wrapped route renders inside GoalShell (rail + top bar on
// desktop, top bar + bottom bar on phones) with the one navigation from
// goalNavFor (D-070/D-077): Find, My asks, Inbox, plus Referral queue when
// the server's verdict says verified referrer. The account menu is carried
// over unchanged (its restyle is a later wave); the person's referral count
// uses the live seeker summary on every signed-in route (D-222).
import { useAuth, useUser } from "@/_core/auth";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { AccountMenu } from "./AccountMenu";
import { GoalShell } from "@/components/goal/GoalShell";
import { useGoalShellMeta } from "@/components/goal/useGoalShellMeta";
import { GoalLanguageConsent } from "@/components/goal/GoalLanguageConsent";
import { GoalLanguagePicker } from "@/components/goal/GoalLanguagePicker";
import { GoalButton } from "@/components/goal/GoalButton";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { useMemo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

// Referrer surfaces show only the person's count, without plan/purchase linkage
// (D-222). The D-055 no-pay/no-charge rule and D-057 session gate stay intact.
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
  // D-057 (§0b.8c): a server-verified referrer whose session is code_required keeps
  // the referrer navigation; the surfaces themselves show the in-place step-up.
  const verifiedReferrer = access.status === "verified" || access.status === "code_required";
  const onReferrerSurface = REFERRER_SURFACE.test(path);

  // One person-owned balance query for the whole app; the existing hook owns
  // its fetch, error and retry. A failed load says so, never 0 (D-222).
  const credits = useCreditBalance(Boolean(isSignedIn));
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
      referralCountLinked={!onReferrerSurface}
      account={account}
      languagePicker={isLoaded && !isSignedIn ? <GoalLanguagePicker variant="bar" className="max-w-28" /> : null}
      alertsHref="/alerts"
      showAlerts={isLoaded && isSignedIn === true}
      hideBottomBar={HIDE_BOTTOM_BAR.test(path)}
    >
      <GoalLanguageConsent />
      {children}
    </GoalShell>
  );
}

// Kept for any import sites that typed against the old export list.
export const SHELL_TABS: Array<{ to: string; label: string; shortLabel: string }> = [];
